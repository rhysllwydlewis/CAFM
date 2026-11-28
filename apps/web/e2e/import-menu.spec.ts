import { expect, test, type Page } from '@playwright/test';

// Issue #104: Import and export has its own menu entry for anyone who can import or export, so a Planner, who has no
// Administration item, can find it.

async function signInAs(page: Page, persona: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(`${persona}@demo.example`);
  await page.getByLabel('Password', { exact: true }).fill('FmsDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

const modules = (page: Page) => page.getByRole('navigation', { name: 'Modules' });

async function openMenu(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click();
}

test('a Planner has no Administration item but reaches Import and export from the menu', async ({ page, isMobile }) => {
  await signInAs(page, 'planner');
  await openMenu(page, isMobile);
  await expect(modules(page).getByRole('link', { name: 'Administration' })).toHaveCount(0);
  await modules(page).getByRole('link', { name: 'Import and export' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/import$/);
  await expect(page).toHaveTitle(/Import and export/);
  await openMenu(page, isMobile);
  await expect(modules(page).getByRole('link', { name: 'Import and export' })).toHaveAttribute('aria-current', 'page');
});

test('someone with both items sees Import and export marked as current, and Administration is not', async ({
  page,
  isMobile,
}) => {
  await signInAs(page, 'manager');
  await openMenu(page, isMobile);
  await expect(modules(page).getByRole('link', { name: 'Administration' })).toBeVisible();
  await modules(page).getByRole('link', { name: 'Import and export' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/import$/);
  await openMenu(page, isMobile);
  await expect(modules(page).getByRole('link', { name: 'Import and export' })).toHaveAttribute('aria-current', 'page');
  await expect(modules(page).getByRole('link', { name: 'Administration' })).not.toHaveAttribute('aria-current', 'page');
});

test('a requester, who can neither import nor export, has no Import and export item', async ({ page, isMobile }) => {
  await signInAs(page, 'requester');
  await openMenu(page, isMobile);
  await expect(modules(page).getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(modules(page).getByRole('link', { name: 'Import and export' })).toHaveCount(0);
});
