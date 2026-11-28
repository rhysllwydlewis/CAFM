import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createTenant, PrismaClient } from '@fmstead/db';

async function signInAs(page: Page, persona: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(persona + '@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('FmsDemo!2026');
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
  await expect(page.getByText('Role created.')).toBeVisible();
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

    await page.getByRole('link', { name: 'Custom fields' }).click();
    await expect(page.getByRole('heading', { name: 'Custom fields', level: 2 })).toBeVisible();
    await assertAccessible(page);
    await page.getByLabel('Record type').selectOption('asset');
    await page.getByLabel('Label', { exact: true }).fill('Fire zone');
    await page.getByLabel('Type', { exact: true }).selectOption('picklist');
    await page.getByLabel('Options, one per line').fill('Zone A\nZone B');
    await page.getByRole('button', { name: 'Add field' }).click();
    await expect(page.getByRole('status')).toContainText('“Fire zone” added');
    await expect(page.getByRole('row', { name: /Fire zone/ })).toContainText('Pick one');
    await page.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('status')).toContainText('“Fire zone” deactivated');
    await expect(page.getByRole('row', { name: /Fire zone/ })).toContainText('Deactivated');

    await page.getByRole('link', { name: 'Service levels' }).click();
    await expect(page.getByRole('heading', { name: 'Service levels', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Request categories', level: 2 })).toBeVisible();
    await expect(page.getByRole('row', { name: /High High Priority 1/ })).toBeVisible();
    await assertAccessible(page);

    await page.getByRole('link', { name: 'Business calendars' }).click();
    await expect(page.getByRole('heading', { name: 'Business calendars', level: 2 })).toBeVisible();
    await expect(page.getByText('No sites yet.')).toBeVisible();
    await assertAccessible(page);
  } finally {
    const account = await db.account.findUnique({ where: { email } });
    await db.$transaction(async (tx) => {
      await tx.session.deleteMany({ where });
      await tx.moduleSetting.deleteMany({ where });
      await tx.configVersion.deleteMany({ where });
      await tx.fieldDefinition.deleteMany({ where });
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

test('business calendars say what a missing calendar means and page through a large estate', async ({ page }) => {
  test.setTimeout(60_000);
  // Its own organisation, with more sites than one page holds and half of them without a calendar.
  const suffix = randomUUID().slice(0, 8);
  const email = 'calendars-' + suffix + '@test.example';
  const password = 'Pw-' + randomUUID();
  const db = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
  });
  const tenant = await createTenant(db, {
    name: 'Calendars test estate',
    slug: 'calendars-' + suffix,
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
    const hasCalendar = (i: number) => i % 2 === 0;
    await db.location.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        ...where,
        name: 'Site ' + String(i).padStart(3, '0'),
        code: 'S' + i,
        kind: 'site',
        ...(hasCalendar(i)
          ? {
              siteCalendar: {
                jurisdiction: 'england',
                timeZone: 'Europe/London',
                observeBankHolidays: true,
                closures: [],
                hours: [1, 2, 3, 4, 5].map((day) => ({ day, opens: '08:00', closes: '18:00' })),
              },
            }
          : {}),
      })),
    });

    await page.goto('/app/admin/calendars');
    await expect(page.getByRole('heading', { name: 'Business calendars', level: 2 })).toBeVisible();

    // The warning counts every site, not just this page, and says what those sites really run on.
    const warning = page.getByRole('status').filter({ hasText: 'have no business calendar' });
    await expect(warning).toContainText('60 sites have no business calendar.');
    await expect(warning).toContainText('default hours, Mon to Fri, 09:00 to 17:00 (Europe/London)');
    await expect(warning).toContainText('Priorities that run around the clock are not affected.');
    await expect(warning).not.toContainText('around the clock until');
    await expect(page.getByRole('row', { name: /Site 001/ })).toContainText('Default: Mon to Fri, 09:00 to 17:00');
    await expect(page.getByRole('row', { name: /Site 000/ })).toContainText('Mon to Fri, 08:00 to 18:00');

    // 100 sites on the first page (plus the header row), and a way to the rest.
    await expect(page.getByRole('row')).toHaveCount(101);
    await expect(page.getByText('Showing 1 to 100 of 120 sites')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Previous page' })).toHaveCount(0);
    await assertAccessible(page);

    // Pressed by keyboard, as the other admin tests do: on a phone the administration menu can cover a pointer click.
    await page.getByRole('link', { name: 'Next page' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Showing 101 to 120 of 120 sites')).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(21);
    await expect(page.getByRole('row', { name: /Site 119/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Next page' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Previous page' })).toBeVisible();
    // Still 60 across the whole estate, although this page holds 10 of them.
    await expect(page.getByRole('status').filter({ hasText: 'have no business calendar' })).toContainText(
      '60 sites have no business calendar.',
    );
    await assertAccessible(page);

    // A page number past the end shows the last page rather than an empty one.
    await page.goto('/app/admin/calendars?page=99');
    await expect(page.getByText('Showing 101 to 120 of 120 sites')).toBeVisible();
  } finally {
    const account = await db.account.findUnique({ where: { email } });
    await db.$transaction(async (tx) => {
      await tx.session.deleteMany({ where });
      await tx.location.deleteMany({ where });
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
  browser,
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
    await page.getByLabel('Email sender name').fill('Demo Estates facilities');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Branding saved/)).toBeVisible();
    await assertAccessible(page);

    // A logo: SVG is refused, a PNG is shown in the menu, and it can be removed.
    await page.getByLabel('Logo', { exact: true }).setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });
    await expect(page.getByText('Use a PNG, JPEG or WebP image.')).toBeVisible();
    await page.getByLabel('Logo', { exact: true }).setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await expect(page.getByText(/Logo saved/)).toBeVisible();
    await expect(page.locator('.tenant .t-logo img')).toHaveCount(1);
    await assertAccessible(page);
    await page.getByRole('button', { name: 'Remove logo' }).click();
    await expect(page.getByText('Logo removed.')).toBeVisible();

    // The message shows on the organisation's own sign-in page, to someone who is not signed in.
    const anonymous = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      const signIn = await anonymous.newPage();
      await signIn.goto('/t/demo-estates/login');
      await expect(signIn.getByText('Welcome to Demo Estates facilities.')).toBeVisible();
      await assertAccessible(signIn);
    } finally {
      await anonymous.close();
    }
  } finally {
    // Leave the demo organisation as it was seeded.
    await accent.fill('');
    await page.getByLabel('Sign-in message').fill('');
    await page.getByLabel('Email sender name').fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Branding saved/)).toBeVisible();
  }
});

