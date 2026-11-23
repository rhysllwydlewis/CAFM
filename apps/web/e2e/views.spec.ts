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

test('a manager saves the work order filters as a view, reopens it and deletes it', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/app/work-orders?view=all&priority=1');
  const name = 'Emergency ' + Date.now();
  await page.getByRole('button', { name: 'Save current filters as a view' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(page).toHaveURL(/view_id=/);
  await expect(page).toHaveURL(/priority=1/);
  await expect(page.getByRole('combobox', { name: 'Saved view' })).toContainText(name);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);

  await page.goto('/app/work-orders');
  await page.getByRole('combobox', { name: 'Saved view' }).selectOption({ label: name });
  await expect(page).toHaveURL(/priority=1/);
  await expect(page.locator('select[name="priority"]')).toHaveValue('1');

  await page.getByRole('button', { name: 'Delete view' }).click();
  await expect(page).not.toHaveURL(/view_id=/);
  await expect(page.getByRole('combobox', { name: 'Saved view' })).not.toContainText(name);
});

test('a manager sorts the work orders by title and keeps the order in a saved view', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/app/work-orders?view=all');
  await page.getByLabel('Sort by').selectOption('title');
  await page.getByLabel('Sort order').selectOption('asc');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(/dir=asc/);
  const titles = await page
    .locator('tbody tr')
    .evaluateAll((rows) => rows.map((row) => row.querySelector('a.medium')?.textContent?.trim() ?? ''));
  expect(titles.length).toBeGreaterThan(1);
  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
