import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function signInAs(page: Page, persona: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(persona + '@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([]);
}

test('a Super User sees the admin overview and the users list', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible();
  await expect(page.getByText('Active users', { exact: true })).toBeVisible();
  await expect(page.getByText(/Setup checklist/)).toBeVisible();
  await assertAccessible(page);

  await page.getByRole('link', { name: 'Users and licences' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/users$/);
  await expect(page.getByRole('heading', { name: /^People/ })).toBeVisible();
  const table = page.getByRole('table', { name: /^People/ });
  await expect(table.getByText('Sam Sutton', { exact: true })).toBeVisible();
  await page.getByLabel('Search people').fill('Tom');
  await expect(table.getByText('Tom Price', { exact: true })).toBeVisible();
  await expect(table.getByText('Sam Sutton', { exact: true })).toHaveCount(0);
  await assertAccessible(page);
});

test('a requester is kept out of the admin console', async ({ page }) => {
  await signInAs(page, 'requester');
  await page.goto('/app/admin');
  await expect(page).not.toHaveURL(/\/app\/admin/);
});