test('a Super User saves security settings and finds the change in the audit log', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin/security');
  await expect(page.getByRole('heading', { name: 'Security and sign-in' })).toBeVisible();
  await assertAccessible(page);

  await page.getByLabel('Minimum password length').fill('11');
  await expect(page.getByText(/Use a whole number from 12 to 64/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await page.getByLabel('Minimum password length').fill('12');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Security settings saved.' })).toBeVisible();

  // "Allow view as user" is on by default; switching it off sticks, and is put back so other tests are unaffected.
  const viewAs = page.getByLabel('Allow view as user');
  await expect(viewAs).toBeChecked();
  await viewAs.uncheck();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Security settings saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Allow view as user')).not.toBeChecked();
  await page.getByLabel('Allow view as user').check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Security settings saved.' })).toBeVisible();

  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/audit$/);
  await page.getByLabel('Event').fill('security_updated');
  await page.getByLabel('Who').selectOption({ label: 'Sam Sutton' });
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'settings.security_updated' }).first()).toBeVisible();
  await assertAccessible(page);

  await page.getByLabel('From').fill('2026-02-01');
  await page.getByLabel('To').fill('2026-01-01');
  await expect(page.getByText('The start date must be before the end date.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByLabel('Event')).toHaveValue('');
  const csv = await page.request.get(
    await page.getByRole('link', { name: 'Export CSV' }).evaluate((a) => (a as HTMLAnchorElement).href),
  );
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(await csv.text()).toContain('"When (UTC)"');
});

