import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { costAmountMinor, formatMinor, MAX_COSTS_PER_JOB, parseMoneyMinor, parseQuantityMilli } from '@cafm/shared';
import { createTestAccount, createTestTenant, ownerDb, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const jobs = '/api/work-orders';

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe('money arithmetic', () => {
  it('works out amounts from whole numbers, rounding half up', () => {
    expect(costAmountMinor(2500, 4600)).toBe(11500); // 2.5 hours at £46.00
    expect(costAmountMinor(1000, 4890)).toBe(4890);
    expect(costAmountMinor(333, 100)).toBe(33); // 0.333 of £1.00 is 33.3p
    expect(costAmountMinor(500, 3)).toBe(2); // 1.5p rounds up
    expect(costAmountMinor(1, 1)).toBe(0);
    // The largest allowed quantity at the largest allowed unit cost is still exact.
    expect(costAmountMinor(10_000_000, 100_000_000)).toBe(1_000_000_000_000);
    expect(Number.isSafeInteger(10_000_000 * 100_000_000 + 500)).toBe(true);
  });

  it('reads quantities and money from text without a floating point number', () => {
    expect(parseQuantityMilli('2.5')).toBe(2500);
    expect(parseQuantityMilli(' 12 ')).toBe(12_000);
    expect(parseQuantityMilli('0.125')).toBe(125);
    for (const bad of ['', '0', '0.000', '.5', '2.5555', '-1', 'abc', '1e3', '10000.5']) {
      expect(parseQuantityMilli(bad), bad).toBeNull();
    }
    expect(parseMoneyMinor('48.90')).toBe(4890);
    expect(parseMoneyMinor('48.9')).toBe(4890);
    expect(parseMoneyMinor('£1,250')).toBe(125_000);
    expect(parseMoneyMinor('0.07')).toBe(7);
    expect(parseMoneyMinor('19.99')).toBe(1999);
    for (const bad of ['', '-5', '48.999', 'abc', '1,25', '£', '10,000,001']) {
      expect(parseMoneyMinor(bad), bad).toBeNull();
    }
    expect(formatMinor(18640)).toBe('£186.40');
    expect(formatMinor(5)).toBe('£0.05');
    expect(formatMinor(100_000_000)).toBe('£1,000,000.00');
  });
});

async function fixture() {
  const { tenant, cleanup } = await createTestTenant(db);
  const accounts = {
    admin: await createTestAccount(db, [tenant.id], undefined, 'super_user'),
    manager: await createTestAccount(db, [tenant.id], undefined, 'fm_manager'),
    finance: await createTestAccount(db, [tenant.id], undefined, 'finance'),
    desk: await createTestAccount(db, [tenant.id], undefined, 'helpdesk'),
    tech: await createTestAccount(db, [tenant.id], undefined, 'technician'),
    reporter: await createTestAccount(db, [tenant.id], undefined, 'requester'),
  };
  const logIn = async ({ email, password }: { email: string; password: string }) =>
    (await signIn(app, email, password)).agent;
  const [admin, manager, finance, desk, tech, reporter] = await Promise.all(Object.values(accounts).map(logIn));
  const site = (await admin!.post('/api/locations').send({ code: 'MAIN', name: 'Main site', kind: 'site' }).expect(201))
    .body;
  await withTenant(db, tenant.id, (tx) =>
    tx.membership.updateMany({ where: { id: accounts.tech.memberships[0]! }, data: { licence: 'mobile' } }),
  );
  await admin!
    .put('/api/locations/access/' + accounts.tech.memberships[0])
    .send({ locationIds: [site.id] })
    .expect(200);
  const job = async (overrides: Record<string, unknown> = {}) =>
    (
      await manager!
        .post(jobs)
        .send({
          submissionId: randomUUID(),
          title: 'Replace pump seal',
          description: 'Pump in the plant room is weeping.',
          locationId: site.id,
          impact: 2,
          urgency: 2,
          ...overrides,
        })
        .expect(201)
    ).body;
  const today = new Date().toISOString().slice(0, 10);
  const labour = (overrides: Record<string, unknown> = {}) => ({
    kind: 'labour',
    labourType: 'on_site',
    description: 'Engineer, pump repair',
    quantityMilli: 2500,
    unitCostMinor: 4600,
    incurredOn: today,
    ...overrides,
  });
  return {
    tenant,
    cleanup,
    accounts,
    admin: admin!,
    manager: manager!,
    finance: finance!,
    desk: desk!,
    tech: tech!,
    reporter: reporter!,
    site,
    job,
    labour,
    today,
  };
}

it('records labour, parts, sub-contract and expenses, works the amounts out on the server and totals them', async () => {
  const { manager, finance, cleanup, job, labour, today } = await fixture();
  try {
    const created = await job();
    const url = jobs + '/' + created.id + '/costs';
    expect((await manager.get(url).expect(200)).body).toEqual({
      currency: 'GBP',
      nteMinor: null,
      totalMinor: 0,
      byKind: { labour: 0, parts: 0, subcontract: 0, expense: 0 },
      items: [],
    });

    await manager.post(url).send(labour()).expect(201);
    await manager
      .post(url)
      .send({
        kind: 'parts',
        description: 'PRV 3 bar',
        reference: 'PRV-3',
        quantityMilli: 1000,
        unitCostMinor: 4890,
        incurredOn: today,
      })
      .expect(201);
    await manager
      .post(url)
      .send({ kind: 'parts', description: 'Sealing kit', quantityMilli: 1000, unitCostMinor: 2250, incurredOn: today })
      .expect(201);
    await manager
      .post(url)
      .send({
        kind: 'subcontract',
        description: 'Crane hire',
        reference: 'INV-204',
        amountMinor: 12_000,
        incurredOn: today,
      })
      .expect(201);
    const all = (
      await manager
        .post(url)
        .send({ kind: 'expense', description: 'Parking', amountMinor: 650, incurredOn: today })
        .expect(201)
    ).body;
    // 11,500 labour + 7,140 parts + 12,000 sub-contract + 650 expenses.
    expect(all).toMatchObject({
      totalMinor: 31_290,
      byKind: { labour: 11_500, parts: 7140, subcontract: 12_000, expense: 650 },
    });
    expect(all.items).toHaveLength(5);
    expect(all.items[0]).toMatchObject({
      kind: 'labour',
      labourType: 'on_site',
      quantityMilli: 2500,
      unitCostMinor: 4600,
      amountMinor: 11_500,
      overNte: false,
      incurredOn: today,
      recordedByName: expect.any(String),
    });
    // A single amount is held as one unit at that cost.
    expect(all.items[3]).toMatchObject({
      kind: 'subcontract',
      quantityMilli: 1000,
      unitCostMinor: 12_000,
      reference: 'INV-204',
    });

    // The list and the job carry the total for people who may see costs, and no money for anyone else.
    const listed = (await manager.get(jobs + '?view=all').expect(200)).body.items.find(
      ({ id }: { id: string }) => id === created.id,
    );
    expect(listed).toMatchObject({ costTotalMinor: 31_290, currency: 'GBP' });
    expect((await finance.get(jobs + '?view=all').expect(200)).body.items[0].costTotalMinor).toBe(31_290);
  } finally {
    await cleanup();
  }
});

it('refuses figures the server would not work out for itself, and invalid costs', async () => {
  const { manager, cleanup, job, labour, today } = await fixture();
  try {
    const url = jobs + '/' + (await job()).id + '/costs';
    // The amount is never taken from the caller.
    await manager
      .post(url)
      .send({ ...labour(), amountMinor: 1 })
      .expect(400);
    await manager
      .post(url)
      .send({ kind: 'expense', description: 'Parking', amountMinor: 650, unitCostMinor: 650, incurredOn: today })
      .expect(400);
    for (const bad of [
      { quantityMilli: 0 },
      { quantityMilli: 2.5 },
      { quantityMilli: 10_000_001 },
      { unitCostMinor: -1 },
      { unitCostMinor: 46.5 },
      { unitCostMinor: 100_000_001 },
      { description: '   ' },
      { description: 'x'.repeat(201) },
      { labourType: 'weekend' },
      { incurredOn: '2999-01-01' },
      { incurredOn: 'yesterday' },
      { incurredOn: '2026-13-45' },
    ]) {
      await manager.post(url).send(labour(bad)).expect(400);
    }
    await manager
      .post(url)
      .send({ ...labour(), kind: 'bribe' })
      .expect(400);
    // Labour needs a type, and parts must not carry one.
    const { labourType: _omitted, ...noType } = labour();
    await manager.post(url).send(noType).expect(400);
    await manager
      .post(url)
      .send({
        kind: 'parts',
        labourType: 'travel',
        description: 'Seal',
        quantityMilli: 1000,
        unitCostMinor: 100,
        incurredOn: today,
      })
      .expect(400);
    // A cost too large for one job is refused even when each figure is allowed.
    await manager
      .post(url)
      .send(labour({ quantityMilli: 10_000_000, unitCostMinor: 100_000_000 }))
      .expect(422);
    expect((await manager.get(url).expect(200)).body.items).toEqual([]);
  } finally {
    await cleanup();
  }
});

it('shows costs only to people who may see them, and lets only those who can edit jobs change them', async () => {
  const { manager, finance, desk, tech, reporter, admin, cleanup, job, labour, today } = await fixture();
  try {
    const created = await job();
    const url = jobs + '/' + created.id + '/costs';
    await manager.post(url).send(labour()).expect(201);
    const expense = { kind: 'expense', description: 'Parking', amountMinor: 650, incurredOn: today };

    // The technician and the requester see no costs. Helpdesk can edit jobs but cannot see costs, so cannot change them.
    for (const agent of [tech, reporter, desk]) await agent.get(url).expect(403);
    await tech.post(url).send(expense).expect(403);
    await reporter.post(url).send(expense).expect(403);
    await desk.post(url).send(expense).expect(403);
    await desk
      .put(url + '/limit')
      .send({ version: 1, nteMinor: 1000 })
      .expect(403);
    // Finance can read costs but cannot change them.
    expect((await finance.get(url).expect(200)).body.totalMinor).toBe(11_500);
    await finance.post(url).send(expense).expect(403);
    await finance.delete(url + '/' + (await finance.get(url)).body.items[0].id).expect(403);
    await finance
      .put(url + '/limit')
      .send({ version: 1, nteMinor: 1000 })
      .expect(403);

    // No money in the list or the job for people who cannot see costs.
    for (const agent of [tech, desk]) {
      const seen = (await agent.get(jobs + '?view=all').expect(200)).body.items;
      for (const item of seen) expect(item).not.toHaveProperty('costTotalMinor');
    }
    expect(JSON.stringify((await desk.get(jobs + '/' + created.id).expect(200)).body)).not.toContain('11500');
    expect((await admin.get(url).expect(200)).body.totalMinor).toBe(11_500);
  } finally {
    await cleanup();
  }
});

it('blocks spend over the not-to-exceed limit unless the reason is given, and keeps that reason', async () => {
  const { manager, cleanup, job, tenant, today } = await fixture();
  try {
    const created = await job();
    const url = jobs + '/' + created.id + '/costs';
    const expense = (amountMinor: number, extra: object = {}) => ({
      kind: 'expense',
      description: 'Hire',
      amountMinor,
      incurredOn: today,
      ...extra,
    });
    const limit = (version: number, nteMinor: number | null) => manager.put(url + '/limit').send({ version, nteMinor });
    await limit(2, 10_000).expect(409);
    expect((await limit(1, 10_000).expect(200)).body).toMatchObject({ nteMinor: 10_000, totalMinor: 0 });

    // Up to the limit, exactly, is fine.
    await manager.post(url).send(expense(6000)).expect(201);
    await manager.post(url).send(expense(4000)).expect(201);
    // A penny over is not.
    const refused = await manager.post(url).send(expense(1)).expect(422);
    expect(refused.body).toMatchObject({ code: 'over_nte' });
    expect(refused.body.message).toContain('£100.01');
    expect(refused.body.message).toContain('£100.00');
    expect((await manager.get(url).expect(200)).body.totalMinor).toBe(10_000);

    // With a reason it is recorded, flagged, and audited.
    const over = (
      await manager
        .post(url)
        .send(expense(2500, { overNteReason: 'Extra crane hire agreed by phone' }))
        .expect(201)
    ).body;
    expect(over.totalMinor).toBe(12_500);
    expect(over.items.at(-1)).toMatchObject({
      amountMinor: 2500,
      overNte: true,
      overNteReason: 'Extra crane hire agreed by phone',
    });
    expect(over.items.filter(({ overNte }: { overNte: boolean }) => overNte)).toHaveLength(1);
    // A reason on a cost that is within the limit is not kept.
    const within = (await manager.get(url).expect(200)).body;
    await limit(2, 50_000).expect(200);
    const cheap = (
      await manager
        .post(url)
        .send(expense(100, { overNteReason: 'Not needed' }))
        .expect(201)
    ).body;
    expect(cheap.items.at(-1)).toMatchObject({ overNte: false, overNteReason: null });
    expect(within.items).toHaveLength(3);

    // A limit below what is spent is allowed, and blocks more. Clearing it lifts the block.
    expect((await limit(3, 5000).expect(200)).body).toMatchObject({ nteMinor: 5000, totalMinor: 12_600 });
    await manager.post(url).send(expense(1)).expect(422);
    expect((await limit(4, null).expect(200)).body.nteMinor).toBeNull();
    await manager.post(url).send(expense(1)).expect(201);
    await limit(5, -1).expect(400);
    await limit(5, 1_000_000_001).expect(400);
    await limit(5, 100.5).expect(400);

    const audited = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.findMany({ where: { entityId: created.id, action: { startsWith: 'work_order_cost.' } } }),
    );
    expect(audited.map(({ action }) => action).sort()).toEqual(
      [...Array(5).fill('work_order_cost.add'), ...Array(4).fill('work_order_cost.limit')].sort(),
    );
    expect(JSON.stringify(audited.map(({ changes }) => changes))).toContain('Extra crane hire agreed by phone');
  } finally {
    await cleanup();
  }
});

