import { expect, test } from '@playwright/test';

test.describe('sign in with a demo account', () => {
  test('a demo card fills the form, and signing in lands on Home', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByRole('button', { name: /^Technician: Tom Price/ }).click();
    await expect(page.getByLabel('Email or username')).toHaveValue('technician@demo.example');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('CafmDemo!2026');
    await expect(page.getByRole('button', { name: /^Technician: Tom Price/ })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Tom$/ })).toBeVisible();
    await expect(page.getByText('Demo Estates Ltd').first()).toBeVisible();
  });

  test('all 16 demo roles can be shown', async ({ page }) => {
    await page.goto('/login');
    const cards = page.getByRole('region', { name: 'Demo accounts' }).locator('.demo-card');
    await expect(cards).toHaveCount(6);
    await page.getByRole('button', { name: 'Show all 16 demo roles ▾' }).click();
    await expect(cards).toHaveCount(16);
  });

  test('a wrong password shows a generic error and stays on the page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill('manager@demo.example');
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      'Email/username or password is incorrect',
    );
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signing out returns to the login page and protects the app', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^Super User: Sam Sutton/ }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: /, Sam$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/);
  });
});
