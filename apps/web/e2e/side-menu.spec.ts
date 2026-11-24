import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('superuser@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([]);
}

test.describe('side menu on a desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('collapses to an icon rail, keeps the names for screen readers, and remembers the choice', async ({ page }) => {
    await signIn(page);
    await page.goto('/app');
    const menu = page.getByRole('complementary', { name: 'Main' });
    const widthOf = async () => (await menu.boundingBox())?.width ?? 0;
    await expect.poll(widthOf).toBeGreaterThan(240);

    await page.getByRole('button', { name: 'Collapse side menu' }).click();
    await expect.poll(widthOf).toBeLessThan(80);
    // The link is still named by its label, and shows it as a tooltip.
    const helpdesk = menu.getByRole('link', { name: 'Helpdesk' });
    await expect(helpdesk).toHaveAttribute('title', 'Helpdesk');
    await expect(helpdesk).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Expand side menu' })).toHaveAttribute('aria-expanded', 'false');
    await assertAccessible(page);

    // Still collapsed after a reload, with no flash of the full menu: the server reads the cookie.
    await page.reload();
    await expect.poll(widthOf).toBeLessThan(80);

    await page.getByRole('button', { name: 'Expand side menu' }).click();
    await expect.poll(widthOf).toBeGreaterThan(240);
    await page.reload();
    await expect.poll(widthOf).toBeGreaterThan(240);
  });

  test('the account menu still opens from the collapsed rail', async ({ page }) => {
    await signIn(page);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Collapse side menu' }).click();
    await page.getByRole('button', { name: /Account and settings/ }).click();
    await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });
});

test.describe('side menu on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('has no collapse button, because the menu is a drawer there', async ({ page }) => {
    await signIn(page);
    await page.goto('/app');
    await expect(page.getByRole('button', { name: 'Collapse side menu' })).toBeHidden();
  });
});