it('removes a cost, keeps the total right and locks costs once a job is closed or cancelled', async () => {
  const { manager, cleanup, job, labour, tenant, accounts, today } = await fixture();
  try {
    const created = await job();
    const url = jobs + '/' + created.id + '/costs';
    const first = (await manager.post(url).send(labour()).expect(201)).body.items[0];
    const second = (
      await manager
        .post(url)
        .send({ kind: 'expense', description: 'Parking', amountMinor: 650, incurredOn: today })
        .expect(201)
    ).body.items[1];
    await manager.delete(url + '/' + randomUUID()).expect(404);
    const removed = (await manager.delete(url + '/' + first.id).expect(200)).body;
    expect(removed).toMatchObject({ totalMinor: 650, byKind: { labour: 0, expense: 650 } });
    expect(removed.items.map(({ id }: { id: string }) => id)).toEqual([second.id]);
    await manager.delete(url + '/' + first.id).expect(404);

    // A cancelled job is locked.
    const cancelled = await job({ title: 'Cancelled job' });
    await manager
      .post(jobs + '/' + cancelled.id + '/costs')
      .send(labour())
      .expect(201);
    await manager
      .post(jobs + '/' + cancelled.id + '/status')
      .send({ version: 1, status: 'cancelled' })
      .expect(201);
    await manager
      .post(jobs + '/' + cancelled.id + '/costs')
      .send(labour())
      .expect(422);
    const [kept] = (await manager.get(jobs + '/' + cancelled.id + '/costs').expect(200)).body.items;
    await manager.delete(jobs + '/' + cancelled.id + '/costs/' + kept.id).expect(422);
    await manager
      .put(jobs + '/' + cancelled.id + '/costs/limit')
      .send({ version: 2, nteMinor: 100 })
      .expect(422);
    expect((await manager.get(jobs + '/' + cancelled.id + '/costs').expect(200)).body.items).toHaveLength(1);

    const audited = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.findMany({ where: { entityId: created.id, action: 'work_order_cost.remove' } }),
    );
    expect(audited).toHaveLength(1);
    expect(audited[0]!.actorMembershipId).toBe(accounts.manager.memberships[0]);
  } finally {
    await cleanup();
  }
});

