import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([]);
}

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
  await assertAccessible(page);

  // The screens and their scripts are saved in the background. The job screen is not opened online first, so
  // this proves a screen not visited yet still works offline.
  await page.locator('[data-offline-ready="true"]').waitFor();

  await context.setOffline(true);
  await page.goto('/m');
  await expect(page.getByRole('status').filter({ hasText: 'Offline' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /WO-10412/ })).toBeVisible();
  await page.getByRole('link', { name: /WO-10412/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Boiler 2 losing pressure overnight' })).toBeVisible();
  await assertAccessible(page);
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
  await expect(page.getByRole('heading', { level: 1, name: 'Me' })).toBeVisible();
  await assertAccessible(page);
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

test('jobs saved for one person are not shown to the next person on the same browser', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('technician@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/m');
  await expect(page.getByRole('link', { name: /WO-10412/ })).toBeVisible();

  // Someone else signs in on the same browser, without the technician app's own sign out.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('requester@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/m');
  await expect(page.getByRole('heading', { level: 1, name: 'My jobs' })).toBeVisible();
  await expect(page.getByRole('link', { name: /WO-10412/ })).toHaveCount(0);
});

test('changes made without signal wait on the phone, then sync', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('technician@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/m');
  const job = page.getByRole('link', { name: /WO-10412/ });
  await expect(job).toBeVisible();
  await expect(page.getByText(/^Synced/)).toBeVisible();
  await page.locator('[data-offline-ready="true"]').waitFor();
  await job.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Boiler 2 losing pressure overnight' })).toBeVisible();
  const jobUrl = page.url();

  await context.setOffline(true);
  // A tick step is cleared and ticked again, so the demo job ends as it began once both changes have synced.
  const step = page.getByRole('checkbox').first();
  await expect(step).toBeChecked();
  await step.click();
  await expect(page.getByText('1 change waiting to sync')).toBeVisible();
  await expect(page.getByRole('checkbox').first()).not.toBeChecked();
  await page.getByRole('checkbox').first().click();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await expect(page.getByText('2 changes waiting to sync')).toBeVisible();
  await assertAccessible(page);

  await page.getByRole('link', { name: /2 changes waiting to sync/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sync' })).toBeVisible();
  await expect(page.getByText('Waiting to sync (2)')).toBeVisible();
  await expect(page.getByText('Checklist answer')).toHaveCount(2);
  await assertAccessible(page);

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Try sync now' }).click();
  await expect(page.getByText('Waiting to sync (0)')).toBeVisible();

  // The complete screen, for a job that is on site.
  await page.goto(jobUrl.replace('/m/job?', '/m/job/complete?'));
  await expect(page.getByRole('heading', { level: 1, name: 'Complete job' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete and sign off' })).toBeVisible();
  await assertAccessible(page);
  await page.getByRole('button', { name: 'Complete and sign off' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Ask the customer to sign first.' })).toBeVisible();
});

test('a technician scans an asset and records a meter reading without signal', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('technician@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/m');
  await expect(page.getByText(/^Synced/)).toBeVisible();
  await page.locator('[data-offline-ready="true"]').waitFor();
  await page.getByRole('link', { name: /WO-10412/ }).click();
  const assetNumber = (
    await page
      .getByText(/Boiler 2 · AST-/)
      .first()
      .innerText()
  )
    .split('· ')[1]!
    .trim();

  await page.getByRole('link', { name: 'Scan', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Scan' })).toBeVisible();
  await context.setOffline(true);

  await page.getByLabel('Asset or job number').fill('AST-NOT-HERE');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByText('Nothing on this phone matches')).toBeVisible();

  await page.getByLabel('Asset or job number').fill(assetNumber.toLowerCase());
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByText(/Boiler 2 · AST-/)).toBeVisible();
  await assertAccessible(page);

  await page.getByRole('button', { name: 'Record a reading' }).click();
  await page.getByLabel('Reading', { exact: false }).last().fill('abc');
  await page.getByRole('button', { name: 'Save reading' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter the reading as a number' })).toBeVisible();
  await page.getByLabel('Reading', { exact: false }).last().fill('1204.5');
  await page.getByRole('button', { name: 'Save reading' }).click();
  await expect(page.getByText('Reading saved on this phone')).toBeVisible();

  await page.getByRole('link', { name: 'Sync', exact: true }).click();
  await expect(page.getByText('Waiting to sync (1)')).toBeVisible();
  await expect(page.getByText('Meter reading')).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Try sync now' }).click();
  await expect(page.getByText('Waiting to sync (0)')).toBeVisible();
});

test('a technician raises a quick job from a scan, and sees recent scans, without signal', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('technician@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/m');
  await expect(page.getByText(/^Synced/)).toBeVisible();
  await page.locator('[data-offline-ready="true"]').waitFor();
  await page.goto('/m/scan');
  await context.setOffline(true);

  await page.getByLabel('Asset or job number').fill('WO-10412');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Recent scans' })).toBeVisible();
  await expect(page.getByRole('button', { name: /WO-10412/ })).toBeVisible();
  await assertAccessible(page);

  // A scanned job has no asset card, so look up its asset through the recent list's other entry: scan the asset.
  await page
    .getByRole('link', { name: /Open job|WO-10412/ })
    .first()
    .click();
  const assetNumber = (
    await page
      .getByText(/Boiler 2 · AST-/)
      .first()
      .innerText()
  )
    .split('· ')[1]!
    .trim();
  await page.goto('/m/scan');
  await page.getByLabel('Asset or job number').fill(assetNumber);
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByRole('button', { name: 'Raise a job' }).click();
  await page.getByRole('button', { name: 'Raise job' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a title' })).toBeVisible();
  await page.getByLabel('What needs doing').fill('Loose guard on the burner');
  await page.getByLabel('What you found').fill('The guard rattles when the burner starts.');
  await assertAccessible(page);
  await page.getByRole('button', { name: 'Raise job' }).click();
  await expect(page.getByText('Job saved on this phone')).toBeVisible();

  await page.getByRole('link', { name: 'Sync', exact: true }).click();
  await expect(page.getByText('Waiting to sync (1)')).toBeVisible();
  await expect(page.getByText('New job: Loose guard on the burner')).toBeVisible();
});
