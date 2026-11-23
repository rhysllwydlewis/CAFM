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

  it('sends the meters of the job’s asset, and none to a technician in another organisation (cross-tenant)', async () => {
    const one = await fixture();
    const two = await fixture();
    try {
      const asset = (await one.manager.post('/api/assets').send({ locationId: one.site.id, name: 'Pump' }).expect(201))
        .body;
      const meter = (
        await one.manager
          .post(`/api/assets/${asset.id}/operations/meters`)
          .send({ name: 'Run hours', unit: 'h', rolloverAt: '1000' })
          .expect(201)
      ).body;
      const created = (
        await one.manager
          .post('/api/work-orders')
          .send({
            submissionId: randomUUID(),
            title: 'Read the pump',
            description: 'Record the run hours.',
            locationId: one.site.id,
            assetId: asset.id,
            impact: 2,
            urgency: 2,
          })
          .expect(201)
      ).body;
      await one.manager
        .post(`/api/work-orders/${created.id}/assign`)
        .send({ version: 1, assigneeId: one.accounts.tech.memberships[0] })
        .expect(201);
      const pack = (await one.tech.get('/api/mobile/work-pack').expect(200)).body;
      expect(pack.jobs[0].assetDetail.meters).toEqual([
        { id: meter.id, name: 'Run hours', unit: 'h', rolloverAt: '1000' },
      ]);
      const other = (await two.tech.get('/api/mobile/work-pack').expect(200)).body;
      expect(JSON.stringify(other)).not.toContain(meter.id);
    } finally {
      await one.cleanup();
      await two.cleanup();
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

describe('mobile mutation queue', () => {
  const post = (
    agent: {
      post: (url: string) => {
        send: (body: object) => Promise<{
          status: number;
          body: { results: { key: string; status: string; code?: string; replayed?: boolean }[] };
        }>;
      };
    },
    ...m: object[]
  ) => agent.post('/api/mobile/mutations').send({ mutations: m });

  it('applies a change once, and answers a retry with the first outcome', async () => {
    const { cleanup, accounts, tech, job, tenant } = await fixture();
    try {
      const mine = await job(accounts.tech.memberships[0]!);
      const key = randomUUID();
      const note = { key, kind: 'note', workOrderId: mine.id, payload: { body: 'Isolated and drained.' } };
      const first = await post(tech, note);
      expect(first.status).toBe(201);
      expect(first.body.results).toEqual([{ key, status: 'applied' }]);
      const retry = await post(tech, note);
      expect(retry.body.results).toEqual([{ key, status: 'applied', replayed: true }]);
      const notes = await withTenant(db, tenant.id, (tx) =>
        tx.workOrderEntry.count({ where: { workOrderId: mine.id, kind: 'comment' } }),
      );
      expect(notes).toBe(1);
      // The same key for a different change is refused, not applied.
      const reused = await post(tech, { ...note, payload: { body: 'Something else.' } });
      expect(reused.body.results[0]).toMatchObject({ status: 'rejected', code: 'key_reused' });
    } finally {
      await cleanup();
    }
  });

  it('rejects a stale or invalid change on its own and carries on with the rest', async () => {
    const { cleanup, accounts, tech, job } = await fixture();
    try {
      const mine = await job(accounts.tech.memberships[0]!);
      const stale = {
        key: randomUUID(),
        kind: 'status',
        workOrderId: mine.id,
        payload: { version: 99, status: 'on_site' },
      };
      const bad = { key: randomUUID(), kind: 'note', workOrderId: mine.id, payload: { body: '' } };
      const good = { key: randomUUID(), kind: 'note', workOrderId: mine.id, payload: { body: 'Arrived.' } };
      const { body } = await post(tech, stale, bad, good);
      expect(body.results.map((r: { status: string; code?: string }) => [r.status, r.code])).toEqual([
        ['rejected', 'conflict'],
        ['rejected', 'invalid'],
        ['applied', undefined],
      ]);
      // A rejection is kept too, so a retry gives the same answer.
      const again = await post(tech, stale);
      expect(again.body.results[0]).toMatchObject({ status: 'rejected', code: 'conflict', replayed: true });
    } finally {
      await cleanup();
    }
  });

  it('moves a job on and answers a checklist step', async () => {
    const { cleanup, accounts, tech, manager, job } = await fixture();
    try {
      const mine = await job(accounts.tech.memberships[0]!);
      const list = (
        await manager
          .post(`/api/work-orders/${mine.id}/checklists`)
          .send({
            title: 'Pre-start',
            gate: 'start',
            items: [{ kind: 'pass_fail', label: 'Isolated', required: true }],
          })
          .expect(201)
      ).body[0];
      const answer = {
        key: randomUUID(),
        kind: 'checklist_answer',
        workOrderId: mine.id,
        checklistId: list.id,
        itemId: list.items[0].id,
        payload: { answer: 'pass' },
      };
      const current = (await tech.get(`/api/work-orders/${mine.id}`).expect(200)).body;
      const status = {
        key: randomUUID(),
        kind: 'status',
        workOrderId: mine.id,
        payload: { version: current.version, status: 'on_site' },
      };
      // Going on site is held back until the required step is answered.
      const held = await post(tech, status);
      expect(held.body.results[0]).toMatchObject({ status: 'rejected', code: 'invalid' });
      expect((await post(tech, answer)).body.results[0]!.status).toBe('applied');
      const go = { ...status, key: randomUUID() };
      expect((await post(tech, go)).body.results[0]!.status).toBe('applied');
      expect((await tech.get(`/api/work-orders/${mine.id}`).expect(200)).body.status).toBe('on_site');
    } finally {
      await cleanup();
    }
  });

  it('records a meter reading once', async () => {
    const { cleanup, accounts, tech, manager, site, tenant } = await fixture();
    try {
      void accounts;
      const asset = (await manager.post('/api/assets').send({ locationId: site.id, name: 'Pump' }).expect(201)).body;
      const meter = (
        await manager
          .post(`/api/assets/${asset.id}/operations/meters`)
          .send({ name: 'Run hours', unit: 'h', rolloverAt: '1000' })
          .expect(201)
      ).body;
      const reading = {
        key: randomUUID(),
        kind: 'meter_reading',
        assetId: asset.id,
        meterId: meter.id,
        payload: { value: '120', rolledOver: false, submission: randomUUID() },
      };
      expect((await post(tech, reading)).body.results[0]!.status).toBe('applied');
      expect((await post(tech, reading)).body.results[0]).toMatchObject({ status: 'applied', replayed: true });
      const rows = await withTenant(db, tenant.id, (tx) =>
        tx.assetMeterReading.count({ where: { meterId: meter.id } }),
      );
      expect(rows).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it('cannot change another organisation’s job or another technician’s, and checks the batch (cross-tenant)', async () => {
    const one = await fixture();
    const two = await fixture();
    try {
      const theirs = await two.job(two.accounts.tech.memberships[0]!);
      const sneaky = { key: randomUUID(), kind: 'note', workOrderId: theirs.id, payload: { body: 'Not mine.' } };
      expect((await post(one.tech, sneaky)).body.results[0]).toMatchObject({ status: 'rejected', code: 'not_found' });
      const others = await one.job(one.accounts.other.memberships[0]!);
      const notMine = {
        key: randomUUID(),
        kind: 'note',
        workOrderId: others.id,
        payload: { body: 'Not mine either.' },
      };
      expect((await post(one.tech, notMine)).body.results[0]).toMatchObject({ status: 'rejected', code: 'not_found' });
      // The log is per organisation: another organisation's technician can't replay the key.
      const replay = await post(two.tech, { ...sneaky, workOrderId: theirs.id });
      expect(replay.body.results[0]).toEqual({ key: sneaky.key, status: 'applied' });
      expect((await post(one.tech)).status).toBe(400);
      expect((await post(one.tech, { key: 'x', kind: 'note' })).status).toBe(400);
      expect((await post(one.reporter, sneaky)).status).toBe(403);
    } finally {
      await one.cleanup();
      await two.cleanup();
    }
  });

  it('refuses every kind of change to a role that may only read jobs (wrong role)', async () => {
    const { cleanup, accounts, tech, manager, job, site, tenant } = await fixture();
    try {
      const mine = await job(accounts.tech.memberships[0]!);
      const asset = (await manager.post('/api/assets').send({ locationId: site.id, name: 'Pump' }).expect(201)).body;
      const meter = (
        await manager
          .post(`/api/assets/${asset.id}/operations/meters`)
          .send({ name: 'Run hours', unit: 'h', rolloverAt: '1000' })
          .expect(201)
      ).body;
      // The queue calls the website's handlers directly, so each must check the role itself.
      await withTenant(db, tenant.id, (tx) =>
        tx.role.updateMany({ where: { key: 'technician' }, data: { permissions: ['work_orders.read'] } }),
      );
      const current = (await tech.get(`/api/work-orders/${mine.id}`).expect(200)).body;
      const changes = [
        { kind: 'status', workOrderId: mine.id, payload: { version: current.version, status: 'on_site' } },
        { kind: 'note', workOrderId: mine.id, payload: { body: 'Not allowed.' } },
        {
          kind: 'time',
          workOrderId: mine.id,
          payload: {
            labourType: 'on_site',
            minutes: 30,
            workedOn: new Date().toISOString().slice(0, 10),
            submission: randomUUID(),
          },
        },
        {
          kind: 'checklist_answer',
          workOrderId: mine.id,
          checklistId: randomUUID(),
          itemId: randomUUID(),
          payload: { answer: 'pass' },
        },
        {
          kind: 'meter_reading',
          assetId: asset.id,
          meterId: meter.id,
          payload: { value: '5', rolledOver: false, submission: randomUUID() },
        },
      ].map((change) => ({ key: randomUUID(), ...change }));
      const { body } = await post(tech, ...changes);
      expect(body.results.map((r) => [r.status, r.code])).toEqual(changes.map(() => ['rejected', 'forbidden']));
      const counts = await withTenant(db, tenant.id, async (tx) => ({
        notes: await tx.workOrderEntry.count({ where: { workOrderId: mine.id, kind: 'comment' } }),
        time: await tx.workOrderTime.count({ where: { workOrderId: mine.id } }),
        readings: await tx.assetMeterReading.count({ where: { meterId: meter.id } }),
      }));
      expect(counts).toEqual({ notes: 0, time: 0, readings: 0 });
    } finally {
      await cleanup();
    }
  });

  it('needs a signed-in person', async () => {
    const { default: request } = await import('supertest');
    await request(app.getHttpServer()).post('/api/mobile/mutations').send({ mutations: [] }).expect(401);
  });
});
