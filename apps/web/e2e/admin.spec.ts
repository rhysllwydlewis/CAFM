import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createTenant, PrismaClient } from '@cafm/db';

async function signInAs(page: Page, persona: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(persona + '@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function assertAccessible(page: Page) {
  // A refresh or navigation briefly leaves the title empty; a page that never gets one still fails here.
  await expect(page).toHaveTitle(/\S/);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([]);
}

test('a Super User sees the admin overview and the users list', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible();
  await expect(page.getByText('Active users', { exact: true })).toBeVisible();
  await expect(page.getByText(/Setup checklist/)).toBeVisible();
  await assertAccessible(page);

  await page.getByRole('link', { name: 'Users and licences' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/users$/);
  await expect(page.getByRole('heading', { name: /^People/ })).toBeVisible();
  const table = page.getByRole('table', { name: /^People/ });
  await expect(table.getByText('Sam Sutton', { exact: true })).toBeVisible();
  await page.getByLabel('Search people').fill('Tom');
  await expect(table.getByText('Tom Price', { exact: true })).toBeVisible();
  await expect(table.getByText('Sam Sutton', { exact: true })).toHaveCount(0);
  await assertAccessible(page);
});

test('a requester is kept out of the admin console', async ({ page }) => {
  await signInAs(page, 'requester');
  await page.goto('/app/admin');
  await expect(page).not.toHaveURL(/\/app\/admin/);
});

test('a Super User edits a custom role in the roles matrix', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin/roles');
  await expect(page.getByRole('heading', { name: /^Role: / })).toBeVisible();
  await assertAccessible(page);

  const name = 'E2E role ' + Date.now();
  await page.getByLabel('New role').fill(name);
  await page.getByRole('button', { name: 'Create role' }).click();
  await expect(page.getByRole('heading', { name: 'Role: ' + name })).toBeVisible();
  await page.getByLabel('See assets', { exact: true }).check();
  await page.getByRole('button', { name: 'Save role' }).click();
  await expect(page.getByText('Role saved.')).toBeVisible();
  await expect(page.getByLabel('See assets', { exact: true })).toBeChecked();
  await assertAccessible(page);

  await page.getByRole('button', { name: 'Delete role' }).click();
  await expect(page.getByText('Role deleted.')).toBeVisible();
});

