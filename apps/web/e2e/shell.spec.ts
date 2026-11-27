import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function signInAs(page: Page, persona: string) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(`${persona}@demo.example`);
  await page.getByLabel('Password', { exact: true }).fill('FmsDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function noAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

const modules = (page: Page) => page.getByRole('navigation', { name: 'Modules' });

test.describe('app shell', () => {
  test('the menu shows what the role can use', async ({ page, isMobile }) => {
    await signInAs(page, 'superuser');
    if (isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(modules(page).getByRole('link', { name: 'Administration' })).toBeVisible();
    await expect(modules(page).getByRole('link', { name: 'Work orders' })).toBeVisible();

    await page.context().clearCookies();
    await signInAs(page, 'requester');
    if (isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(modules(page).getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(modules(page).getByRole('link', { name: 'Bookings' })).toBeVisible();
    await expect(modules(page).getByRole('link', { name: 'Work orders' })).toHaveCount(0);
    await expect(modules(page).getByRole('link', { name: 'Administration' })).toHaveCount(0);
  });

  test('a module the plan doesn’t include is locked and says which plan unlocks it', async ({ page }) => {
    await signInAs(page, 'starter');
    await page.goto('/app/inspections');
    await expect(
      page.getByRole('heading', { name: 'Compliance and inspections is part of the Professional plan' }),
    ).toBeVisible();
    await noAxeViolations(page);
    // A module the plan includes but that isn't built yet says when it arrives.
    await page.goto('/app/documents');
    await expect(page.getByRole('heading', { name: 'Coming in Phase 2A' })).toBeVisible();
  });

  test('a role without access to a module is told so', async ({ page }) => {
    await signInAs(page, 'requester');
    await page.goto('/app/work-orders');
    await expect(page.getByRole('heading', { name: 'Your role doesn’t include Work orders' })).toBeVisible();
  });

  test('Ctrl+K jumps to any page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard shortcut is for desktop; phones use the menu');
    await signInAs(page, 'manager');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Go to' });
    await expect(dialog).toBeVisible();
    await noAxeViolations(page);
    await page.keyboard.type('assets');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app\/assets$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Assets' })).toBeVisible();
  });

  test('the dark theme is kept and accessible', async ({ page, isMobile }) => {
    await signInAs(page, 'manager');
    if (isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('button', { name: /^Account and settings/ }).click();
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await noAxeViolations(page);
  });

  test('notifications open in a drawer', async ({ page }) => {
    await signInAs(page, 'helpdesk');
    await page.getByRole('button', { name: 'Notifications' }).click();
    const drawer = page.getByRole('dialog', { name: 'Notifications' });
    await expect(drawer).toContainText('You’re all caught up');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });

  test('on a phone the menu opens as a drawer and closes with Escape', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only');
    await signInAs(page, 'helpdesk');
    await expect(modules(page)).toBeHidden();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(modules(page)).toBeVisible();
    await noAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(modules(page)).toBeHidden();
  });
});