test('someone without audit access cannot open the audit log', async ({ page }) => {
  await signInAs(page, 'requester');
  await page.goto('/app/admin/audit');
  await expect(page).not.toHaveURL(/\/admin\/audit/);
});

test('a Super User makes a username-only account, which signs in on the organisation page', async ({ page }) => {
  const username = 'e2e' + randomUUID().slice(0, 6);
  await signInAs(page, 'superuser');
  await page.goto('/app/admin/users');
  const card = page.getByRole('region', { name: 'Accounts with a username only' });
  await expect(card).toBeVisible();
  await assertAccessible(page);

  await card.getByLabel('Name', { exact: true }).fill('Rhian Operative');
  await card.getByLabel('Username').fill(username);
  await card.getByLabel('Role', { exact: true }).selectOption({ label: 'Technician' });
  await card.getByRole('button', { name: 'Create account' }).focus();
  await page.keyboard.press('Enter');
  const issued = card.getByRole('status');
  await expect(issued).toContainText('Account created for Rhian Operative');
  const password = (await issued.getByText(/^Password:/).innerText()).replace('Password:', '').trim();
  expect(password.length).toBeGreaterThanOrEqual(16);
  await assertAccessible(page);

  try {
    await page.context().clearCookies();
    await page.goto('/t/demo-estates/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await assertAccessible(page);
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login/);
  } finally {
    const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    const accounts = await db.account.findMany({
      where: { username: `${username}@demo-estates` },
      select: { id: true },
    });
    const ids = accounts.map((a) => a.id);
    await db.session.deleteMany({ where: { accountId: { in: ids } } });
    await db.membership.deleteMany({ where: { accountId: { in: ids } } });
    await db.account.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});

test('a Super User checks, imports and undoes a locations file', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin');
  // The side menu has an Import and export entry too, so say which menu this means.
  await page
    .getByRole('navigation', { name: 'Administration' })
    .getByRole('link', { name: 'Import and export' })
    .click();
  await expect(page).toHaveURL(/\/app\/admin\/import$/);
  await expect(page.getByRole('heading', { name: 'Import from CSV' })).toBeVisible();
  await assertAccessible(page);

  const code = 'IMP-' + randomUUID().slice(0, 8).toUpperCase();
  const choose = (name: string, text: string) =>
    page.getByLabel('Choose file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

  await choose('bad.csv', 'code,name,kind\n' + `${code},Import test site,spaceship\n`);
  await expect(page.getByText('1 problem found.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Problems found in the file' }).getByText('kind')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  await assertAccessible(page);

  await choose(`${code}.csv`, 'code,name,kind\n' + `${code},Import test site,site\n`);
  await expect(page.getByText('The file is ready.')).toBeVisible();
  // By keyboard, as in the other admin tests: it also proves the button is reachable without a pointer.
  await page.getByRole('button', { name: 'Import 1 locations' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Imported 1 locations.')).toBeVisible();

  const history = page.getByRole('row').filter({ hasText: `${code}.csv` });
  await expect(history.getByText('Imported')).toBeVisible();
  await page.getByRole('button', { name: `Undo the import of ${code}.csv` }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(`Undid the import of ${code}.csv.`)).toBeVisible();
  await expect(history.getByText('Undone')).toBeVisible();
});

test('import and export is closed to a requester', async ({ page }) => {
  await signInAs(page, 'requester');
  await page.goto('/app/admin/import');
  await expect(page).not.toHaveURL(/\/admin\/import/);
});

test('a Super User sees every site with its business calendar', async ({ page }) => {
  await signInAs(page, 'superuser');
  await page.goto('/app/admin/calendars');
  await expect(page.getByRole('heading', { name: 'Business calendars', level: 2 })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Opening hours' })).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toContainText(/\d\d:\d\d to \d\d:\d\d/);
  await expect(page.getByRole('link', { name: /calendar for/ }).first()).toBeVisible();
  await assertAccessible(page);
});

test('business calendars are closed to a requester', async ({ page }) => {
  await signInAs(page, 'requester');
  await page.goto('/app/admin/calendars');
  await expect(page).not.toHaveURL(/\/admin\/calendars/);
});
