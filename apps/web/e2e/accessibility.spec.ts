import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// WCAG 2.2 AA is the target (doc 09); axe covers the automatable part.
async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test.describe('accessibility', () => {
  test('login page, before and after choosing a demo account', async ({ page }) => {
    await page.goto('/login');
    await expectNoViolations(page);
    await page.getByRole('button', { name: 'Show all 16 demo roles ▾' }).click();
    await page.getByRole('button', { name: /^Helpdesk\W+Hana Patel/ }).click();
    await expectNoViolations(page);
  });

  test('login error state', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#login-error')).toBeVisible();
    await expectNoViolations(page);
  });

  test('forgot password page', async ({ page }) => {
    await page.goto('/forgot-password');
    await expectNoViolations(page);
  });

  test('home', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^FM Manager\W+Morgan Ellis/ }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expectNoViolations(page);
  });

  test('the demo cards and sign-in work from the keyboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^Requester\W+Riley Morgan/ }).focus();
    await page.keyboard.press('Enter');
    // Choosing a card moves focus to Sign in, so Enter signs in.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app$/);
  });
});