test('a Super User creates and deletes a team', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin/teams');
  await expect(page.getByRole('heading', { name: 'Field engineers' })).toBeVisible();
  const name = 'E2E team ' + Date.now();
  await page.getByLabel('Team name').fill(name);
  await page.getByRole('group', { name: 'Members', exact: true }).getByLabel('Tom Price').check();
  await page.getByRole('button', { name: 'Create team' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await assertAccessible(page);
  await page
    .locator('section', { has: page.getByRole('heading', { name }) })
    .getByRole('button', { name: 'Delete team' })
    .click();
  await expect(page.getByRole('heading', { name })).toHaveCount(0);
});

test('a technician cannot open the roles or teams screens', async ({ page }) => {
  await signInAs(page, 'technician');
  await page.goto('/app/admin/roles');
  await expect(page).not.toHaveURL(/\/app\/admin/);
  await page.goto('/app/admin/teams');
  await expect(page).not.toHaveURL(/\/app\/admin/);
});

test('a helpdesk operator can read teams but not change them', async ({ page }) => {
  await signInAs(page, 'helpdesk');
  await page.goto('/app/admin/teams');
  await expect(page).toHaveURL(/\/app\/admin\/teams/);
  await expect(page.getByRole('heading', { name: 'Field engineers' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create team' })).toHaveCount(0);
  await assertAccessible(page);
});

test('a Super User sees the site access card and the demo people stay locked', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin/users');
  const card = page.getByRole('region', { name: 'Site access' });
  await expect(card).toBeVisible();
  await card.getByLabel('Person').selectOption({ label: 'Tom Price' });
  // By keyboard, which also proves the choice is reachable without a pointer.
  await card.getByLabel('Only the sites I choose').focus();
  await page.keyboard.press('Space');
  await expect(card.getByRole('group', { name: 'Sites and regions' })).toBeVisible();
  await card.getByRole('button', { name: 'Save site access' }).focus();
  await page.keyboard.press('Enter');
  await expect(card.getByRole('alert')).toContainText('part of the demo');
  await assertAccessible(page);
});

test('a Super User renames a module and a term, and the menu follows', async ({ page }) => {
  // Its own organisation, so the menu changes never reach the demo people other tests use in parallel.
  const suffix = randomUUID().slice(0, 8);
  const email = 'modules-' + suffix + '@test.example';
  const password = 'Pw-' + randomUUID();
  const db = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
  });
  const tenant = await createTenant(db, {
    name: 'Modules test estate',
    slug: 'modules-' + suffix,
    plan: 'professional',
    adminEmail: email,
    appUrl: 'http://localhost:3000',
  });
  const where = { tenantId: tenant.tenantId };
  try {
    const token = tenant.inviteUrl.split('/').at(-1);
    expect(
      (
        await page.request.post('/api/auth/invites/' + token + '/accept', {
          data: { name: 'Test administrator', password, acceptTerms: true },
        })
      ).ok(),
    ).toBe(true);
    await page.goto('/app/admin/modules');
    await expect(page.getByRole('heading', { name: 'Modules and navigation', level: 2 })).toBeVisible();
    await assertAccessible(page);
    // On a phone the menu is a closed drawer, so look at the links themselves rather than what is on screen.
    const menuLink = (name: string) => page.locator('nav[aria-label="Modules"] a', { hasText: name });
    await expect(menuLink('Finance')).toHaveCount(1);

    await page.getByLabel('Show Finance in the menu').uncheck();
    await page.getByLabel('Your name for Work orders').fill('Jobs');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toContainText('Modules saved');
    await expect(menuLink('Finance')).toHaveCount(0);
    await expect(menuLink('Jobs')).toHaveCount(1);

    await page.getByRole('link', { name: 'Terminology' }).click();
    await expect(page.getByRole('heading', { name: 'Terminology', level: 2 })).toBeVisible();
    await assertAccessible(page);
    await page.getByLabel('Your word for Site, singular').fill('School');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toContainText('Enter both the singular and the plural');
    await page.getByLabel('Your word for Sites, plural').fill('Schools');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toContainText('Terminology saved');
    await expect(menuLink('Schools')).toHaveCount(1);
  } finally {
    const account = await db.account.findUnique({ where: { email } });
    await db.$transaction(async (tx) => {
      await tx.session.deleteMany({ where });
      await tx.moduleSetting.deleteMany({ where });
      await tx.termOverride.deleteMany({ where });
      await tx.auditEvent.deleteMany({ where });
      await tx.invite.deleteMany({ where });
      await tx.outboxMessage.deleteMany({ where });
      await tx.membership.deleteMany({ where });
      await tx.role.deleteMany({ where });
      await tx.authEvent.deleteMany({ where: account ? { accountId: account.id } : where });
      if (account) await tx.account.delete({ where: { id: account.id } });
      await tx.tenant.delete({ where: { id: where.tenantId } });
    });
    await db.$disconnect();
  }
});

test('a Super User views the app as a technician and then stops', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin/users');
  await expect(page.getByRole('heading', { name: 'View as user' })).toBeVisible();
  await assertAccessible(page);
  const card = page.getByRole('region', { name: 'View as user' });
  await card.getByLabel('Person').selectOption({ label: 'Tom Price (Technician)' });
  await card.getByLabel('Reason').fill('Checking what the technician sees');
  // By keyboard, as the site access test does: at phone width this page is wider than the screen (see the PR's known gaps).
  await card.getByRole('button', { name: 'View as this person' }).focus();
  await page.keyboard.press('Enter');

  const banner = page.getByRole('status').filter({ hasText: 'You are viewing as Tom Price' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('signed in as Sam Sutton');
  await assertAccessible(page);

  await banner.getByRole('button', { name: 'Stop viewing' }).click();
  await expect(page.getByRole('heading', { name: /^People/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'You are viewing as' })).toHaveCount(0);
});

test('an Administrator has no view as user card', async ({ page }) => {
  await signInAs(page, 'admin');
  await page.goto('/app/admin/users');
  await expect(page.getByRole('heading', { name: /^People/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'View as user' })).toHaveCount(0);
});

test('a Super User checks the contrast of an accent colour, saves it and puts the standard look back', async ({
  page,
}) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin/branding');
  await expect(page.getByRole('heading', { name: 'Branding', level: 2 })).toBeVisible();
  await assertAccessible(page);

  const accent = page.getByLabel('Accent colour');
  await accent.fill('#ffee88');
  await expect(page.getByText(/Too light/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  try {
    await accent.fill('#136676');
    await page.getByLabel('Sign-in message').fill('Welcome to Demo Estates facilities.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Branding saved/)).toBeVisible();
    await assertAccessible(page);
  } finally {
    // Leave the demo organisation as it was seeded.
    await accent.fill('');
    await page.getByLabel('Sign-in message').fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Branding saved/)).toBeVisible();
  }
});
