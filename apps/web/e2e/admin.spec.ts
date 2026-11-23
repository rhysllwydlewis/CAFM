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

test('a Super User edits a custom role in the roles matrix', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin/roles');
  await expect(page.getByRole('heading', { name: /^Role: / })).toBeVisible();
  await assertAccessible(page);

  const name = 'E2E role ' + Date.now();
  await page.getByLabel('New role').fill(name);
  await page.getByRole('button', { name: 'Create role' }).click();
  await expect(page.getByRole('heading', { name: 'Role: ' + name })).toBeVisible();
  await page.getByLabel('See assets', { exact: true }).check();
  await page.getByRole('button', { name: 'Save role' }).click();
  await expect(page.getByText('Role saved.')).toBeVisible();
  await expect(page.getByLabel('See assets', { exact: true })).toBeChecked();
  await assertAccessible(page);

  await page.getByRole('button', { name: 'Delete role' }).click();
  await expect(page.getByText('Role deleted.')).toBeVisible();
});

test('a Super User creates and deletes a team', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin/teams');
  await expect(page.getByRole('heading', { name: 'Field engineers' })).toBeVisible();
  const name = 'E2E team ' + Date.now();
  await page.getByLabel('Team name').fill(name);
  await page.getByRole('group', { name: 'Members', exact: true }).getByLabel('Tom Price').check();
  await page.getByRole('button', { name: 'Create team' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await assertAccessible(page);
  await page
    .locator('section', { has: page.getByRole('heading', { name }) })
    .getByRole('button', { name: 'Delete team' })
    .click();
  await expect(page.getByRole('heading', { name })).toHaveCount(0);
});

test('a technician cannot open the roles or teams screens', async ({ page }) => {
  await signInAs(page, 'technician');
  await page.goto('/app/admin/roles');
  await expect(page).not.toHaveURL(/\/app\/admin/);
  await page.goto('/app/admin/teams');
  await expect(page).not.toHaveURL(/\/app\/admin/);
});

test('a helpdesk operator can read teams but not change them', async ({ page }) => {
  await signInAs(page, 'helpdesk');
  await page.goto('/app/admin/teams');
  await expect(page).toHaveURL(/\/app\/admin\/teams/);
  await expect(page.getByRole('heading', { name: 'Field engineers' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create team' })).toHaveCount(0);
  await assertAccessible(page);
});
