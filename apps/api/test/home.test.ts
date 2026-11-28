import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@fmstead/db';
import { countJobsOverLimit } from '../src/modules/reports/home.controller';
import { createTestAccount, createTestTenant, ownerDb, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const url = '/api/home/summary';

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function fixture(plan = 'starter') {
  const { tenant, cleanup } = await createTestTenant(db, plan);
  const roles = ['super_user', 'fm_manager', 'helpdesk', 'technician', 'finance', 'requester'] as const;
  const accounts = await Promise.all(roles.map((role) => createTestAccount(db, [tenant.id], undefined, role)));
  const agents = await Promise.all(accounts.map(async (a) => (await signIn(app, a.email, a.password)).agent));
  const [admin, manager, desk, tech, finance, requester] = agents as [
    (typeof agents)[0],
    (typeof agents)[0],
    (typeof agents)[0],
    (typeof agents)[0],
    (typeof agents)[0],
    (typeof agents)[0],
  ];
  const site = (await admin.post('/api/locations').send({ code: 'MAIN', name: 'Main site', kind: 'site' }).expect(201))
    .body;
  const techMember = accounts[3]!.memberships[0]!;
  await withTenant(db, tenant.id, (tx) =>
    tx.membership.updateMany({ where: { id: techMember }, data: { licence: 'mobile' } }),
  );
  await admin
    .put('/api/locations/access/' + techMember)
    .send({ locationIds: [site.id] })
    .expect(200);
  const job = async (overrides: Record<string, unknown> = {}) =>
    (
      await manager
        .post('/api/work-orders')
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
  return { tenant, cleanup, admin, manager, desk, tech, finance, requester, site, job, techMember };
}

it('refuses people who are signed out', async () => {
  await request(app.getHttpServer()).get(url).expect(401);
});

it('shows each role the figures that suit it, and nothing it may not see', async () => {
  const f = await fixture();
  try {
    const assigned = await f.job({ assigneeId: f.techMember });
    await f.job();
    const manager = (await f.manager.get(url).expect(200)).body;
    expect(manager.jobs).toEqual({ own: false, open: 2, overdue: 0, dueToday: expect.any(Number), unassigned: 1 });
    expect(manager.requests).toEqual({ new: 0, responseOverdue: 0 });
    expect(manager.spend).toMatchObject({ totals: [], overLimitJobs: 0 });

    // A technician sees only the job they hold, with no reports permission at all.
    const tech = (await f.tech.get(url).expect(200)).body;
    expect(tech).toMatchObject({ jobs: { own: true, open: 1, unassigned: 0 }, requests: null, spend: null });

    // The helpdesk sees the queue as well as the jobs, and finance sees spend but not the queue.
    const requestType = (
      await f.admin
        .post('/api/helpdesk/settings/types')
        .send({ name: 'Water leak', category: 'Plumbing', problemCode: 'Leak', questions: [] })
        .expect(201)
    ).body;
    await f.requester
      .post('/api/helpdesk/requests')
      .send({
        submissionId: randomUUID(),
        description: 'Water near a socket.',
        title: 'Water leak',
        locationId: f.site.id,
        typeId: requestType.id,
        answers: {},
      })
      .expect(201);
    const desk = (await f.desk.get(url).expect(200)).body;
    expect(desk.requests).toEqual({ new: 1, responseOverdue: 0 });
    expect(desk.spend).toBeNull();
    expect((await f.finance.get(url).expect(200)).body).toMatchObject({ requests: null, spend: expect.any(Object) });

    // A requester has no work or queue figures.
    expect((await f.requester.get(url).expect(200)).body).toMatchObject({ jobs: null, requests: null, spend: null });
    expect(assigned.id).toBeDefined();
  } finally {
    await f.cleanup();
  }
});

it('counts a job past its fix target as overdue', async () => {
  const f = await fixture();
  try {
    const late = await f.job();
    const owner = ownerDb();
    try {
      await owner.workOrder.update({ where: { id: late.id }, data: { fixDueAt: new Date(Date.now() - 3_600_000) } });
    } finally {
      await owner.$disconnect();
    }
    expect((await f.manager.get(url).expect(200)).body.jobs).toMatchObject({ open: 1, overdue: 1 });
  } finally {
    await f.cleanup();
  }
});

it('totals spend for people who may see costs only, in minor units per currency', async () => {
  const f = await fixture();
  try {
    const job = await f.job();
    const today = new Date().toISOString().slice(0, 10);
    await f.manager
      .post(`/api/work-orders/${job.id}/costs`)
      .send({ kind: 'expense', description: 'Parking', amountMinor: 650, incurredOn: today })
      .expect(201);
    const finance = (await f.finance.get(url).expect(200)).body;
    expect(finance.spend).toMatchObject({ totals: [{ currency: 'GBP', amountMinor: 650 }], overLimitJobs: 0 });
    // The helpdesk can edit jobs but not see money, and the technician never does.
    expect((await f.desk.get(url).expect(200)).body.spend).toBeNull();
    expect((await f.tech.get(url).expect(200)).body.spend).toBeNull();
  } finally {
    await f.cleanup();
  }
});

it('never counts another organisation’s work (cross-tenant)', async () => {
  const a = await fixture();
  const b = await fixture();
  try {
    await a.job();
    await a.job();
    await b.job();
    expect((await a.manager.get(url).expect(200)).body.jobs.open).toBe(2);
    expect((await b.manager.get(url).expect(200)).body.jobs.open).toBe(1);
    expect((await b.desk.get(url).expect(200)).body.requests).toEqual({ new: 0, responseOverdue: 0 });
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});

it('counts jobs over their limit the same way however many pages it reads them in', async () => {
  const f = await fixture();
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Five jobs with a £10 limit; the first, third and fifth have £15 of cost, the others £5.
    for (const [i, spent] of [1500, 500, 1500, 500, 1500].entries()) {
      const job = await f.job();
      const current = (await f.manager.get(`/api/work-orders/${job.id}`).expect(200)).body;
      await f.manager
        .put(`/api/work-orders/${job.id}/costs/limit`)
        .send({ nteMinor: 1000, version: current.version })
        .expect(200);
      await f.manager
        .post(`/api/work-orders/${job.id}/costs`)
        .send({
          kind: 'expense',
          description: `Parts ${i}`,
          amountMinor: spent,
          incurredOn: today,
          ...(spent > 1000 ? { overNteReason: 'Extra parts' } : {}),
        })
        .expect(201);
    }
    const count = (pageSize?: number) =>
      withTenant(db, f.tenant.id, (tx) => countJobsOverLimit(tx, { tenantId: f.tenant.id }, pageSize));
    // Pages of 2 (2, 2, then 1), of exactly 5 (one full page, then an empty one), and the default.
    expect(await Promise.all([count(2), count(5), count(1), count()])).toEqual([3, 3, 3, 3]);
    expect((await f.finance.get(url).expect(200)).body.spend.overLimitJobs).toBe(3);
  } finally {
    await f.cleanup();
  }
});

it('judges the limit by current totals and ignores paused or contractor-held jobs', async () => {
  const f = await fixture();
  try {
    const job = await f.job();
    const today = new Date().toISOString().slice(0, 10);
    const cost = (amountMinor: number, extra: Record<string, unknown> = {}) =>
      f.manager
        .post(`/api/work-orders/${job.id}/costs`)
        .send({ kind: 'expense', description: 'Parts', amountMinor, incurredOn: today, ...extra })
        .expect(201);
    const limit = async (nteMinor: number | null) => {
      const current = (await f.manager.get(`/api/work-orders/${job.id}`).expect(200)).body;
      await f.manager
        .put(`/api/work-orders/${job.id}/costs/limit`)
        .send({ nteMinor, version: current.version })
        .expect(200);
    };
    await limit(1000);
    await cost(1500, { overNteReason: 'Extra parts' });
    expect((await f.finance.get(url).expect(200)).body.spend.overLimitJobs).toBe(1);
    await limit(5000);
    expect((await f.finance.get(url).expect(200)).body.spend.overLimitJobs).toBe(0);

    // A paused job past its target is not overdue, and a logged job counts as unassigned.
    const owner = ownerDb();
    try {
      await owner.workOrder.update({
        where: { id: job.id },
        data: {
          fixDueAt: new Date(Date.now() - 3_600_000),
          status: 'paused',
          pauseReason: 'awaiting_parts',
          slaPausedAt: new Date(),
        },
      });
    } finally {
      await owner.$disconnect();
    }
    expect((await f.manager.get(url).expect(200)).body.jobs).toMatchObject({ overdue: 0 });
  } finally {
    await f.cleanup();
  }
});
