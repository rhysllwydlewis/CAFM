/**
 * Proves row-level security holds for the application role (cafm_app), which
 * is what the API connects as. Needs a migrated and seeded database.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient, seedId, withAccount, withTenant, type Tx } from '../src';

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

it('isolates Helpdesk catalogue, requests and notifications and denies a cross-tenant location', async () => {
  const [types, requests, notices] = await Promise.all([
    db.requestType.count(),
    db.serviceRequest.count(),
    db.notification.count(),
  ]);
  expect([types, requests, notices]).toEqual([0, 0, 0]);
  expect(await withTenant(db, demo, (tx) => tx.serviceRequest.count())).toBeGreaterThan(0);
  const starterType = await withTenant(db, starter, (tx) => tx.requestType.findFirstOrThrow());
  const foreignLocation = seedId('location:demo-estates:CDF');
  await expect(
    withTenant(db, starter, (tx) =>
      tx.serviceRequest.create({
        data: {
          tenantId: starter,
          number: 'REQ-T1',
          title: 'Outside',
          description: 'Outside',
          locationId: foreignLocation,
          typeId: starterType.id,
          status: 'new',
          channel: 'portal',
          impact: 2,
          urgency: 2,
          priority: 3,
          submissionKey: 'foreign-location',
          submissionHash: 'test',
        },
      }),
    ),
  ).rejects.toThrow(/Foreign key constraint/);
  expect(await withTenant(db, starter, (tx) => tx.notification.count())).toBe(0);
});

it('isolates work orders and their timeline and refuses foreign locations, requests and people', async () => {
  expect([await db.workOrder.count(), await db.workOrderEntry.count()]).toEqual([0, 0]);
  const [jobs, entries] = await withTenant(db, demo, (tx) =>
    Promise.all([tx.workOrder.count(), tx.workOrderEntry.count()]),
  );
  expect(jobs).toBeGreaterThan(0);
  expect(entries).toBeGreaterThan(0);
  expect(await withTenant(db, starter, (tx) => Promise.all([tx.workOrder.count(), tx.workOrderEntry.count()]))).toEqual(
    [0, 0],
  );

  const base = {
    tenantId: starter,
    title: 'Outside',
    description: 'Outside',
    impact: 2,
    urgency: 2,
    priority: 3,
    submissionHash: 'test',
  };
  const starterLocation = await withTenant(db, starter, (tx) => tx.location.findFirstOrThrow());
  const demoRequest = seedId('request:demo-estates:REQ-10480');
  const demoTechnician = seedId('membership:demo-estates:technician');
  const make = (data: object) =>
    withTenant(db, starter, (tx) =>
      tx.workOrder.create({
        data: {
          ...base,
          number: 'WO-T-' + randomUUID().slice(0, 8),
          submissionKey: randomUUID(),
          locationId: starterLocation.id,
          ...data,
        } as never,
      }),
    );
  await expect(make({ locationId: seedId('location:demo-estates:CDF') })).rejects.toThrow(/Foreign key constraint/);
  await expect(make({ requestId: demoRequest })).rejects.toThrow(/Foreign key constraint/);
  await expect(make({ assigneeId: demoTechnician })).rejects.toThrow(/Foreign key constraint/);
  // The database refuses states the API never produces.
  await expect(make({ status: 'nonsense' })).rejects.toThrow(/work_order_status_valid/);
  await expect(make({ status: 'paused' })).rejects.toThrow(/work_order_pause_valid/);
  await expect(make({ priority: 9 })).rejects.toThrow(/work_order_levels_valid/);
  await expect(make({ title: '   ' })).rejects.toThrow(/work_order_text_valid/);

  // A notification cannot point at another organisation's job either.
  const someone = await withTenant(db, starter, (tx) => tx.membership.findFirstOrThrow());
  await expect(
    withTenant(db, starter, (tx) =>
      tx.notification.create({
        data: {
          tenantId: starter,
          workOrderId: seedId('work-order:demo-estates:WO-10412'),
          recipientId: someone.id,
          eventKey: 'foreign-' + randomUUID(),
          title: 'Foreign',
          body: 'Foreign',
        },
      }),
    ),
  ).rejects.toThrow(/Foreign key constraint/);
  // A notification points at one thing at most.
  await expect(
    withTenant(db, demo, (tx) =>
      tx.notification.create({
        data: {
          tenantId: demo,
          workOrderId: seedId('work-order:demo-estates:WO-10412'),
          requestId: seedId('request:demo-estates:REQ-10480'),
          eventKey: 'two-targets-' + randomUUID(),
          title: 'Two',
          body: 'Two',
        },
      }),
    ),
  ).rejects.toThrow(/notification_one_target/);
  // A job in one organisation cannot be written to from another, nor can a timeline entry point at it.
  const demoJob = await withTenant(db, demo, (tx) => tx.workOrder.findFirstOrThrow());
  await expect(
    withTenant(db, starter, (tx) =>
      tx.workOrderEntry.create({ data: { tenantId: starter, workOrderId: demoJob.id, kind: 'comment', body: 'Hi' } }),
    ),
  ).rejects.toThrow(/Foreign key constraint/);
  expect(
    await withTenant(db, starter, (tx) => tx.workOrder.updateMany({ where: { id: demoJob.id }, data: { title: 'x' } })),
  ).toEqual({ count: 0 });
});

it('isolates work order costs and refuses figures the API never produces', async () => {
  expect(await db.workOrderCost.count()).toBe(0);
  // Other tests add costs to jobs of their own, so look at the seeded boiler job.
  const boiler = { workOrderId: seedId('work-order:demo-estates:WO-10412') };
  const [costs, total] = await withTenant(db, demo, async (tx) => [
    await tx.workOrderCost.count({ where: boiler }),
    (await tx.workOrderCost.aggregate({ where: boiler, _sum: { amountMinor: true } }))._sum.amountMinor,
  ]);
  expect(costs).toBe(3);
  // The demo boiler job: 2.5 hours at £46.00, a £48.90 valve and a £22.50 sealing kit.
  expect(total).toBe(18_640);
  expect(await withTenant(db, starter, (tx) => tx.workOrderCost.count())).toBe(0);

  const job = await withTenant(db, demo, (tx) =>
    tx.workOrder.findUniqueOrThrow({ where: { id: seedId('work-order:demo-estates:WO-10412') } }),
  );
  expect(job).toMatchObject({ currency: 'GBP', nteMinor: 75_000 });
  const cost = (tenantId: string, data: object = {}) =>
    withTenant(db, tenantId, (tx) =>
      tx.workOrderCost.create({
        data: {
          tenantId,
          workOrderId: job.id,
          kind: 'expense',
          description: 'Parking',
          quantityMilli: 1000,
          unitCostMinor: 650,
          amountMinor: 650,
          incurredOn: new Date('2026-11-23T00:00:00Z'),
          ...data,
        } as never,
      }),
    );
  // A cost cannot be put on another organisation's job.
  await expect(cost(starter)).rejects.toThrow(/Foreign key constraint/);
  expect(
    await withTenant(db, starter, (tx) => tx.workOrderCost.deleteMany({ where: { workOrderId: job.id } })),
  ).toEqual({ count: 0 });
  // Nor can the database hold a negative amount, an unknown kind, labour with no type, or an overrun with no reason.
  await expect(cost(demo, { amountMinor: -1 })).rejects.toThrow(/work_order_cost_amounts_valid/);
  await expect(cost(demo, { quantityMilli: 0 })).rejects.toThrow(/work_order_cost_amounts_valid/);
  await expect(cost(demo, { amountMinor: 1_000_000_001 })).rejects.toThrow(/work_order_cost_amounts_valid/);
  await expect(cost(demo, { kind: 'bribe' })).rejects.toThrow(/work_order_cost_kind_valid/);
  await expect(cost(demo, { kind: 'labour' })).rejects.toThrow(/work_order_cost_labour_valid/);
  await expect(cost(demo, { labourType: 'on_site' })).rejects.toThrow(/work_order_cost_labour_valid/);
  await expect(cost(demo, { overNte: true })).rejects.toThrow(/work_order_cost_override_valid/);
  await expect(cost(demo, { overNteReason: 'Agreed' })).rejects.toThrow(/work_order_cost_override_valid/);
  await expect(cost(demo, { description: '  ' })).rejects.toThrow(/work_order_cost_text_valid/);
  await expect(
    withTenant(db, demo, (tx) => tx.workOrder.updateMany({ where: { id: job.id }, data: { currency: 'pounds' } })),
  ).rejects.toThrow(/work_order_currency_valid/);
  await expect(
    withTenant(db, demo, (tx) => tx.workOrder.updateMany({ where: { id: job.id }, data: { nteMinor: -1 } })),
  ).rejects.toThrow(/work_order_nte_valid/);
});

it('isolates checklists, sign-offs and job photos and refuses answers the API never produces', async () => {
  for (const count of [
    db.checklistTemplate.count(),
    db.workOrderChecklist.count(),
    db.workOrderChecklistItem.count(),
    db.workOrderSignature.count(),
  ]) {
    expect(await count).toBe(0);
  }
  const boilerJob = seedId('work-order:demo-estates:WO-10412');
  const checklist = seedId('work-order-checklist:demo-estates:boiler');
  // The demo boiler job has the plant room checklist, all answered, and the organisation keeps three templates.
  const seen = await withTenant(db, demo, async (tx) => ({
    templates: await tx.checklistTemplate.count({ where: { active: true } }),
    steps: await tx.workOrderChecklistItem.count({ where: { checklistId: checklist } }),
    waiting: await tx.workOrderChecklistItem.count({ where: { checklistId: checklist, required: true, answer: null } }),
  }));
  expect(seen).toEqual({ templates: 3, steps: 5, waiting: 0 });
  expect(
    await withTenant(db, starter, async (tx) => [
      await tx.checklistTemplate.count(),
      await tx.workOrderChecklist.count(),
      await tx.workOrderChecklistItem.count(),
    ]),
  ).toEqual([0, 0, 0]);
  expect(
    await withTenant(db, starter, (tx) =>
      tx.workOrderChecklistItem.updateMany({ where: { checklistId: checklist }, data: { label: 'x' } }),
    ),
  ).toEqual({ count: 0 });

  // A checklist cannot be put on another organisation's job, nor a step on another organisation's checklist.
  await expect(
    withTenant(db, starter, (tx) =>
      tx.workOrderChecklist.create({ data: { tenantId: starter, workOrderId: boilerJob, title: 'Theirs' } }),
    ),
  ).rejects.toThrow(/Foreign key constraint/);
  const step = (tenantId: string, data: object = {}) =>
    withTenant(db, tenantId, (tx) =>
      tx.workOrderChecklistItem.create({
        data: { tenantId, checklistId: checklist, position: 99, kind: 'tick', label: 'Extra', ...data } as never,
      }),
    );
  await expect(step(starter)).rejects.toThrow(/Foreign key constraint/);
  // Nor can the database hold an answer that does not fit its kind, an unanswered step with a time, or a failure
  // with no reason.
  const answered = new Date('2026-11-23T10:00:00Z');
  await expect(step(demo, { kind: 'tickle' })).rejects.toThrow(/work_order_checklist_item_kind_valid/);
  await expect(step(demo, { kind: 'tick', answer: 'yes', answeredAt: answered })).rejects.toThrow(
    /work_order_checklist_item_answer_valid/,
  );
  await expect(step(demo, { kind: 'pass_fail', answer: 'maybe', answeredAt: answered })).rejects.toThrow(
    /work_order_checklist_item_answer_valid/,
  );
  await expect(step(demo, { kind: 'pass_fail', answer: 'fail', answeredAt: answered })).rejects.toThrow(
    /work_order_checklist_item_answer_valid/,
  );
  await expect(step(demo, { kind: 'number', answer: '1,4', answeredAt: answered })).rejects.toThrow(
    /work_order_checklist_item_answer_valid/,
  );
  await expect(step(demo, { kind: 'tick', answer: 'done' })).rejects.toThrow(/work_order_checklist_item_answer_valid/);
  await expect(step(demo, { kind: 'tick', answeredAt: answered })).rejects.toThrow(
    /work_order_checklist_item_answer_valid/,
  );
  await expect(step(demo, { kind: 'tick', unit: 'bar' })).rejects.toThrow(/work_order_checklist_item_text_valid/);
  await expect(step(demo, { label: ' ' })).rejects.toThrow(/work_order_checklist_item_text_valid/);
  await expect(
    withTenant(db, demo, (tx) =>
      tx.workOrderChecklist.create({ data: { tenantId: demo, workOrderId: boilerJob, title: 'X', gate: 'sometimes' } }),
    ),
  ).rejects.toThrow(/work_order_checklist_gate_valid/);
  await expect(
    withTenant(db, demo, (tx) => tx.checklistTemplate.create({ data: { tenantId: demo, name: 'Empty', items: [] } })),
  ).rejects.toThrow(/checklist_template_items_valid/);
  await expect(
    withTenant(db, demo, (tx) =>
      tx.workOrderSignature.create({
        data: { tenantId: demo, workOrderId: boilerJob, role: 'witness', signerName: 'X', attachmentId: randomUUID() },
      }),
    ),
  ).rejects.toThrow(/work_order_signature_role_valid/);

  // A file belongs to exactly one record, and only a job's photo has a phase and a caption.
  const file = (data: object) =>
    withTenant(db, demo, (tx) =>
      tx.recordAttachment.create({
        data: {
          tenantId: demo,
          filename: 'a.png',
          mediaType: 'image/png',
          byteLength: 1,
          checksum: 'x',
          ...data,
        } as never,
      }),
    );
  await expect(file({ workOrderId: boilerJob, assetId: seedId('asset:demo-estates:boiler-2') })).rejects.toThrow(
    /record_attachment_parent_check/,
  );
  await expect(file({ workOrderId: boilerJob, phase: 'during' })).rejects.toThrow(/record_attachment_phase_valid/);
  await expect(file({ workOrderId: boilerJob, caption: 'x'.repeat(151) })).rejects.toThrow(
    /record_attachment_caption_valid/,
  );
  await expect(file({ requestId: randomUUID(), phase: 'before' })).rejects.toThrow(/record_attachment_/);
});

it('isolates planned maintenance and refuses schedules the API never produces', async () => {
  for (const count of [db.ppmTaskTemplate.count(), db.ppmSchedule.count(), db.ppmScheduleAsset.count()]) {
    expect(await count).toBe(0);
  }
  // The demo estate has its maintenance library and schedules, and no other organisation sees them.
  const seen = await withTenant(db, demo, async (tx) => ({
    templates: await tx.ppmTaskTemplate.count({ where: { active: true } }),
    schedules: await tx.ppmSchedule.count({
      where: { number: { in: ['PPM-0142', 'PPM-0143', 'PPM-0144', 'PPM-0145', 'PPM-0146'] } },
    }),
    boilerAssets: await tx.ppmScheduleAsset.count({ where: { schedule: { number: 'PPM-0142' } } }),
  }));
  expect(seen.templates).toBeGreaterThanOrEqual(4);
  expect(seen).toMatchObject({ schedules: 5, boilerAssets: 2 });
  expect(
    await withTenant(db, starter, async (tx) => [
      await tx.ppmTaskTemplate.count(),
      await tx.ppmSchedule.count(),
      await tx.ppmScheduleAsset.count(),
    ]),
  ).toEqual([0, 0, 0]);
  const boiler = seedId('ppm-schedule:demo-estates:boiler');
  expect(
    await withTenant(db, starter, (tx) => tx.ppmSchedule.updateMany({ where: { id: boiler }, data: { title: 'x' } })),
  ).toEqual({ count: 0 });
  expect(
    await withTenant(db, starter, (tx) => tx.ppmScheduleAsset.deleteMany({ where: { scheduleId: boiler } })),
  ).toEqual({ count: 0 });

  const base = {
    title: 'Check',
    freqType: 'calendar',
    calendarUnit: 'month',
    interval: 1,
    startsOn: new Date('2026-12-01T00:00:00Z'),
    durationMinutes: 60,
  };
  const schedule = (tenantId: string, data: object = {}) =>
    withTenant(db, tenantId, (tx) =>
      tx.ppmSchedule.create({
        data: { tenantId, number: 'PPM-' + randomUUID().slice(0, 8), ...base, ...data } as never,
      }),
    );
  // A schedule can't point at another organisation's task, or put an asset from another organisation on it.
  const task = seedId('ppm-template:demo-estates:boiler');
  await expect(schedule(starter, { templateId: task })).rejects.toThrow(/Foreign key constraint/);
  const boilerAsset = (
    await withTenant(db, demo, (tx) => tx.ppmScheduleAsset.findFirstOrThrow({ where: { scheduleId: boiler } }))
  ).assetId;
  const starterSchedule = await schedule(starter);
  await expect(
    withTenant(db, starter, (tx) =>
      tx.ppmScheduleAsset.create({ data: { tenantId: starter, scheduleId: starterSchedule.id, assetId: boilerAsset } }),
    ),
  ).rejects.toThrow(/Foreign key constraint/);
  await withTenant(db, starter, (tx) => tx.ppmSchedule.delete({ where: { id: starterSchedule.id } }));
  // Nor can the database hold a frequency that makes no sense, a meter schedule that is not floating, an unknown
  // criticality or a lead time outside the limits.
  const frequency = /ppm_schedule_frequency_valid/;
  await expect(schedule(demo, { calendarUnit: 'fortnight' })).rejects.toThrow(frequency);
  await expect(schedule(demo, { interval: 0 })).rejects.toThrow(frequency);
  await expect(schedule(demo, { interval: null })).rejects.toThrow(frequency);
  await expect(schedule(demo, { meterName: 'Run hours' })).rejects.toThrow(frequency);
  await expect(
    schedule(demo, {
      freqType: 'meter',
      calendarUnit: null,
      interval: null,
      meterName: 'Run hours',
      meterInterval: '100',
    }),
  ).rejects.toThrow(frequency);
  await expect(
    schedule(demo, {
      freqType: 'meter',
      calendarUnit: null,
      interval: null,
      meterName: 'Run hours',
      meterInterval: '0',
      mode: 'floating',
    }),
  ).rejects.toThrow(frequency);
  await expect(schedule(demo, { mode: 'sometimes' })).rejects.toThrow(/ppm_schedule_mode_valid/);
  await expect(schedule(demo, { criticality: 'vital' })).rejects.toThrow(/ppm_schedule_criticality_valid/);
  await expect(schedule(demo, { leadDays: 400 })).rejects.toThrow(/ppm_schedule_lead_valid/);
  await expect(schedule(demo, { durationMinutes: 1 })).rejects.toThrow(/ppm_schedule_duration_valid/);
  await expect(schedule(demo, { priority: 5 })).rejects.toThrow(/ppm_schedule_priority_valid/);
  await expect(schedule(demo, { estimatedCostMinor: -1 })).rejects.toThrow(/ppm_schedule_cost_valid/);
  await expect(schedule(demo, { currency: 'pounds' })).rejects.toThrow(/ppm_schedule_currency_valid/);
  await expect(schedule(demo, { title: ' ' })).rejects.toThrow(/ppm_schedule_text_valid/);
  const template = (data: object) =>
    withTenant(db, demo, (tx) =>
      tx.ppmTaskTemplate.create({
        data: { tenantId: demo, name: 'T ' + randomUUID(), durationMinutes: 60, steps: [], ...data } as never,
      }),
    );
  await expect(template({ criticality: 'vital' })).rejects.toThrow(/ppm_task_template_criticality_valid/);
  await expect(template({ durationMinutes: 1 })).rejects.toThrow(/ppm_task_template_duration_valid/);
  await expect(template({ steps: {} })).rejects.toThrow(/ppm_task_template_steps_valid/);
  await expect(template({ name: ' ' })).rejects.toThrow(/ppm_task_template_text_valid/);
  // A job has both its PPM row and its due day, or neither.
  await expect(
    withTenant(db, demo, (tx) =>
      tx.workOrder.updateMany({
        where: { id: seedId('work-order:demo-estates:WO-10412') },
        data: { scheduledFor: new Date('2026-12-01T00:00:00Z') },
      }),
    ),
  ).rejects.toThrow(/work_order_ppm_valid/);
});

it('isolates contractor links, hides them from other organisations and looks one up only by its exact hash', async () => {
  expect(await db.workOrderContractor.count()).toBe(0);
  const job = await withTenant(db, demo, (tx) => tx.workOrder.findFirstOrThrow());
  const hash = 'test-hash-' + randomUUID();
  const link = await withTenant(db, demo, (tx) =>
    tx.workOrderContractor.create({
      data: {
        tenantId: demo,
        workOrderId: job.id,
        name: 'Sparks',
        email: 'jobs@sparks.test',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    }),
  );
  try {
    expect(await withTenant(db, starter, (tx) => tx.workOrderContractor.count())).toBe(0);
    expect(
      await withTenant(db, starter, (tx) =>
        tx.workOrderContractor.updateMany({ where: { id: link.id }, data: { name: 'x' } }),
      ),
    ).toEqual({ count: 0 });
    await expect(
      withTenant(db, starter, (tx) =>
        tx.workOrderContractor.create({
          data: {
            tenantId: starter,
            workOrderId: job.id,
            name: 'Sparks',
            email: 'jobs@sparks.test',
            tokenHash: 'other-' + randomUUID(),
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      ),
    ).rejects.toThrow(/Foreign key constraint/);
    await expect(
      withTenant(db, demo, (tx) =>
        tx.workOrderContractor.create({
          data: {
            tenantId: demo,
            workOrderId: job.id,
            name: 'Sparks',
            email: 'no-at-sign',
            tokenHash: 'bad-' + randomUUID(),
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      ),
    ).rejects.toThrow(/work_order_contractor_email_valid/);
    // Outside any organisation the link is found only by its exact hash, and nothing can be listed.
    expect(
      await db.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id FROM find_work_order_contractor(${hash})`,
    ).toEqual([{ tenant_id: demo }]);
    expect(await db.$queryRaw<unknown[]>`SELECT * FROM find_work_order_contractor('nope')`).toEqual([]);
    expect(await db.$queryRaw<unknown[]>`SELECT * FROM find_work_order_contractor('')`).toEqual([]);
  } finally {
    await withTenant(db, demo, (tx) => tx.workOrderContractor.delete({ where: { id: link.id } }));
  }
});

it('isolates asset operational records and refuses foreign parents', async () => {
  const counts = async (tx: Tx) =>
    Promise.all([
      tx.assetTag.count(),
      tx.assetMeter.count(),
      tx.assetMeterReading.count(),
      tx.assetWarranty.count(),
      tx.warrantyClaim.count(),
      tx.recordAttachment.count(),
      tx.attachmentContent.count(),
    ]);
  expect(await counts(db)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(await withTenant(db, starter, counts)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  const demoCounts = await withTenant(db, demo, counts);
  expect(demoCounts.every((count) => count > 0)).toBe(true);
  const assetId = await withTenant(db, demo, async (tx) => (await tx.assetTag.findFirstOrThrow()).assetId);
  const warrantyId = seedId('warranty:demo-estates:boiler-2');
  await expect(
    withTenant(db, starter, (tx) =>
      tx.assetTag.create({ data: { tenantId: starter, assetId, kind: 'barcode', code: 'CROSS-TENANT' } }),
    ),
  ).rejects.toThrow(/Foreign key constraint/);
  await expect(
    withTenant(db, starter, (tx) =>
      tx.warrantyClaim.create({
        data: { tenantId: starter, warrantyId, reference: 'CROSS-TENANT', status: 'closed', filedOn: new Date() },
      }),
    ),
  ).rejects.toThrow(/Foreign key constraint/);
  await expect(
    withTenant(db, starter, (tx) =>
      tx.attachmentContent.create({
        data: { tenantId: starter, id: seedId('asset-attachment:demo-estates:boiler-2'), data: Uint8Array.of(1) },
      }),
    ),
  ).rejects.toThrow(/Foreign key constraint|Unique constraint/);
});

it('isolates the phone change log and refuses outcomes the API never produces', async () => {
  const member = await withTenant(db, demo, (tx) => tx.membership.findFirstOrThrow({ where: { role: 'technician' } }));
  const row = (tenantId: string, extra: object = {}) => ({
    tenantId,
    memberId: member.id,
    key: randomUUID(),
    kind: 'note',
    requestHash: 'h',
    outcome: 'applied',
    ...extra,
  });
  const made = await withTenant(db, demo, (tx) => tx.mobileMutation.create({ data: row(demo) }));
  expect(await withTenant(db, starter, (tx) => tx.mobileMutation.count())).toBe(0);
  expect(await withTenant(db, starter, (tx) => tx.mobileMutation.deleteMany({ where: { id: made.id } }))).toEqual({
    count: 0,
  });
  // A change cannot be logged against another organisation's member.
  await expect(withTenant(db, starter, (tx) => tx.mobileMutation.create({ data: row(starter) }))).rejects.toThrow(
    /Foreign key constraint/,
  );
  await expect(
    withTenant(db, demo, (tx) => tx.mobileMutation.create({ data: row(demo, { outcome: 'maybe' }) })),
  ).rejects.toThrow(/mobile_mutation_outcome_valid/);
  await expect(
    withTenant(db, demo, (tx) => tx.mobileMutation.create({ data: row(demo, { kind: 'delete' }) })),
  ).rejects.toThrow(/mobile_mutation_kind_valid/);
  await withTenant(db, demo, (tx) => tx.mobileMutation.deleteMany({ where: { id: made.id } }));
});

it('isolates labour rates and recorded time and refuses what the API never produces', async () => {
  const boilerJob = seedId('work-order:demo-estates:WO-10412');
  const technician = seedId('membership:demo-estates:technician');
  // The demo organisation has its three rates and the technician's time on the boiler job. Another sees none.
  const seen = await withTenant(db, demo, async (tx) => ({
    rates: await tx.labourRate.count(),
    time: await tx.workOrderTime.count({ where: { workOrderId: boilerJob } }),
    posted: await tx.workOrderCost.count({ where: { time: { workOrderId: boilerJob } } }),
  }));
  expect(seen).toEqual({ rates: 3, time: 1, posted: 1 });
  expect(
    await withTenant(db, starter, async (tx) => [await tx.labourRate.count(), await tx.workOrderTime.count()]),
  ).toEqual([0, 0]);
  expect(await withTenant(db, starter, (tx) => tx.labourRate.updateMany({ data: { rateMinor: 1 } }))).toEqual({
    count: 0,
  });
  expect(await withTenant(db, starter, (tx) => tx.workOrderTime.deleteMany({}))).toEqual({ count: 0 });

  const rate = (tenantId: string, extra: object = {}) =>
    withTenant(db, tenantId, (tx) =>
      tx.labourRate.create({ data: { tenantId, labourType: 'travel', roleKey: 'x', rateMinor: 100, ...extra } }),
    );
  await expect(rate(demo, { labourType: 'holiday' })).rejects.toThrow(/labour_rate_type_valid/);
  await expect(rate(demo, { rateMinor: -1 })).rejects.toThrow(/labour_rate_amount_valid/);
  await expect(rate(demo, { currency: 'pounds' })).rejects.toThrow(/labour_rate_currency_valid/);
  await expect(rate(demo, { labourType: 'on_site', roleKey: '' })).rejects.toThrow(/Unique constraint/);

  const time = (tenantId: string, extra: object = {}) =>
    withTenant(db, tenantId, (tx) =>
      tx.workOrderTime.create({
        data: {
          tenantId,
          workOrderId: boilerJob,
          memberId: technician,
          labourType: 'on_site',
          minutes: 30,
          workedOn: new Date('2026-01-02T00:00:00Z'),
          submission: randomUUID(),
          ...extra,
        },
      }),
    );
  // Time cannot be put on another organisation's job.
  await expect(time(starter)).rejects.toThrow(/Foreign key constraint/);
  await expect(time(demo, { minutes: 0 })).rejects.toThrow(/work_order_time_minutes_valid/);
  await expect(time(demo, { minutes: 1441 })).rejects.toThrow(/work_order_time_minutes_valid/);
  await expect(time(demo, { labourType: 'holiday' })).rejects.toThrow(/work_order_time_type_valid/);
  await expect(time(demo, { rateMinor: -5 })).rejects.toThrow(/work_order_time_rate_valid/);
});

it('isolates saved list views and refuses a view owned by another organisation’s member', async () => {
  expect(await db.savedView.count()).toBe(0);
  const config = { layout: 'list', filters: {}, sort: null, group: null, columns: [] };
  const demoMember = await withTenant(db, demo, (tx) => tx.membership.findFirstOrThrow({ select: { id: true } }));
  const name = `rls-${randomUUID()}`;
  const view = (tenantId: string, ownerId: string, entity = 'assets', visibility = 'private') =>
    withTenant(db, tenantId, (tx) =>
      tx.savedView.create({ data: { tenantId, ownerId, entity, name, visibility, config } }),
    );
  const created = await view(demo, demoMember.id);
  try {
    // Another organisation sees nothing, can't change it, and can't write one into the demo organisation.
    expect(await withTenant(db, starter, (tx) => tx.savedView.count({ where: { name } }))).toBe(0);
    expect(
      await withTenant(db, starter, (tx) =>
        tx.savedView.updateMany({ where: { id: created.id }, data: { name: 'x' } }),
      ),
    ).toEqual({ count: 0 });
    expect(await withTenant(db, starter, (tx) => tx.savedView.deleteMany({ where: { id: created.id } }))).toEqual({
      count: 0,
    });
    await expect(view(starter, demoMember.id)).rejects.toThrow(/Foreign key constraint/);
    await expect(
      withTenant(db, starter, (tx) =>
        tx.savedView.create({ data: { tenantId: demo, ownerId: demoMember.id, entity: 'assets', name: 'z', config } }),
      ),
    ).rejects.toThrow(/row-level security/);
    // One name per owner and list.
    await expect(view(demo, demoMember.id)).rejects.toThrow(/Unique constraint/);
  } finally {
    await withTenant(db, demo, (tx) => tx.savedView.deleteMany({ where: { id: created.id } }));
  }
});
