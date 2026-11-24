import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { createTestAccount, createTestTenant, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const base = '/api/reports';

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function fixture() {
  const { tenant, cleanup } = await createTestTenant(db);
  const manager = await createTestAccount(db, [tenant.id], undefined, 'fm_manager');
  const reporter = await createTestAccount(db, [tenant.id], undefined, 'requester');
  const m = (await signIn(app, manager.email, manager.password)).agent;
  const r = (await signIn(app, reporter.email, reporter.password)).agent;
  const site = (await m.post('/api/locations').send({ code: 'MAIN', name: 'Main site', kind: 'site' }).expect(201))
    .body;
  const makeJob = async () =>
    (
      await m
        .post('/api/work-orders')
        .send({
          submissionId: randomUUID(),
          title: 'Replace pump seal',
          description: 'Pump in the plant room is weeping.',
          locationId: site.id,
          impact: 2,
          urgency: 2,
        })
        .expect(201)
    ).body;
  return { tenant, cleanup, m, r, site, makeJob, accounts: [manager, reporter] };
}

it('refuses people who are signed out or may not read reports', async () => {
  const f = await fixture();
  try {
    await request(app.getHttpServer()).get(`${base}/open-jobs-by-age`).expect(401);
    await f.r.get(`${base}/open-jobs-by-age`).expect(403);
    await f.r.get(`${base}/sla-performance`).expect(403);
    await f.r.get(`${base}/ppm-compliance`).expect(403);
    await f.r.get(`${base}/work-mix`).expect(403);
    await f.r.get(`${base}/busiest-sites`).expect(403);
    await request(app.getHttpServer()).get(`${base}/work-mix`).expect(401);
  } finally {
    await f.cleanup();
  }
});

it('counts open jobs into age bands', async () => {
  const f = await fixture();
  try {
    const old = await f.makeJob();
    await f.makeJob();
    await withTenant(db, f.tenant.id, (tx) =>
      tx.workOrder.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 40 * 86_400_000) } }),
    );
    const res = await f.m.get(`${base}/open-jobs-by-age`).expect(200);
    expect(res.body.total).toBe(2);
    const counts = Object.fromEntries(res.body.bands.map((b: { key: string; count: number }) => [b.key, b.count]));
    expect(counts).toEqual({ '0-1': 1, '2-7': 0, '8-30': 0, '31+': 1 });
  } finally {
    await f.cleanup();
  }
});

it('measures SLA performance for jobs completed in the period', async () => {
  const f = await fixture();
  try {
    const metJob = await f.makeJob();
    const lateJob = await f.makeJob();
    const now = Date.now();
    await withTenant(db, f.tenant.id, async (tx) => {
      await tx.workOrder.update({
        where: { id: metJob.id },
        data: { status: 'completed', completedAt: new Date(now), fixDueAt: new Date(now + 3_600_000) },
      });
      await tx.workOrder.update({
        where: { id: lateJob.id },
        data: { status: 'completed', completedAt: new Date(now), fixDueAt: new Date(now - 3_600_000) },
      });
    });
    const res = await f.m.get(`${base}/sla-performance`).expect(200);
    expect(res.body).toMatchObject({ measured: 2, met: 1, breached: 1, percentMet: 50 });
    await f.m.get(`${base}/sla-performance?from=2026-02-01&to=2026-01-01`).expect(422);
    await f.m.get(`${base}/sla-performance?to=2026-02-31`).expect(400);
    await f.m.get(`${base}/ppm-compliance?from=2026-13-01`).expect(400);
  } finally {
    await f.cleanup();
  }
});

