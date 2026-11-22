import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient, seedId } from '@cafm/db';
import { DEMO_PASSWORD } from '@cafm/shared';

const cardiff = seedId('location:demo-estates:CDF');
const tenantId = seedId('tenant:demo-estates');

async function signIn(page: Page, persona: string) {
  await page.getByLabel('Email or username').fill(persona + '@demo.example');
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function checkAccessibility(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map(({ id, nodes }) => [id, nodes.map(({ target }) => target)])).toEqual([]);
}

test('a QR report reaches Helpdesk, stays private and can be rated after completion', async ({ page }) => {
  test.setTimeout(90_000);
  const title = 'Test leak ' + randomUUID().slice(0, 8);
  const db = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
  });
  try {
    await page.goto('/location-qr/' + cardiff);
    await expect(page).toHaveURL(/\/login\?next=/);
    await signIn(page, 'requester');
    await expect(page.getByRole('heading', { name: 'Report a fault' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Cardiff HQ', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Water leak' }).check();
    await page.getByLabel('Is water near electrical equipment?').selectOption('yes');
    await page.getByLabel('Description').fill(title);
    await checkAccessibility(page);
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const portalUrl = page.url();
    const id = new URL(portalUrl).pathname.split('/').pop()!;
    await expect(page.getByText('Request received', { exact: true })).toBeVisible();

    await page.context().clearCookies();
    await page.goto('/login');
    await signIn(page, 'helpdesk');
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/app/helpdesk');
    await page.getByRole('searchbox', { name: 'Search requests' }).fill(title);
    await page.getByRole('searchbox', { name: 'Find location' }).fill('Cardiff');
    await expect(page.getByRole('option', { name: 'Cardiff HQ · CDF' })).toBeAttached();
    await page.getByLabel('Location', { exact: true }).selectOption(cardiff);
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('link', { name: title })).toBeVisible();
    await expect(page.getByText('P1 Emergency')).toBeVisible();
    await checkAccessibility(page);
    await page.getByRole('link', { name: title }).click();
    await expect(page).toHaveURL('/app/helpdesk/' + id);
    await page.getByText('Classification and priority', { exact: true }).click();
    await page.getByLabel('Urgency', { exact: true }).selectOption('2');
    await page.getByRole('button', { name: 'Save classification' }).click();
    await expect(page.getByText('P2', { exact: true })).toBeVisible();
    await page.getByLabel('Add a comment').fill('Internal test note');
    await page.getByLabel('Internal note').check();
    await page.getByRole('button', { name: 'Send comment' }).click();
    await expect(page.getByText('Internal test note', { exact: true })).toBeVisible();
    await page.getByLabel('Status', { exact: true }).selectOption('completed');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: 'Triage request' })).toBeVisible();
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();

    await page.context().clearCookies();
    await page.goto(portalUrl);
    await expect(page).toHaveURL(/\/login\?next=/);
    await signIn(page, 'requester');
    await expect(page).toHaveURL(portalUrl, { timeout: 15_000 });
    await expect(page.getByText('Internal test note', { exact: true })).toHaveCount(0);
    await page.getByLabel('Rate this job').selectOption('5');
    await page.getByRole('button', { name: 'Send feedback' }).click();
    await expect(page.getByText('Rated 5 out of 5')).toBeVisible();
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Notifications' });
    await expect(
      drawer.getByText('Your request about ' + title + ' is complete. You can rate it in My requests.'),
    ).toBeVisible();
  } finally {
    const requests = await db.serviceRequest.findMany({ where: { tenantId, title }, select: { id: true } });
    const notices = await db.notification.findMany({
      where: { tenantId, requestId: { in: requests.map(({ id }) => id) } },
    });
    for (const { id } of notices) {
      await db.outboxMessage.deleteMany({ where: { tenantId, payload: { path: ['notificationId'], equals: id } } });
    }
    await db.serviceRequest.deleteMany({ where: { tenantId, title } });
    await db.$disconnect();
  }
});

test('an operator uses quick-log in the queue', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/login');
  await signIn(page, 'helpdesk');
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/app/helpdesk');
  await page.getByRole('link', { name: 'Log request' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log a request' });
  await expect(dialog.getByLabel('Request type')).toBeVisible();
  await dialog.getByLabel('Find location').fill('Cardiff');
  await expect(dialog.getByRole('option', { name: 'Cardiff HQ · CDF' })).toBeAttached();
  await dialog.getByLabel('Location', { exact: true }).selectOption(cardiff);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Log request' })).toBeVisible();
});

test('reports a fault with a photo from a printed asset QR after signing in', async ({ page }) => {
  const title = 'Boiler photo ' + randomUUID().slice(0, 8);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
    'base64',
  );
  const db = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
  });
  try {
    await page.goto('/asset-qr/' + seedId('asset-tag:demo-estates:qr'));
    await expect(page).toHaveURL(/\/login\?next=/);
    await signIn(page, 'requester');
    await expect(page.getByRole('heading', { name: 'Report a fault' })).toBeVisible();
    await expect(page.getByText('Boiler 2 · AST-00003', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View asset' })).toHaveCount(0);
    await page.getByRole('radio', { name: 'Water leak' }).check();
    await page.getByLabel('Is water near electrical equipment?').selectOption('no');
    await page.getByLabel('Description').fill(title);
    await page
      .getByLabel('Photo (optional)')
      .setInputFiles({ name: 'boiler-fault.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const link = page.getByRole('link', { name: 'boiler-fault.png' });
    await expect(link).toBeVisible();
    await checkAccessibility(page);
    const id = new URL(page.url()).pathname.split('/').pop()!;
    await page.getByRole('link', { name: 'My requests', exact: true }).first().click();
    await page.getByRole('link', { name: 'Find an asset tag' }).click();
    await page.getByLabel('Scan or enter tag code').fill('CDF-00003');
    await page.getByRole('button', { name: 'Find asset' }).click();
    await expect(page.getByRole('heading', { name: 'Report a fault' })).toBeVisible();
    await expect(page.getByText('Boiler 2 · AST-00003', { exact: true })).toBeVisible();
    await page.context().clearCookies();
    await page.goto('/login');
    await signIn(page, 'helpdesk');
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/app/helpdesk/' + id);
    await expect(page.getByRole('link', { name: 'boiler-fault.png' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload photo' })).toHaveCount(0);
  } finally {
    await db.serviceRequest.deleteMany({ where: { tenantId, title } });
    await db.$disconnect();
  }
});
