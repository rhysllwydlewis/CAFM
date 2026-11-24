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

test('shows the standard reports and lets the period change', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/app/reports');
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  for (const name of ['Open jobs by age', 'SLA performance', 'PPM compliance', 'Reactive and planned work']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  await assertAccessible(page);

  await page.getByLabel('From').fill('2026-01-01');
  await page.getByLabel('To').fill('2026-01-31');
  await page.getByRole('button', { name: 'Update' }).click();
  await expect(page).toHaveURL(/from=2026-01-01&to=2026-01-31/);
  await expect(page.getByText('1 Jan 2026 to 31 Jan 2026')).toBeVisible();
});

test('keeps people without report access out', async ({ page }) => {
  await signInAs(page, 'requester');
  await page.goto('/app/reports');
  await expect(page.getByRole('heading', { name: /doesn’t include Reports/ })).toBeVisible();
});

test('shows the key figures on the home page for people who can read reports', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/app');
  const figures = page.getByRole('region', { name: 'Key figures' });
  await expect(figures.getByText('Open work orders')).toBeVisible();
  await expect(figures.getByText('SLA met, last 30 days')).toBeVisible();
  await expect(figures.getByText('PPM on time, last 30 days')).toBeVisible();
  await assertAccessible(page);
  await signInAs(page, 'requester');
  await page.goto('/app');
  await expect(page.getByRole('region', { name: 'Key figures' })).toHaveCount(0);
});

test('shows the executive overview and keeps people without report access out', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/app/reports');
  await page.getByRole('link', { name: 'Executive overview' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Executive overview' })).toBeVisible();
  const figures = page.getByRole('region', { name: 'Key figures' });
  await expect(figures.getByText('Reactive share of work')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Busiest sites' })).toBeVisible();
  await assertAccessible(page);
  await signInAs(page, 'requester');
  await page.goto('/app/reports/executive');
  await expect(page.getByRole('heading', { name: /doesn’t include Reports/ })).toBeVisible();
});
