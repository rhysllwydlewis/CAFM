import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('a technician sees their jobs, and they stay on the phone without signal', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('technician@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto('/m');
  await expect(page.getByRole('heading', { level: 1, name: 'My jobs' })).toBeVisible();
  const job = page.getByRole('link', { name: /WO-10412/ });
  await expect(job).toBeVisible();
  await expect(page.getByText(/^Synced/)).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([]);

  // The service worker must be in control before the shell can be served offline.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await job.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Boiler 2 losing pressure overnight' })).toBeVisible();
  await page.getByRole('link', { name: 'My jobs' }).first().click();

  await context.setOffline(true);
  await page.goto('/m');
  await expect(page.getByRole('status').filter({ hasText: 'Offline' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /WO-10412/ })).toBeVisible();
  await page.getByRole('link', { name: /WO-10412/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Boiler 2 losing pressure overnight' })).toBeVisible();
  await context.setOffline(false);
});

test('signing out clears the jobs from the phone', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('technician@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/m');
  await expect(page.getByRole('link', { name: /WO-10412/ })).toBeVisible();
  await page.getByRole('link', { name: 'Me', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  const held = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('cafm-mobile');
        open.onsuccess = () => {
          const count = open.result.transaction('jobs').objectStore('jobs').count();
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );
  expect(held).toBe(0);
});
