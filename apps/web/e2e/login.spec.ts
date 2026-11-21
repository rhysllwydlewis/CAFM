import { expect, test } from '@playwright/test';

test.describe('sign in with a demo account', () => {
  test('a demo card fills the form, and signing in lands on Home', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByRole('button', { name: /^Technician\W+Tom Price/ }).click();
    await expect(page.getByLabel('Email or username')).toHaveValue('technician@demo.example');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('CafmDemo!2026');
    await expect(page.getByRole('button', { name: /^Technician\W+Tom Price/ })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Tom$/ })).toBeVisible();
    await expect(page.getByText('Demo Estates Ltd').filter({ visible: true }).first()).toBeVisible();
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

  test('a signed-in user visiting the login page goes straight to Home', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^Contractor\W+Cara Lloyd/ }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('a Super User can sign out and sign back in as a Technician', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^Super User\W+Sam Sutton/ }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: /, Sam$/ })).toBeVisible();
    const signOut = page.getByRole('button', { name: 'Sign out' });
    await expect(signOut).toBeInViewport();
    await expect(signOut).toHaveText('Sign out');
    await signOut.press('Enter');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/);

    await page.getByRole('button', { name: /^Technician\W+Tom Price/ }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: /, Tom$/ })).toBeVisible();
  });

  test('a failed sign-out keeps the user on Home and allows a retry', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^Super User\W+Sam Sutton/ }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);

    await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 503 }), { times: 1 });
    const signOut = page.getByRole('button', { name: 'Sign out' });
    await signOut.click();
    await expect(page.getByRole('alert')).toHaveText('Could not sign out. Try again.');
    await expect(page).toHaveURL(/\/app$/);

    await signOut.click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