it('measures PPM compliance for visits due in the period', async () => {
  const f = await fixture();
  try {
    const site = f.site;
    const assetIds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      assetIds.push(
        (
          await f.m
            .post('/api/assets')
            .send({ name: `Pump ${i}`, locationId: site.id })
            .expect(201)
        ).body.id,
      );
    }
    const created = (
      await f.m
        .post('/api/ppm/schedules')
        .send({
          title: 'Pump service',
          criticality: 'statutory',
          frequency: { type: 'calendar', unit: 'month', interval: 12 },
          mode: 'fixed',
          startsOn: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
          leadDays: 28,
          durationMinutes: 60,
          priority: 3,
          assets: assetIds.map((assetId) => ({ assetId })),
        })
        .expect(201)
    ).body;
    await f.m.post(`/api/ppm/schedules/${created.id}/generate`).send({}).expect(201);
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
    const dateOnly = (offset: number) => new Date(day(offset).toISOString().slice(0, 10) + 'T00:00:00Z');
    await withTenant(db, f.tenant.id, async (tx) => {
      const [a, b, c, d] = await tx.workOrder.findMany({ where: { type: 'ppm' }, orderBy: { title: 'asc' } });
      expect(d).toBeDefined();
      await tx.workOrder.update({
        where: { id: a!.id },
        data: { status: 'completed', scheduledFor: dateOnly(-5), completedAt: day(-6) },
      });
      await tx.workOrder.update({
        where: { id: b!.id },
        data: { status: 'completed', scheduledFor: dateOnly(-5), completedAt: day(-2) },
      });
      await tx.workOrder.update({ where: { id: c!.id }, data: { scheduledFor: dateOnly(-3) } });
      await tx.workOrder.update({ where: { id: d!.id }, data: { scheduledFor: dateOnly(0) } });
    });
    const res = await f.m.get(`${base}/ppm-compliance`).expect(200);
    expect(res.body).toMatchObject({ due: 4, onTime: 1, late: 1, overdue: 1, upcoming: 1, percentOnTime: 33 });
    await f.m.get(`${base}/ppm-compliance?from=2026-02-01&to=2026-01-01`).expect(422);
  } finally {
    await f.cleanup();
  }
});

it('never reports another organisation’s jobs', async () => {
  const a = await fixture();
  const b = await fixture();
  try {
    await a.makeJob();
    const res = await b.m.get(`${base}/open-jobs-by-age`).expect(200);
    expect(res.body.total).toBe(0);
    expect((await b.m.get(`${base}/ppm-compliance`).expect(200)).body.due).toBe(0);
    expect((await b.m.get(`${base}/work-mix`).expect(200)).body.total).toBe(0);
    expect((await b.m.get(`${base}/busiest-sites`).expect(200)).body.sites).toEqual([]);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});

it('splits jobs raised in the period into reactive and planned work', async () => {
  const f = await fixture();
  try {
    const planned = await f.makeJob();
    await f.makeJob();
    await f.makeJob();
    await withTenant(db, f.tenant.id, (tx) =>
      tx.workOrder.update({ where: { id: planned.id }, data: { type: 'ppm' } }),
    );
    const res = await f.m.get(`${base}/work-mix`).expect(200);
    expect(res.body).toMatchObject({ total: 3, reactive: 2, planned: 1, percentReactive: 67 });
    await f.m
      .get(`${base}/work-mix?from=2020-01-01&to=2020-01-31`)
      .expect(200)
      .expect((r) => {
        expect(r.body).toMatchObject({ total: 0, percentReactive: null });
      });
    await f.m.get(`${base}/work-mix?from=2026-02-01&to=2026-01-01`).expect(422);
  } finally {
    await f.cleanup();
  }
});

it('ranks the busiest sites, counting jobs in rooms below each site', async () => {
  const f = await fixture();
  try {
    const quiet = (
      await f.m.post('/api/locations').send({ code: 'QUIET', name: 'Quiet site', kind: 'site' }).expect(201)
    ).body;
    const room = (
      await f.m
        .post('/api/locations')
        .send({ code: 'R1', name: 'Room 1', kind: 'building', parentId: f.site.id })
        .expect(201)
    ).body;
    const job = await f.makeJob();
    await f.makeJob();
    await withTenant(db, f.tenant.id, (tx) =>
      tx.workOrder.update({ where: { id: job.id }, data: { locationId: room.id } }),
    );
    const res = await f.m.get(`${base}/busiest-sites`).expect(200);
    expect(res.body.sites).toEqual([{ locationId: f.site.id, name: 'Main site', jobs: 2 }]);
    expect(res.body.sites.some((s: { locationId: string }) => s.locationId === quiet.id)).toBe(false);
  } finally {
    await f.cleanup();
  }
});

it('does not name a site the reader has no access to', async () => {
  const f = await fixture();
  try {
    const building = (
      await f.m
        .post('/api/locations')
        .send({ code: 'B1', name: 'Building 1', kind: 'building', parentId: f.site.id })
        .expect(201)
    ).body;
    const job = await f.makeJob();
    await withTenant(db, f.tenant.id, async (tx) => {
      await tx.workOrder.update({ where: { id: job.id }, data: { locationId: building.id } });
      await tx.membership.update({
        where: { id: f.accounts[0]!.memberships[0]! },
        data: { locationScoped: true },
      });
      await tx.membershipSite.create({
        data: { tenantId: f.tenant.id, membershipId: f.accounts[0]!.memberships[0]!, locationId: building.id },
      });
    });
    expect((await f.m.get(`${base}/open-jobs-by-age`).expect(200)).body.total).toBe(1);
    expect((await f.m.get(`${base}/busiest-sites`).expect(200)).body.sites).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
