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
  return { tenant, cleanup, m, r, makeJob, accounts: [manager, reporter] };
}

it('refuses people who are signed out or may not read reports', async () => {
  const f = await fixture();
  try {
    await request(app.getHttpServer()).get(`${base}/open-jobs-by-age`).expect(401);
    await f.r.get(`${base}/open-jobs-by-age`).expect(403);
    await f.r.get(`${base}/sla-performance`).expect(403);
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
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});
