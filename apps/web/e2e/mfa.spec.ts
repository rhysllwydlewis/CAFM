import { createHmac } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@cafm/db';

const owner = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
});
test.afterAll(() => owner.$disconnect());

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** The 6-digit code an authenticator app shows for a base32 secret, `offset` 30-second steps from now. */
function totp(secret: string, offset = 0): string {
  let bits = 0;
  let value = 0;
  const key: number[] = [];
  for (const ch of secret.replace(/\s+/g, '')) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      key.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const mac = createHmac('sha1', Buffer.from(key)).update(counter).digest();
  const at = mac[mac.length - 1]! & 15;
  return String((mac.readUInt32BE(at) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function noAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
}

const PASSWORD = `Pw-${crypto.randomUUID()}`;

test.describe('two-step verification', () => {
  test.describe.configure({ mode: 'serial' });
  const email = `e2e-mfa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.example`;

  test.afterAll(async () => {
    const account = await owner.account.findUnique({ where: { email } });
    if (!account) return;
    await owner.session.deleteMany({ where: { accountId: account.id } });
    await owner.authEvent.deleteMany({ where: { accountId: account.id } });
    await owner.membership.deleteMany({ where: { accountId: account.id } });
    await owner.account.delete({ where: { id: account.id } });
  });

  test('a person turns it on, then needs a code to sign in, and a recovery code works once', async ({ page }) => {
    // Set up a real (non-demo) person through an invite.
    await page.goto('/login');
    await page.getByRole('button', { name: /^Super User\W+Sam Sutton/ }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
    expect((await page.request.post('/api/people/invites', { data: { email, role: 'helpdesk' } })).status()).toBe(201);
    await page.context().clearCookies();
    let link: string | undefined;
    for (let i = 0; i < 20 && !link; i++) {
      const msg = await owner.outboxMessage.findFirst({
        where: { topic: 'email.send', payload: { path: ['to'], equals: email } },
        orderBy: { createdAt: 'desc' },
      });
      link = (msg?.payload as { text?: string } | undefined)?.text?.match(/(\/accept-invite\/[A-Za-z0-9_-]+)/)?.[1];
      if (!link) await new Promise((r) => setTimeout(r, 250));
    }
    await page.goto(link!);
    await page.getByLabel('Your name').fill('Mia Tester');
    await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm new password').fill(PASSWORD);
    await page.getByLabel('I accept the').check();
    await page.getByRole('button', { name: 'Accept and join' }).click();
    await expect(page).toHaveURL(/\/app$/);

    // Turn it on.
    await page.goto('/app/account/security');
    await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
    await noAxeViolations(page);
    await page.getByRole('button', { name: 'Set up' }).click();
    await expect(page.getByRole('heading', { name: 'Set up two-step verification' })).toBeVisible();
    await noAxeViolations(page);
    const secret = (await page
      .locator('.medium')
      .filter({ hasText: /^[A-Z2-7]{32}$/ })
      .textContent())!;
    await page.getByLabel('2. Enter the 6-digit code').fill('000000');
    await page.getByRole('button', { name: 'Turn on two-step verification' }).click();
    await expect(page.locator('#mfa-setup-error')).toContainText('That code is not right');
    await page.getByLabel('2. Enter the 6-digit code').fill(totp(secret));
    await page.getByRole('button', { name: 'Turn on two-step verification' }).click();
    await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
    await noAxeViolations(page);
    const recovery = (await page
      .getByRole('list', { name: 'Recovery codes' })
      .getByRole('listitem')
      .first()
      .textContent())!;
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('10 recovery codes left')).toBeVisible();

    // Signing in now asks for a code.
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('Email or username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login\/mfa/);
    await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
    await noAxeViolations(page);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);

    // Back through the password step, then use a recovery code.
    await page.getByLabel('Email or username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Use a recovery code' }).click();
    await page.getByLabel('Recovery code').fill(recovery);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/app$/);

    // The code is spent.
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('Email or username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Use a recovery code' }).click();
    await page.getByLabel('Recovery code').fill(recovery);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.locator('#mfa-error')).toContainText('That code is not right');
  });
});