it('stops a job holding more costs than it can sensibly carry', async () => {
  const { manager, cleanup, job, tenant, today } = await fixture();
  const owner = ownerDb();
  try {
    const created = await job();
    const url = jobs + '/' + created.id + '/costs';
    await owner.workOrderCost.createMany({
      data: Array.from({ length: MAX_COSTS_PER_JOB }, (_, index) => ({
        tenantId: tenant.id,
        workOrderId: created.id,
        kind: 'expense',
        description: 'Entry ' + index,
        quantityMilli: 1000,
        unitCostMinor: 1,
        amountMinor: 1,
        incurredOn: new Date(today + 'T00:00:00Z'),
      })),
    });
    const refused = await manager
      .post(url)
      .send({ kind: 'expense', description: 'One more', amountMinor: 1, incurredOn: today })
      .expect(422);
    expect(refused.body.message).toContain('most costs');
    // Removing one makes room again.
    const [first] = (await manager.get(url).expect(200)).body.items;
    await manager.delete(url + '/' + first.id).expect(200);
    await manager
      .post(url)
      .send({ kind: 'expense', description: 'One more', amountMinor: 1, incurredOn: today })
      .expect(201);
  } finally {
    await owner.$disconnect();
    await cleanup();
  }
});

it('keeps costs inside the organisation that owns them', async () => {
  const { manager, cleanup, job, labour } = await fixture();
  const stranger = await fixture();
  try {
    const created = await job();
    const url = jobs + '/' + created.id + '/costs';
    const cost = (await manager.post(url).send(labour()).expect(201)).body.items[0];
    // Another organisation's manager sees nothing of this job, so nothing of its costs.
    await stranger.manager.get(url).expect(404);
    await stranger.manager.post(url).send(labour()).expect(404);
    await stranger.manager.delete(url + '/' + cost.id).expect(404);
    await stranger.manager
      .put(url + '/limit')
      .send({ version: 1, nteMinor: 1 })
      .expect(404);
    expect((await manager.get(url).expect(200)).body).toMatchObject({ totalMinor: 11_500, nteMinor: null });
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});
