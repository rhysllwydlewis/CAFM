import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@fmstead/db';

// Issue #120: a person whose password an administrator generated is held on a change-password step until they choose
// their own.

async function signInAsSuperUser(page: Page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('superuser@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('FmsDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test('someone given a password by an administrator must choose their own before anything else opens', async ({
  page,
}) => {
  const username = 'hold' + randomUUID().slice(0, 6);
  const chosen = 'Quiet-Harbour-Lamp-' + randomUUID().slice(0, 4);
  await signInAsSuperUser(page);
  const made = await page.request.post('/api/admin/username-accounts', {
    data: { name: 'Held Operative', username, role: 'technician' },
  });
  expect(made.status()).toBe(201);
  const { temporaryPassword } = (await made.json()) as { temporaryPassword: string };

  try {
    await page.context().clearCookies();
    await page.goto('/t/demo-estates/login');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password', { exact: true }).fill(temporaryPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Held on the change-password step, and sent back to it from anywhere else.
    await expect(page).toHaveURL(/\/password-change$/);
    await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
    await page.goto('/app');
    await expect(page).toHaveURL(/\/password-change$/);
    await page.goto('/m');
    await expect(page).toHaveURL(/\/password-change$/);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);

    // The wrong current password is explained beside its field and does not release them.
    await page.getByLabel('Current password').fill('not-the-password-at-all');
    await page.getByLabel('New password', { exact: true }).fill(chosen);
    await page.getByLabel('Confirm new password').fill(chosen);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Your current password is not right.')).toBeVisible();
    await expect(page).toHaveURL(/\/password-change$/);

    // Their own password releases them, and the app opens.
    await page.getByLabel('Current password').fill(temporaryPassword);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/password-change');
    await expect(page).toHaveURL(/\/app$/);
  } finally {
    const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    const accounts = await db.account.findMany({
      where: { username: `${username}@demo-estates` },
      select: { id: true },
    });
    const ids = accounts.map((a) => a.id);
    await db.session.deleteMany({ where: { accountId: { in: ids } } });
    await db.membership.deleteMany({ where: { accountId: { in: ids } } });
    await db.account.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
