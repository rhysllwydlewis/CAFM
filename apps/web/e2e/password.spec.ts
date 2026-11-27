import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@fmstead/db';

const owner = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
});
test.afterAll(() => owner.$disconnect());

async function noAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
}

const PASSWORD = `Pw-${crypto.randomUUID()}`;
const NEXT_PASSWORD = `Pw-${crypto.randomUUID()}`;

test.describe('changing your own password', () => {
  test.describe.configure({ mode: 'serial' });
  const email = `e2e-password-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.example`;

  test.afterAll(async () => {
    const account = await owner.account.findUnique({ where: { email } });
    if (!account) return;
    await owner.session.deleteMany({ where: { accountId: account.id } });
    await owner.authEvent.deleteMany({ where: { accountId: account.id } });
    await owner.membership.deleteMany({ where: { accountId: account.id } });
    await owner.account.delete({ where: { id: account.id } });
  });

  test('a person changes it from Account security and signs in with the new one', async ({ page }) => {
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
    await page.getByLabel('Your name').fill('Pat Tester');
    await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm new password').fill(PASSWORD);
    await page.getByLabel('I accept the').check();
    await page.getByRole('button', { name: 'Accept and join' }).click();
    await expect(page).toHaveURL(/\/app$/);

    await page.goto('/app/account/security');
    await expect(page.getByRole('heading', { name: 'Account security' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Change your password' })).toBeVisible();
    await noAxeViolations(page);

    const change = page.getByRole('button', { name: 'Change password' });
    // The two new passwords must match.
    await page.getByLabel('Current password').fill(PASSWORD);
    await page.getByLabel('New password', { exact: true }).fill(NEXT_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEXT_PASSWORD + 'x');
    await change.click();
    await expect(page.locator('#password-error')).toContainText('The new passwords don’t match.');

    // A wrong current password, then a weak new one, are each refused with the reason.
    await page.getByLabel('Current password').fill('not-my-password');
    await page.getByLabel('Confirm new password').fill(NEXT_PASSWORD);
    await change.click();
    await expect(page.locator('#password-error')).toContainText('Your current password is not right.');
    await page.getByLabel('Current password').fill(PASSWORD);
    await page.getByLabel('New password', { exact: true }).fill('short');
    await page.getByLabel('Confirm new password').fill('short');
    await change.click();
    await expect(page.locator('#password-error')).toContainText('Use at least 12 characters');
    await noAxeViolations(page);

    // The right values change it, and this device stays signed in.
    await page.getByLabel('New password', { exact: true }).fill(NEXT_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEXT_PASSWORD);
    await change.click();
    await expect(page.getByRole('status')).toContainText('Your password has been changed.');
    await expect(page.getByLabel('Current password')).toHaveValue('');
    expect((await page.request.get('/api/auth/me')).status()).toBe(200);

    // The new password signs in. (That the old one no longer does is covered by the API test; a failed sign-in
    // here would count against the IP limit that every end-to-end test shares.)
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('Email or username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(NEXT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
  });
});
