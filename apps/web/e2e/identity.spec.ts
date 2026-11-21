import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@cafm/db';

// Reads the emails the app queued (the worker isn't running in e2e), as the owner.
const owner = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
});
test.afterAll(() => owner.$disconnect());

async function linkFromEmail(to: string, path: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const msg = await owner.outboxMessage.findFirst({
      where: { topic: 'email.send', payload: { path: ['to'], equals: to } },
      orderBy: { createdAt: 'desc' },
    });
    const match = (msg?.payload as { text?: string } | undefined)?.text?.match(new RegExp(`(/${path}/[A-Za-z0-9_-]+)`));
    if (match) return match[1]!;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No ${path} email to ${to}`);
}

async function noAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
}

const FIRST_PASSWORD = `Pw-${crypto.randomUUID()}`;
const NEW_PASSWORD = `Pw-${crypto.randomUUID()}`;

test.describe('invites and password reset', () => {
  test.describe.configure({ mode: 'serial' });
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.example`;

  test.afterAll(async () => {
    const account = await owner.account.findUnique({ where: { email } });
    if (!account) return;
    await owner.session.deleteMany({ where: { accountId: account.id } });
    await owner.authEvent.deleteMany({ where: { accountId: account.id } });
    await owner.membership.deleteMany({ where: { accountId: account.id } });
    await owner.passwordReset.deleteMany({ where: { accountId: account.id } });
    await owner.account.delete({ where: { id: account.id } });
  });

  test('an invited person sets a password, accepts the terms and lands in the app', async ({ page }) => {
    // The Super User sends the invite through the API, as the people screen will.
    await page.goto('/login');
    await page.getByRole('button', { name: /^Super User\W+Sam Sutton/ }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
    const res = await page.request.post('/api/people/invites', { data: { email, role: 'helpdesk' } });
    expect(res.status()).toBe(201);
    await page.context().clearCookies();

    await page.goto(await linkFromEmail(email, 'accept-invite'));
    await expect(page.getByRole('heading', { name: 'Join Demo Estates Ltd' })).toBeVisible();
    await expect(page.getByText('as Helpdesk Operator')).toBeVisible();
    await noAxeViolations(page);

    await page.getByLabel('Your name').fill('Eve Tester');
    await page.getByLabel('New password', { exact: true }).fill(FIRST_PASSWORD);
    await page.getByLabel('Confirm new password').fill(FIRST_PASSWORD);
    await page.getByRole('button', { name: 'Accept and join' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      'Accept the terms of service to continue.',
    );
    await page.getByLabel('I accept the').check();
    await page.getByRole('button', { name: 'Accept and join' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: /, Eve$/ })).toBeVisible();
  });

  test('they reset their password from the emailed link and sign in with the new one', async ({ page }) => {
    await page.goto('/forgot-password');
    await noAxeViolations(page);
    await page.getByLabel('Email or username').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If an account exists');

    await page.goto(await linkFromEmail(email, 'reset-password'));
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await noAxeViolations(page);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByRole('status')).toContainText('Your password has been changed');

    await page.goto('/login');
    await page.getByLabel('Email or username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test('a used reset link says so', async ({ page }) => {
    await page.goto(await linkFromEmail(email, 'reset-password'));
    await expect(page.getByText('This link has expired or has already been used.')).toBeVisible();
  });

  test('the demo explains that demo passwords can’t be reset', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByText('This is the demo')).toBeVisible();
  });
});
