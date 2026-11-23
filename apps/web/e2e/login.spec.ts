import { expect, test } from '@playwright/test';

test.describe('sign in with a demo account', () => {
  test('a demo card fills the form, and signing in lands on Home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'One day at Cardiff HQ.' })).toBeVisible();
    await page.locator('[data-intro]').getByRole('link', { name: 'Try the demo' }).click();
    await expect(page).toHaveURL(/\/login#demo-heading$/);
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
    await expect(signOut).toBeInViewport({ ratio: 1 });
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
    await signOut.focus();
    await page.keyboard.press('Enter');
    const alert = page.getByRole('complementary', { name: 'Main' }).getByRole('alert');
    await expect(alert).toHaveText('Could not sign out. Try again.');
    await expect(alert).toBeInViewport();
    await expect(page).toHaveURL(/\/app$/);
    await expect(signOut).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the account role stays clear of Sign out on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Show all 16 demo roles ▾' }).click();
    await page.getByRole('button', { name: /^Administrator\W+Alex Rowe/ }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.evaluate(() => document.fonts.ready);

    const nav = page.getByRole('complementary', { name: 'Main' });
    const signOut = nav.getByRole('button', { name: 'Sign out' });
    await expect(signOut).toBeInViewport({ ratio: 1 });

    const roleRight = await nav.getByText('Administrator', { exact: true }).evaluate((role) => {
      const text = document.createRange();
      text.selectNodeContents(role);
      return text.getBoundingClientRect().right;
    });
    const signOutLeft = await signOut.evaluate((button) => button.getBoundingClientRect().left);
    expect(roleRight).toBeLessThan(signOutLeft);
  });
});
