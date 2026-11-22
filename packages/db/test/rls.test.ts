/**
 * Proves row-level security holds for the application role (cafm_app), which
 * is what the API connects as. Needs a migrated and seeded database.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient, seedId, withAccount, withTenant } from '../src';

const url = process.env.APP_DATABASE_URL;
if (!url) throw new Error('APP_DATABASE_URL is required for the RLS tests');
const db = new PrismaClient({ datasourceUrl: url });
afterAll(() => db.$disconnect());

const demo = seedId('tenant:demo-estates');
const starter = seedId('tenant:starter-demo');

it('isolates location records, paths and site grants and rejects a cross-tenant parent', async () => {
  const site = seedId('location:demo-estates:CDF');
  expect(await db.location.count()).toBe(0);
  expect(await db.locationPath.count()).toBe(0);
  expect(await db.membershipSite.count()).toBe(0);
  const demoSite = await withTenant(db, demo, (tx) => tx.location.findUnique({ where: { id: site } }));
  expect(demoSite?.code).toBe('CDF');
  const starterRows = await withTenant(db, starter, async (tx) => ({
    locations: await tx.location.findMany(),
    paths: await tx.locationPath.findMany(),
    grants: await tx.membershipSite.findMany(),
  }));
  expect(starterRows.locations.map(({ code }) => code)).toEqual(['ST-WH']);
  expect(starterRows.paths).toHaveLength(1);
  expect(starterRows.grants).toEqual([]);
  await expect(
    withTenant(db, starter, (tx) =>
      tx.location.create({
        data: { tenantId: starter, parentId: site, code: 'OUTSIDE', name: 'Outside', kind: 'space' },
      }),
    ),
  ).rejects.toThrow(/Foreign key constraint/);
});

it('isolates assets and classes, and rejects a cross-tenant location, parent or class', async () => {
  const boilerClass = seedId('asset-class:demo-estates:BOILER');
  expect(await db.asset.count()).toBe(0);
  expect(await db.assetClass.count()).toBe(0);
  const demoAssets = await withTenant(db, demo, (tx) => tx.asset.findMany({ include: { class: true } }));
  expect(demoAssets).toHaveLength(10);
  const boilerAsset = demoAssets.find(({ number }) => number === 'AST-00003');
  expect(boilerAsset).toMatchObject({ name: 'Boiler 2', class: { code: 'BOILER' } });
  const boiler = boilerAsset!.id;
  const starterRows = await withTenant(db, starter, async (tx) => ({
    assets: await tx.asset.findMany(),
    classes: await tx.assetClass.findMany(),
    demoAsset: await tx.asset.findUnique({ where: { id: boiler } }),
  }));
  expect(starterRows.assets.map(({ name }) => name)).toEqual(['Dock leveller 1']);
  expect(starterRows.classes).toHaveLength(13);
  expect(starterRows.demoAsset).toBeNull();
  const starterSite = seedId('location:starter-demo:ST-WH');
  const demoSite = seedId('location:demo-estates:CDF');
  const create = (data: { locationId?: string; parentId?: string; classId?: string }) =>
    withTenant(db, starter, (tx) =>
      tx.asset.create({
        data: { tenantId: starter, locationId: starterSite, number: 'X-1', name: 'Outside', ...data },
      }),
    );
  await expect(create({ locationId: demoSite })).rejects.toThrow(/Foreign key constraint/);
  await expect(create({ parentId: boiler })).rejects.toThrow(/Foreign key constraint/);
  await expect(create({ classId: boilerClass })).rejects.toThrow(/Foreign key constraint/);
});

it('isolates what assets serve, and refuses links across organisations, to nothing, to two things or to itself', async () => {
  expect(await db.assetServes.count()).toBe(0);
  const demoLinks = await withTenant(db, demo, (tx) => tx.assetServes.findMany({ include: { asset: true } }));
  expect(demoLinks.length).toBeGreaterThanOrEqual(5);
  expect(demoLinks.some(({ asset }) => asset.name === 'LTHW heating system')).toBe(true);
  expect(await withTenant(db, starter, (tx) => tx.assetServes.count())).toBe(0);

  const starterAsset = await withTenant(db, starter, (tx) => tx.asset.findFirstOrThrow());
  const demoAsset = demoLinks[0]!.assetId;
  const demoSite = seedId('location:demo-estates:CDF');
  const link = (data: Record<string, unknown>) =>
    withTenant(db, starter, (tx) =>
      tx.assetServes.create({ data: { tenantId: starter, assetId: starterAsset.id, ...data } as never }),
    );
  await expect(link({ locationId: demoSite })).rejects.toThrow(/Foreign key constraint/);
  await expect(link({ servedAssetId: demoAsset })).rejects.toThrow(/Foreign key constraint/);
  await expect(link({})).rejects.toThrow(/asset_serves_one_target/);
  await expect(
    link({ locationId: seedId('location:starter-demo:ST-WH'), servedAssetId: starterAsset.id }),
  ).rejects.toThrow(/asset_serves_one_target|asset_serves_not_self/);
  await expect(link({ servedAssetId: starterAsset.id })).rejects.toThrow(/asset_serves_not_self/);

  // A place can be named once per asset.
  const site = seedId('location:starter-demo:ST-WH');
  await withTenant(db, starter, (tx) =>
    tx.assetServes.create({ data: { tenantId: starter, assetId: starterAsset.id, locationId: site } }),
  );
  try {
    await expect(link({ locationId: site })).rejects.toThrow(/Unique constraint/);
  } finally {
    await withTenant(db, starter, (tx) => tx.assetServes.deleteMany({ where: { assetId: starterAsset.id } }));
  }
});

it('refuses locations the database rules forbid, whatever the API checks', async () => {
  const make = (code: string, data: Record<string, unknown>) =>
    withTenant(db, starter, (tx) =>
      tx.location.create({ data: { tenantId: starter, code, name: 'Rule', kind: 'site', ...data } }),
    );
  await expect(make('RULE-1', { kind: 'campus' })).rejects.toThrow(/location_kind_check/);
  await expect(make('RULE-2', { status: 'demolished' })).rejects.toThrow(/location_status_check/);
  await expect(make('RULE-3', { version: 0 })).rejects.toThrow(/location_version_check/);
  await expect(make('RULE-4', { name: '  ' })).rejects.toThrow(/location_text_check/);
  await expect(make('  ', {})).rejects.toThrow(/location_text_check/);
});

it('refuses assets the database rules forbid, whatever the API checks', async () => {
  const site = seedId('location:starter-demo:ST-WH');
  const make = (n: number, data: Record<string, unknown>) =>
    withTenant(db, starter, (tx) =>
      tx.asset.create({ data: { tenantId: starter, locationId: site, number: `RULE-${n}`, name: 'Rule', ...data } }),
    );
  await expect(make(1, { status: 'broken' })).rejects.toThrow(/asset_status_check/);
  await expect(make(2, { criticality: 'urgent' })).rejects.toThrow(/asset_criticality_check/);
  await expect(make(3, { condition: 'E' })).rejects.toThrow(/asset_condition_check/);
  await expect(make(4, { replacementCostMinor: -1 })).rejects.toThrow(/asset_cost_check/);
  await expect(make(5, { currency: 'pounds' })).rejects.toThrow(/asset_currency_check/);
  await expect(make(6, { expectedLifeYears: 0 })).rejects.toThrow(/asset_life_check/);
  // A reference is never reused within a tenant.
  await expect(make(7, { number: 'AST-00001' })).rejects.toThrow(/Unique constraint/);
});

describe('row-level security on membership', () => {
  it('connects as a role that cannot bypass RLS', async () => {
    const [row] = await db.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    expect(row).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it('returns nothing when no tenant is set (fails closed)', async () => {
    expect(await db.membership.count()).toBe(0);
  });

  it('returns only the current tenant’s rows', async () => {
    const rows = await withTenant(db, starter, (tx) => tx.membership.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([starter]));
  });

  it('cannot read another tenant’s row even by id', async () => {
    const demoRow = seedId('membership:demo-estates:superuser');
    const found = await withTenant(db, starter, (tx) => tx.membership.findUnique({ where: { id: demoRow } }));
    expect(found).toBeNull();
  });

  it('cannot write a row into another tenant', async () => {
    const write = withTenant(db, starter, (tx) =>
      tx.membership.create({
        data: { tenantId: demo, accountId: seedId('account:starter'), role: 'requester', licence: 'requester' },
      }),
    );
    await expect(write).rejects.toThrow(/row-level security/);
  });

  it('cannot move a row into another tenant', async () => {
    const id = seedId('membership:starter-demo:starter');
    const move = withTenant(db, starter, (tx) => tx.membership.update({ where: { id }, data: { tenantId: demo } }));
    await expect(move).rejects.toThrow(/row-level security/);
  });

  it('lets an account see only its own memberships during sign-in', async () => {
    const rows = await withAccount(db, seedId('account:technician'), (tx) => tx.membership.findMany());
    expect(rows.map((r) => r.id)).toEqual([seedId('membership:demo-estates:technician')]);
  });

  it('never lets the sign-in (account) context change memberships', async () => {
    const accountId = seedId('account:technician');
    const changed = await withAccount(db, accountId, async (tx) => ({
      updated: (await tx.membership.updateMany({ where: { accountId }, data: { role: 'super_user' } })).count,
      deleted: (await tx.membership.deleteMany({ where: { accountId } })).count,
    }));
    expect(changed).toEqual({ updated: 0, deleted: 0 });
    const insert = withAccount(db, accountId, (tx) =>
      tx.membership.create({ data: { tenantId: starter, accountId, role: 'super_user', licence: 'full' } }),
    );
    await expect(insert).rejects.toThrow(/row-level security/);
  });

  it('cannot read or change the migration history', async () => {
    await expect(db.$queryRaw`SELECT count(*) FROM "_prisma_migrations"`).rejects.toThrow(/permission denied/);
  });

  it('does not leak the tenant context to the next transaction', async () => {
    await withTenant(db, demo, (tx) => tx.membership.count());
    expect(await db.membership.count()).toBe(0);
  });

  it('rejects a tenant id that is not a UUID', async () => {
    await expect(withTenant(db, "x' OR 1=1 --", (tx) => tx.membership.count())).rejects.toThrow(/UUID/);
  });
});

describe('row-level security on access, audit and outbox tables', () => {
  it('roles are isolated per tenant', async () => {
    const roles = await withTenant(db, starter, (tx) => tx.role.findMany());
    expect(roles.length).toBeGreaterThan(0);
    expect(new Set(roles.map((r) => r.tenantId))).toEqual(new Set([starter]));
    const write = withTenant(db, starter, (tx) =>
      tx.role.create({ data: { tenantId: demo, key: 'custom_x', name: 'X', permissions: [] } }),
    );
    await expect(write).rejects.toThrow(/row-level security/);
  });

  it('audit events are append-only for the app', async () => {
    const event = await withTenant(db, starter, (tx) =>
      tx.auditEvent.create({ data: { tenantId: starter, action: 'test.rls', entityType: 'test' } }),
    );
    const update = withTenant(db, starter, (tx) =>
      tx.auditEvent.update({ where: { id: event.id }, data: { action: 'forged' } }),
    );
    await expect(update).rejects.toThrow(/permission denied/);
    const remove = withTenant(db, starter, (tx) => tx.auditEvent.deleteMany({ where: { id: event.id } }));
    await expect(remove).rejects.toThrow(/permission denied/);
  });

  it('the outbox can only be claimed and completed through its functions', async () => {
    const msg = await withTenant(db, starter, (tx) =>
      tx.outboxMessage.create({ data: { tenantId: starter, topic: 'test.rls', payload: { n: 1 } } }),
    );
    const edit = withTenant(db, starter, (tx) =>
      tx.outboxMessage.update({ where: { id: msg.id }, data: { topic: 'x' } }),
    );
    await expect(edit).rejects.toThrow(/permission denied/);
    // Claimed across tenants without any tenant set, then completed.
    const claimed = await db.$queryRaw<{ id: string; attempts: number }[]>`SELECT id, attempts FROM claim_outbox(100)`;
    expect(claimed.find((c) => c.id === msg.id)?.attempts).toBe(1);
    await db.$executeRaw`SELECT complete_outbox(${msg.id}::uuid, NULL)`;
    const again = await db.$queryRaw<{ id: string }[]>`SELECT id FROM claim_outbox(100)`;
    expect(again.find((c) => c.id === msg.id)).toBeUndefined();
  });

  it('entitlement overrides are read-only for the app', async () => {
    const write = withTenant(db, starter, (tx) =>
      tx.tenantEntitlement.create({ data: { tenantId: starter, feature: 'space', enabled: true } }),
    );
    await expect(write).rejects.toThrow(/permission denied/);
  });
});

describe('every tenant table is protected', () => {
  // Platform tables with an optional tenant_id that are deliberately not RLS-scoped
  // (ADR 0004: accounts, sessions and sign-in events are global). Adding to this
  // list needs a reason in review.
  const PLATFORM_TABLES = ['auth_event', 'captured_email', 'session'];

  it('has row-level security on every table with a tenant_id column', async () => {
    const rows = await db.$queryRaw<{ table_name: string; rls: boolean }[]>`
      SELECT c.table_name, cl.relrowsecurity AS rls
      FROM information_schema.columns c
      JOIN pg_class cl ON cl.relname = c.table_name
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = c.table_schema
      WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'`;
    const unprotected = rows.filter((r) => !r.rls && !PLATFORM_TABLES.includes(r.table_name)).map((r) => r.table_name);
    expect(rows.length).toBeGreaterThan(5);
    expect(unprotected).toEqual([]);
  });

  it('invites are isolated per tenant and only findable by exact token hash', async () => {
    const invite = await withTenant(db, demo, (tx) =>
      tx.invite.create({
        data: {
          tenantId: demo,
          email: 'rls@test.example',
          role: 'requester',
          licence: 'requester',
          tokenHash: `rls-${Date.now()}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    );
    expect(await withTenant(db, starter, (tx) => tx.invite.findUnique({ where: { id: invite.id } }))).toBeNull();
    const found = await db.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id FROM find_invite(${invite.tokenHash})`;
    expect(found).toEqual([{ tenant_id: demo }]);
    expect(await db.$queryRaw<unknown[]>`SELECT * FROM find_invite('nope')`).toEqual([]);
    await withTenant(db, demo, (tx) => tx.invite.delete({ where: { id: invite.id } }));
  });
});
