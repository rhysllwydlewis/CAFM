import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createTenant, PrismaClient } from '@cafm/db';

async function signIn(page: Page, persona: string) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(persona + '@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/app');
}

async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([]);
}

test('lists, filters and opens the demo assets, and keeps other organisations out', async ({ page }) => {
  await signIn(page, 'manager');
  await page.goto('/app/assets');
  await expect(page.getByRole('heading', { level: 1, name: 'Assets' })).toBeVisible();
  await expect(page.getByText('10 assets · 10 to maintain')).toBeVisible();
  const register = page.getByRole('region', { name: 'Asset register' });
  await expect(register.getByRole('row')).toHaveCount(11); // heading row and ten assets
  // Listed in reference order, with the location from the site down.
  await expect(register.getByRole('row').nth(1)).toContainText('AST-00001');
  await expect(register.getByRole('row').nth(1)).toContainText('LTHW heating system');
  await expect(register.getByRole('row').nth(1)).toContainText('Cardiff HQ › Basement › Plant room B1');
  await expect(register.getByRole('row').nth(1)).not.toContainText('Wales region');
  await assertAccessible(page);

  // Classification, search and the filter form.
  await page.getByRole('link', { name: /Heating & hot water/ }).click();
  await expect(register.getByRole('row')).toHaveCount(4);
  await page.getByRole('link', { name: /All assets/ }).click();
  await expect(register.getByRole('row')).toHaveCount(11);
  await page.getByLabel('Search', { exact: true }).fill('hamworthy');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(register.getByRole('row')).toHaveCount(3);
  await page.getByLabel('Search', { exact: true }).fill('');
  await page.getByLabel('Condition', { exact: true }).selectOption('D');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(register.getByRole('row')).toHaveCount(2);
  await expect(register).toContainText('Booster pump set');
  await page.getByLabel('Status', { exact: true }).selectOption('decommissioned');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('heading', { name: 'No assets match your filters' })).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters' }).click();
  await expect(register.getByRole('row')).toHaveCount(11);

  // The detail page.
  await page.getByRole('link', { name: 'Boiler 2', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Boiler 2' })).toBeVisible();
  const detailUrl = page.url();
  await expect(page.getByText('Condition B')).toBeVisible();
  await expect(page.getByText('Criticality: High')).toBeVisible();
  await expect(page.getByText('HW-2014-883102')).toBeVisible();
  await expect(page.getByText('254 kW')).toBeVisible();
  await expect(page.getByText('£18,500.00').first()).toBeVisible();
  await expect(page.getByText('20 years (to 2034)')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Share of expected life used' })).toBeVisible();
  await assertAccessible(page);
  await page.getByRole('link', { name: 'LTHW heating system' }).click();
  await expect(page.getByRole('link', { name: 'Boiler 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Boiler 2' })).toBeVisible();
  // What it serves, and what is affected if it goes out of service.
  const serves = page.getByRole('region', { name: 'Serves' });
  await expect(serves.getByRole('link', { name: 'Cardiff HQ › Ground' })).toBeVisible();
  await expect(serves.getByRole('link', { name: 'AHU-1' })).toBeVisible();
  await expect(serves.getByText('If this is out of service, 1 asset and 3 places are affected.')).toBeVisible();
  await assertAccessible(page);
  await page.getByRole('link', { name: 'AHU-1' }).click();
  await expect(
    page.getByRole('region', { name: 'Serves' }).getByRole('link', { name: 'LTHW heating system' }),
  ).toBeVisible();

  // Another organisation sees only its own assets, and can't open this one.
  await page.context().clearCookies();
  await signIn(page, 'starter');
  await page.goto('/app/assets');
  await expect(page.getByText('Dock leveller 1')).toBeVisible();
  await expect(page.getByText('Boiler 2')).toHaveCount(0);
  await page.goto(detailUrl);
  await expect(page.getByRole('heading', { level: 1, name: 'Asset not found' })).toBeVisible();
  await expect(page.getByText('Hamworthy')).toHaveCount(0);
});

test('a technician can read assets in their site but not change them', async ({ page }) => {
  await signIn(page, 'technician');
  await page.goto('/app/assets');
  await expect(page.getByRole('heading', { level: 1, name: 'Assets' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Boiler 2', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add asset' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Boiler 2', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await page.goto('/app/assets/new');
  await expect(page.getByText('Your role doesn’t include adding assets.')).toBeVisible();
});

test('adds, edits and decommissions an asset, with a component, class details and a cost in pounds', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const email = 'assets-' + suffix + '@test.example';
  const password = 'Pw-' + randomUUID();
  const db = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
  });
  const tenant = await createTenant(db, {
    name: 'Asset test estate',
    slug: 'assets-' + suffix,
    plan: 'starter',
    adminEmail: email,
    appUrl: 'http://localhost:3000',
  });
  const where = { tenantId: tenant.tenantId };
  try {
    const token = tenant.inviteUrl.split('/').at(-1);
    expect(
      (
        await page.request.post('/api/auth/invites/' + token + '/accept', {
          data: { name: 'Test asset manager', password, acceptTerms: true },
        })
      ).ok(),
    ).toBe(true);
    const post = async (path: string, data: object) => {
      const response = await page.request.post('/api' + path, { data });
      expect(response.ok(), path).toBe(true);
      return response.json();
    };
    const site = await post('/locations', { code: 'S', name: 'Test site', kind: 'site' });
    await post('/locations', { code: 'S-PR', name: 'Plant room', kind: 'space', parentId: site.id });
    await post('/locations', { code: 'S-F1', name: 'Floor 1', kind: 'floor', parentId: site.id });
    await post('/asset-classes', {
      scheme: 'custom',
      code: 'BOILER',
      name: 'Boilers',
      group: 'Heating',
      attributes: [
        { key: 'output_kw', label: 'Output', type: 'number', unit: 'kW', required: true, min: 1 },
        { key: 'fuel', label: 'Fuel', type: 'picklist', options: [{ value: 'gas', label: 'Gas' }] },
      ],
    });
    await post('/config/fields', {
      entityType: 'asset',
      key: 'cost_centre',
      label: 'Cost centre',
      type: 'text',
      required: true,
    });

    // Accepting the invitation signed this browser in.
    await page.goto('/app/assets');
    await expect(page.getByRole('heading', { name: 'No assets yet' })).toBeVisible();
    await page.getByRole('link', { name: 'Add asset' }).click();
    await expect(page.getByRole('heading', { name: 'Add asset' }).first()).toBeVisible();
    await assertAccessible(page);

    // A location must be chosen from the search, not just typed.
    await page.getByLabel('Name', { exact: true }).fill('Boiler A');
    await page.getByLabel('Cost centre').fill('CC-410');
    await page.getByRole('button', { name: 'Add asset' }).click();
    await expect(page.getByText('Choose a location.')).toBeVisible();

    await page.getByRole('combobox', { name: 'Location' }).fill('Plant');
    await page.getByRole('option', { name: /Plant room/ }).click();
    await page.getByLabel('Class', { exact: true }).selectOption({ label: 'Boilers' });
    await page.getByLabel('Make', { exact: true }).fill('Hamworthy');
    await page.getByLabel('Installed on').fill('2020-05-01');
    await page.getByLabel('Expected life (years)').fill('20');
    // The class's own attributes appear, and the required one must be filled in.
    await expect(page.getByLabel('Output (kW)')).toHaveAttribute('required', '');
    await page.getByLabel('Output (kW)').fill('254');
    await page.getByLabel('Fuel', { exact: true }).selectOption('gas');
    // Money is typed in pounds and has to be a plain amount.
    await page.getByLabel('Replacement cost (£)').fill('eighteen thousand');
    await page.getByRole('button', { name: 'Add asset' }).click();
    await expect(page.getByText('Enter the replacement cost as a plain amount')).toBeVisible();
    await page.getByLabel('Replacement cost (£)').fill('£18,500.50');
    await page.getByRole('button', { name: 'Add asset' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Boiler A' })).toBeVisible();
    await expect(page.getByText('AST-00001').first()).toBeVisible();
    await expect(page.getByText('254 kW')).toBeVisible();
    await expect(page.getByText('Gas', { exact: true })).toBeVisible();
    await expect(page.getByText('£18,500.50').first()).toBeVisible();
    await expect(page.getByText('CC-410')).toBeVisible();
    await expect(page.getByText('Test site › Plant room')).toBeVisible();
    await assertAccessible(page);
    // Money is stored as whole pence.
    const stored = await db.asset.findFirstOrThrow({ where });
    expect([stored.replacementCostMinor, stored.currency]).toEqual([1_850_050, 'GBP']);

    // Edit: the form starts from what was saved.
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Boiler A');
    await expect(page.getByLabel('Output (kW)')).toHaveValue('254');
    await expect(page.getByLabel('Replacement cost (£)')).toHaveValue('18500.50');
    await assertAccessible(page);
    await page.getByLabel('Name', { exact: true }).fill('Boiler A (main)');
    await page.getByLabel('Condition', { exact: true }).selectOption('B');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Boiler A (main)' })).toBeVisible();
    await expect(page.getByText('Condition B')).toBeVisible();

    // A component starts from its parent and the parent's location.
    await page.getByRole('link', { name: 'Add component' }).click();
    await expect(page.getByRole('heading', { name: 'Add a component to Boiler A (main)' })).toBeVisible();
    await expect(page.locator('form').getByText(/Boiler A \(main\) · AST-00001/)).toBeVisible();
    await expect(page.locator('form').getByText('Test site › Plant room')).toBeVisible();
    await expect(page.locator('input[name="parentId"]')).not.toHaveValue('');
    await page.getByLabel('Name', { exact: true }).fill('Burner');
    await page.getByLabel('Cost centre').fill('CC-410');
    await page.getByRole('button', { name: 'Add asset' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Burner' })).toBeVisible();
    await expect(page.getByText('AST-00002').first()).toBeVisible();
    await page.getByRole('link', { name: 'Boiler A (main)' }).click();
    await expect(page.getByRole('link', { name: 'Burner' })).toBeVisible();

    // Say what it serves: a floor and its burner. Everything is saved together.
    await page.getByRole('link', { name: 'Edit what it serves' }).click();
    await expect(page.getByRole('heading', { name: 'What Boiler A (main) serves' })).toBeVisible();
    await assertAccessible(page);
    await page.getByRole('combobox', { name: 'Add a place it serves' }).fill('Floor');
    await page.getByRole('option', { name: /Floor 1/ }).click();
    await page.getByRole('combobox', { name: 'Add an asset it serves' }).fill('Burner');
    await page.getByRole('option', { name: /Burner/ }).click();
    await expect(page.getByRole('list', { name: 'Places served' })).toContainText('Floor 1');
    await expect(page.getByRole('list', { name: 'Assets served' })).toContainText('Burner');
    // Removing and adding back works, and a place can't be listed twice.
    await page.getByRole('button', { name: 'Remove Floor 1' }).click();
    await expect(page.getByRole('list', { name: 'Places served' })).toContainText('No places yet.');
    await page.getByRole('combobox', { name: 'Add a place it serves' }).fill('Floor');
    await page.getByRole('option', { name: /Floor 1/ }).click();
    await page.getByRole('combobox', { name: 'Add a place it serves' }).fill('Floor');
    await page.getByRole('option', { name: /Floor 1/ }).click();
    await expect(page.getByRole('list', { name: 'Places served' }).getByRole('listitem')).toHaveCount(1);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const card = page.getByRole('region', { name: 'Serves' });
    await expect(card.getByRole('link', { name: 'Test site › Floor 1' })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Burner' })).toBeVisible();
    await expect(card.getByText('If this is out of service, 1 asset and 1 place are affected.')).toBeVisible();
    await card.getByRole('link', { name: 'Burner' }).click();
    await expect(
      page.getByRole('region', { name: 'Serves' }).getByRole('link', { name: 'Boiler A (main)' }),
    ).toBeVisible();
    // Backing out of "Change" keeps the parent; nothing is lost.
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Change part of (parent asset)' }).click();
    await expect(page.getByRole('combobox', { name: 'Part of (parent asset)' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep Boiler A (main)' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Burner' })).toBeVisible();
    await expect(page.getByText('Part of', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Boiler A (main)' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Boiler A (main)' })).toBeVisible();

    // The parent can't be decommissioned while its component is in use.
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Status', { exact: true }).selectOption('decommissioned');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Decommission this asset’s components first.')).toBeVisible();

    // The register reflects it all.
    await page.goto('/app/assets');
    await expect(page.getByText('2 assets · 2 to maintain')).toBeVisible();
    await expect(page.getByRole('link', { name: /Heating/ })).toBeVisible();
    await expect(page.getByText('1 component')).toBeVisible();

    // Clear takes the parent away, on purpose.
    await page.getByRole('link', { name: 'Burner' }).first().click();
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Clear part of (parent asset)' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    // The saved page, not the form (both are headed "Burner"): wait for it before checking.
    await expect(page.getByRole('link', { name: 'Edit what it serves' })).toBeVisible();
    await expect(page.getByText('Part of', { exact: true })).toHaveCount(0);
  } finally {
    const account = await db.account.findUnique({ where: { email } });
    await db.$transaction(async (tx) => {
      await tx.session.deleteMany({ where });
      await tx.asset.deleteMany({ where });
      await tx.assetClass.deleteMany({ where });
      await tx.location.deleteMany({ where });
      await tx.fieldDefinition.deleteMany({ where });
      await tx.configVersion.deleteMany({ where });
      await tx.numberSequence.deleteMany({ where });
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
