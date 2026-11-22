import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient, seedId } from '@cafm/db';

const cardiffId = seedId('location:demo-estates:CDF');
const locationRoute = '/app/locations';
const cardiffRoute = locationRoute + '?id=' + cardiffId;

async function signIn(page: Page, persona = 'superuser') {
  await page.getByLabel('Email or username').fill(persona + '@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([]);
}

test('searches and opens a site, filters the portfolio and prints matching QR labels', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNuoAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.goto('/login');
  await signIn(page);
  await expect(page).toHaveURL('/app');
  await page.goto(cardiffRoute);
  await expect(page.getByRole('heading', { level: 1, name: 'Cardiff HQ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Business calendar' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find a location' }).fill('Plant room');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('link', { name: /Plant room B1/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plant room B1' })).toBeVisible();
  await assertAccessible(page);

  await page.getByRole('link', { name: 'Portfolio map' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Portfolio map' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Site map' })).toBeVisible();
  await assertAccessible(page);
  await page.getByRole('searchbox', { name: 'Filter sites' }).fill('Cardiff HQ');
  await page.getByLabel('Site status').selectOption('closed');
  await expect(page.getByText('No sites match your filters.')).toBeVisible();
  await page.getByLabel('Site status').selectOption('open');
  await page.getByRole('link', { name: 'Cardiff HQ', exact: true }).click();
  await page.getByRole('link', { name: 'QR labels' }).click();
  await expect(
    page.getByRole('region', { name: 'Selected QR labels' }).getByText('Cardiff HQ', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print labels' })).toBeEnabled();
  await assertAccessible(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Print labels' })).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Selected QR labels' }).getByText('Cardiff HQ', { exact: true }),
  ).toBeVisible();
});

test('creates and edits a site and saves its business calendar', async ({ page }) => {
  const code = 'E2E-' + randomUUID().slice(0, 8).toUpperCase();
  const db = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
  });
  try {
    await page.goto('/login');
    await signIn(page);
    await expect(page).toHaveURL('/app');
    await page.goto(locationRoute + '?mode=add');
    await page.getByLabel('Name', { exact: true }).fill('Test site ' + code);
    await page.getByLabel('Code', { exact: true }).fill(code);
    await page.getByLabel('Address', { exact: true }).fill('Test address');
    await page.getByRole('button', { name: 'Save location' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Test site ' + code })).toBeVisible();
    await page.getByRole('link', { name: 'Edit site' }).click();
    await page.getByLabel('Site contact').fill('Test reception');
    await page.getByRole('button', { name: 'Save location' }).click();
    await expect(page.getByText('Test reception', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Set calendar' }).click();
    await page.getByLabel('Jurisdiction').selectOption('scotland');
    await page.getByRole('button', { name: 'Add closure' }).click();
    await page.getByLabel('Closure name').fill('Test closure');
    await page.getByLabel('Start date').fill('2027-01-04');
    await page.getByLabel('End date').fill('2027-01-05');
    await page.getByRole('button', { name: 'Save calendar' }).click();
    await expect(page.getByText('Scotland · Europe/London')).toBeVisible();
    await expect(page.getByText(/Test closure/)).toBeVisible();
  } finally {
    await db.location.deleteMany({ where: { code, tenantId: seedId('tenant:demo-estates') } });
    await db.$disconnect();
  }
});

test('a scanned link returns to the location after sign-in and protects sites outside the current tenant', async ({
  page,
}) => {
  const scan = '/location-qr/' + cardiffId;
  await page.goto(scan);
  await expect(page).toHaveURL(/\/login\?next=/);
  await signIn(page, 'technician');
  await expect(page).toHaveURL(cardiffRoute);
  await expect(page.getByRole('heading', { level: 1, name: 'Cardiff HQ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit site' })).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto(scan);
  await signIn(page, 'starter');
  await expect(page).toHaveURL(scan);
  await expect(page.getByRole('heading', { name: 'Location unavailable' })).toBeVisible();
  await expect(page.getByText('Cardiff HQ', { exact: true })).toHaveCount(0);
});
