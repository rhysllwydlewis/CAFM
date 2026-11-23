import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { createTestAccount, createTestTenant, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function fixture() {
  const { tenant, cleanup } = await createTestTenant(db);
  const accounts = {
    admin: await createTestAccount(db, [tenant.id], undefined, 'super_user'),
    manager: await createTestAccount(db, [tenant.id], undefined, 'fm_manager'),
    tech: await createTestAccount(db, [tenant.id], undefined, 'technician'),
    other: await createTestAccount(db, [tenant.id], undefined, 'technician'),
    reporter: await createTestAccount(db, [tenant.id], undefined, 'requester'),
  };
  const logIn = async ({ email, password }: { email: string; password: string }) =>
    (await signIn(app, email, password)).agent;
  const [admin, manager, tech, other, reporter] = await Promise.all(Object.values(accounts).map(logIn));
  const site = (await admin!.post('/api/locations').send({ code: 'MAIN', name: 'Main site', kind: 'site' }).expect(201))
    .body;
  for (const who of [accounts.tech, accounts.other]) {
    await withTenant(db, tenant.id, (tx) =>
      tx.membership.updateMany({ where: { id: who.memberships[0]! }, data: { licence: 'mobile' } }),
    );
    await admin!
      .put('/api/locations/access/' + who.memberships[0])
      .send({ locationIds: [site.id] })
      .expect(200);
  }
  const job = async (assignee: string | null, title = 'Replace pump seal') => {
    const created = (
      await manager!
        .post('/api/work-orders')
        .send({
          submissionId: randomUUID(),
          title,
          description: 'Pump in the plant room is weeping.',
          locationId: site.id,
          impact: 2,
          urgency: 2,
        })
        .expect(201)
    ).body;
    if (!assignee) return created;
    const res = await manager!.post(`/api/work-orders/${created.id}/assign`).send({ version: 1, assigneeId: assignee });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body) + JSON.stringify(created).slice(0, 200));
    return created;
  };
  return { tenant, cleanup, accounts, manager: manager!, tech: tech!, other: other!, reporter: reporter!, job, site };
}

describe('mobile work pack', () => {
  it('holds only the technician’s own open jobs, with checklists and a sync token', async () => {
    const { cleanup, accounts, tech, manager, job } = await fixture();
    try {
      const mine = await job(accounts.tech.memberships[0]!, 'Mine');
      await job(accounts.other.memberships[0]!, 'Someone else’s');
      await job(null, 'Unassigned');
      await manager
        .post(`/api/work-orders/${mine.id}/checklists`)
        .send({
          title: 'Pre-start',
          gate: 'start',
          items: [{ kind: 'pass_fail', label: 'Isolated', required: true }],
        })
        .expect(201);
      const pack = (await tech.get('/api/mobile/work-pack').expect(200)).body;
      expect(pack.jobs.map((j: { title: string }) => j.title)).toEqual(['Mine']);
      expect(pack.jobs[0].checklists[0]).toMatchObject({ title: 'Pre-start', outstanding: 1 });
      expect(pack.jobs[0].location.name).toBe('Main site');
      expect(new Date(pack.syncToken).getTime()).not.toBeNaN();
    } finally {
      await cleanup();
    }
  });

  it('sends only what changed since the token, and the ids still held', async () => {
    const { cleanup, accounts, tech, manager, job } = await fixture();
    try {
      const a = await job(accounts.tech.memberships[0]!, 'A');
      const b = await job(accounts.tech.memberships[0]!, 'B');
      const first = (await tech.get('/api/mobile/work-pack').expect(200)).body;
      const quiet = (await tech.get('/api/mobile/changes').query({ since: first.syncToken }).expect(200)).body;
      expect(quiet.jobs).toEqual([]);
      expect(quiet.jobIds.sort()).toEqual([a.id, b.id].sort());

      await new Promise((r) => setTimeout(r, 20));
      await manager
        .post(`/api/work-orders/${a.id}/checklists`)
        .send({ title: 'Check', gate: 'completion', items: [{ kind: 'pass_fail', label: 'Safe', required: false }] })
        .expect(201);
      const changed = (await tech.get('/api/mobile/changes').query({ since: quiet.syncToken }).expect(200)).body;
      expect(changed.jobs.map((j: { id: string }) => j.id)).toEqual([a.id]);

      // Reassigning a job drops it from the phone: it is no longer in jobIds.
      const fresh = (await manager.get(`/api/work-orders/${b.id}`).expect(200)).body;
      await manager
        .post(`/api/work-orders/${b.id}/assign`)
        .send({ version: fresh.version, assigneeId: accounts.other.memberships[0] })
        .expect(201);
      const after = (await tech.get('/api/mobile/changes').query({ since: changed.syncToken }).expect(200)).body;
      expect(after.jobIds).toEqual([a.id]);
    } finally {
      await cleanup();
    }
  });

  it('refuses a bad or future token and someone without access to jobs', async () => {
    const { cleanup, tech, reporter } = await fixture();
    try {
      await tech.get('/api/mobile/changes').query({ since: 'yesterday-ish' }).expect(400);
      await tech.get('/api/mobile/changes').expect(400);
      await tech
        .get('/api/mobile/changes')
        .query({ since: new Date(Date.now() + 3_600_000).toISOString() })
        .expect(400);
      await reporter.get('/api/mobile/work-pack').expect(403);
    } finally {
      await cleanup();
    }
  });

  it('never shows another organisation’s jobs (cross-tenant)', async () => {
    const one = await fixture();
    const two = await fixture();
    try {
      await one.job(one.accounts.tech.memberships[0]!, 'Tenant one job');
      await two.job(two.accounts.tech.memberships[0]!, 'Tenant two job');
      const packOne = (await one.tech.get('/api/mobile/work-pack').expect(200)).body;
      const packTwo = (await two.tech.get('/api/mobile/work-pack').expect(200)).body;
      expect(packOne.jobs.map((j: { title: string }) => j.title)).toEqual(['Tenant one job']);
      expect(packTwo.jobs.map((j: { title: string }) => j.title)).toEqual(['Tenant two job']);
      const ids = packTwo.jobs.map((j: { id: string }) => j.id);
      const changes = (await one.tech.get('/api/mobile/changes').query({ since: '2000-01-01T00:00:00Z' }).expect(200))
        .body;
      expect(changes.jobIds).not.toEqual(expect.arrayContaining(ids));
    } finally {
      await one.cleanup();
      await two.cleanup();
    }
  });

  it('needs a signed-in person', async () => {
    const { default: request } = await import('supertest');
    await request(app.getHttpServer()).get('/api/mobile/work-pack').expect(401);
    await request(app.getHttpServer())
      .get('/api/mobile/changes')
      .query({ since: new Date().toISOString() })
      .expect(401);
  });
});
