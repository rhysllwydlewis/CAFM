import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { formatMinutes, timeCostMinor } from '@cafm/shared';
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

describe('time arithmetic', () => {
  it('works out the cost in whole pence, rounding half up', () => {
    expect(timeCostMinor(90, 4800)).toBe(7200);
    expect(timeCostMinor(45, 3000)).toBe(2250);
    expect(timeCostMinor(20, 4800)).toBe(1600);
    expect(timeCostMinor(1, 50)).toBe(1); // 0.83p rounds up
    expect(timeCostMinor(1, 30)).toBe(1); // 0.5p rounds up
    expect(timeCostMinor(1, 29)).toBe(0);
    expect(timeCostMinor(1440, 100_000_000)).toBe(2_400_000_000);
  });
  it('shows minutes plainly', () => {
    expect([formatMinutes(45), formatMinutes(60), formatMinutes(90), formatMinutes(0)]).toEqual([
      '45 min',
      '1 h',
      '1 h 30 min',
      '0 min',
    ]);
  });
});

async function fixture() {
  const { tenant, cleanup } = await createTestTenant(db);
  const accounts = {
    admin: await createTestAccount(db, [tenant.id], undefined, 'super_user'),
    manager: await createTestAccount(db, [tenant.id], undefined, 'fm_manager'),
    finance: await createTestAccount(db, [tenant.id], undefined, 'finance'),
    tech: await createTestAccount(db, [tenant.id], undefined, 'technician'),
    other: await createTestAccount(db, [tenant.id], undefined, 'technician'),
    reporter: await createTestAccount(db, [tenant.id], undefined, 'requester'),
  };
  const logIn = async ({ email, password }: { email: string; password: string }) =>
    (await signIn(app, email, password)).agent;
  const [admin, manager, finance, tech, other, reporter] = await Promise.all(Object.values(accounts).map(logIn));
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
  const job = async (assignee: string) => {
    const created = (
      await manager!
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
    await manager!.post(`/api/work-orders/${created.id}/assign`).send({ version: 1, assigneeId: assignee }).expect(201);
    return created;
  };
  const today = new Date().toISOString().slice(0, 10);
  const entry = (overrides: Record<string, unknown> = {}) => ({
    labourType: 'on_site',
    minutes: 90,
    workedOn: today,
    note: 'Replaced the seal',
    submission: randomUUID(),
    ...overrides,
  });
  return {
    tenant,
    cleanup,
    accounts,
    admin: admin!,
    manager: manager!,
    finance: finance!,
    tech: tech!,
    other: other!,
    reporter: reporter!,
    job,
    entry,
  };
}

describe('labour rates', () => {
  it('are set by the people who hold the permission and seen by those who can see costs', async () => {
    const { cleanup, finance, manager, tech, reporter, admin } = await fixture();
    try {
      const set = { labourType: 'on_site', rateMinor: 4800 };
      await tech.put('/api/labour-rates').send(set).expect(403);
      await manager.put('/api/labour-rates').send(set).expect(403); // sees costs, but doesn't set rates
      await reporter.get('/api/labour-rates').expect(403);
      await tech.get('/api/labour-rates').expect(403); // the people doing the work never see rates
      const made = (await finance.put('/api/labour-rates').send(set).expect(200)).body;
      expect(made).toHaveLength(1);
      expect(made[0]).toMatchObject({ labourType: 'on_site', roleKey: '', rateMinor: 4800, currency: 'GBP' });
      expect((await manager.get('/api/labour-rates').expect(200)).body).toHaveLength(1);
      // The same slot is changed, not added to.
      expect(
        (
          await finance
            .put('/api/labour-rates')
            .send({ ...set, rateMinor: 5000 })
            .expect(200)
        ).body,
      ).toHaveLength(1);
      // A rate for a role, and it must be a real role.
      await finance
        .put('/api/labour-rates')
        .send({ ...set, roleKey: 'technician', rateMinor: 3000 })
        .expect(200);
      await finance
        .put('/api/labour-rates')
        .send({ ...set, roleKey: 'wizard' })
        .expect(404);
      // Whole pence, not negative, not absurd.
      for (const rateMinor of [-1, 1.5, 100_000_001]) {
        await finance.put('/api/labour-rates').send({ labourType: 'travel', rateMinor }).expect(400);
      }
      const rates = (await admin.get('/api/labour-rates').expect(200)).body;
      const technician = rates.find((r: { roleKey: string }) => r.roleKey === 'technician');
      await finance.delete('/api/labour-rates/' + technician.id).expect(200);
      await tech.delete('/api/labour-rates/' + technician.id).expect(403);
    } finally {
      await cleanup();
    }
  });
});

describe('time on a job', () => {
  it('is recorded without showing the technician a rate, and costed for those who can see costs', async () => {
    const { cleanup, accounts, finance, manager, tech, job, entry, tenant } = await fixture();
    try {
      await finance.put('/api/labour-rates').send({ labourType: 'on_site', rateMinor: 4800 }).expect(200);
      const mine = await job(accounts.tech.memberships[0]!);
      const body = entry();
      const done = (await tech.post(`/api/work-orders/${mine.id}/time`).send(body).expect(201)).body;
      expect(done.totalMinutes).toBe(90);
      expect(done.byType).toEqual({ on_site: 90, travel: 0, overtime: 0 });
      expect(done.items[0]).toMatchObject({ labourType: 'on_site', minutes: 90, note: 'Replaced the seal' });
      expect(JSON.stringify(done)).not.toMatch(/rateMinor|amountMinor/);
      // The technician can't read the job's costs, and the time list hides the money too.
      await tech.get(`/api/work-orders/${mine.id}/costs`).expect(403);
      expect(JSON.stringify((await tech.get(`/api/work-orders/${mine.id}/time`).expect(200)).body)).not.toMatch(
        /rateMinor|amountMinor/,
      );
      // A manager sees the rate and the amount, and the labour cost is on the job.
      const seen = (await manager.get(`/api/work-orders/${mine.id}/time`).expect(200)).body;
      expect(seen.items[0]).toMatchObject({ rateMinor: 4800, amountMinor: 7200 });
      const costs = (await manager.get(`/api/work-orders/${mine.id}/costs`).expect(200)).body;
      expect(costs.totalMinor).toBe(7200);
      expect(costs.items[0]).toMatchObject({
        kind: 'labour',
        labourType: 'on_site',
        quantityMilli: 1500,
        amountMinor: 7200,
      });
      // A retry records it once.
      await tech.post(`/api/work-orders/${mine.id}/time`).send(body).expect(201);
      expect(await withTenant(db, tenant.id, (tx) => tx.workOrderTime.count({ where: { workOrderId: mine.id } }))).toBe(
        1,
      );
      // The audit event says what was recorded.
      const audited = await withTenant(db, tenant.id, (tx) =>
        tx.auditEvent.findMany({ where: { entityId: mine.id, action: 'work_order_time.record' } }),
      );
      expect(audited).toHaveLength(1);
      expect(audited[0]!.changes).toMatchObject({ minutes: 90, costed: true, amountMinor: 7200 });
    } finally {
      await cleanup();
    }
  });

  it('uses the rate for the person’s role over the rate for everyone, and takes the rate at the time', async () => {
    const { cleanup, accounts, finance, manager, tech, job, entry } = await fixture();
    try {
      await finance.put('/api/labour-rates').send({ labourType: 'on_site', rateMinor: 4800 }).expect(200);
      await finance
        .put('/api/labour-rates')
        .send({ labourType: 'on_site', roleKey: 'technician', rateMinor: 3000 })
        .expect(200);
      const mine = await job(accounts.tech.memberships[0]!);
      await tech
        .post(`/api/work-orders/${mine.id}/time`)
        .send(entry({ minutes: 45 }))
        .expect(201);
      await finance
        .put('/api/labour-rates')
        .send({ labourType: 'on_site', roleKey: 'technician', rateMinor: 9900 })
        .expect(200);
      const items = (await manager.get(`/api/work-orders/${mine.id}/time`).expect(200)).body.items;
      expect(items[0]).toMatchObject({ rateMinor: 3000, amountMinor: 2250 }); // the later change doesn't rewrite it
    } finally {
      await cleanup();
    }
  });

  it('is kept without a cost when no rate is set, and flags a job taken over its limit', async () => {
    const { cleanup, accounts, finance, manager, tech, job, entry } = await fixture();
    try {
      const mine = await job(accounts.tech.memberships[0]!);
      await tech
        .post(`/api/work-orders/${mine.id}/time`)
        .send(entry({ labourType: 'travel', minutes: 30 }))
        .expect(201);
      expect((await manager.get(`/api/work-orders/${mine.id}/costs`).expect(200)).body.items).toEqual([]);
      expect((await manager.get(`/api/work-orders/${mine.id}/time`).expect(200)).body.items[0]).toMatchObject({
        rateMinor: null,
        amountMinor: null,
      });
      await finance.put('/api/labour-rates').send({ labourType: 'on_site', rateMinor: 6000 }).expect(200);
      const version = (await manager.get(`/api/work-orders/${mine.id}`).expect(200)).body.version;
      await manager.put(`/api/work-orders/${mine.id}/costs/limit`).send({ version, nteMinor: 1000 }).expect(200);
      await tech
        .post(`/api/work-orders/${mine.id}/time`)
        .send(entry({ minutes: 60 }))
        .expect(201);
      const costs = (await manager.get(`/api/work-orders/${mine.id}/costs`).expect(200)).body;
      expect(costs.items[0]).toMatchObject({
        amountMinor: 6000,
        overNte: true,
        overNteReason: 'Time recorded on the job',
      });
    } finally {
      await cleanup();
    }
  });

  it('refuses nonsense, closed jobs, and people who may not record or remove', async () => {
    const { cleanup, accounts, finance, manager, tech, other, reporter, job, entry } = await fixture();
    try {
      await finance.put('/api/labour-rates').send({ labourType: 'on_site', rateMinor: 4800 }).expect(200);
      const mine = await job(accounts.tech.memberships[0]!);
      const url = `/api/work-orders/${mine.id}/time`;
      for (const bad of [
        entry({ minutes: 0 }),
        entry({ minutes: 1441 }),
        entry({ minutes: 1.5 }),
        entry({ labourType: 'holiday' }),
        entry({ workedOn: 'yesterday' }),
        entry({ submission: 'x' }),
        { ...entry(), rateMinor: 1 },
      ]) {
        await tech.post(url).send(bad).expect(400);
      }
      await tech
        .post(url)
        .send(entry({ workedOn: '2999-01-01' }))
        .expect(422);
      await reporter.post(url).send(entry()).expect(403);
      await other.post(url).send(entry()).expect(404); // not their job
      const made = (await tech.post(url).send(entry()).expect(201)).body;
      const id = made.items[0].id;
      await other.delete(`${url}/${id}`).expect(404);
      // Removing the time removes the cost it made.
      expect((await manager.delete(`${url}/${id}`).expect(200)).body.items).toEqual([]);
      expect((await manager.get(`/api/work-orders/${mine.id}/costs`).expect(200)).body.totalMinor).toBe(0);
      await manager.delete(`${url}/${id}`).expect(404);
      // A closed job takes no more time.
      await manager.post(`/api/work-orders/${mine.id}/status`).send({ version: 2, status: 'cancelled' }).expect(201);
      await tech.post(url).send(entry()).expect(422);
    } finally {
      await cleanup();
    }
  });

  it('is isolated between organisations', async () => {
    const one = await fixture();
    const two = await fixture();
    try {
      await one.finance.put('/api/labour-rates').send({ labourType: 'on_site', rateMinor: 4800 }).expect(200);
      expect((await two.finance.get('/api/labour-rates').expect(200)).body).toEqual([]);
      const theirs = await two.job(two.accounts.tech.memberships[0]!);
      await one.tech.post(`/api/work-orders/${theirs.id}/time`).send(one.entry()).expect(404);
      await one.manager.get(`/api/work-orders/${theirs.id}/time`).expect(404);
      const rate = (await one.finance.get('/api/labour-rates').expect(200)).body[0];
      await two.finance.delete('/api/labour-rates/' + rate.id).expect(404);
      await one.manager.get('/api/work-orders/' + theirs.id + '/time').expect(404);
    } finally {
      await one.cleanup();
      await two.cleanup();
    }
  });

  it('can be queued on a phone and replayed safely', async () => {
    const { cleanup, accounts, finance, tech, job, entry } = await fixture();
    try {
      await finance.put('/api/labour-rates').send({ labourType: 'on_site', rateMinor: 4800 }).expect(200);
      const mine = await job(accounts.tech.memberships[0]!);
      const queued = { key: randomUUID(), kind: 'time', workOrderId: mine.id, payload: entry() };
      const first = await tech
        .post('/api/mobile/mutations')
        .send({ mutations: [queued] })
        .expect(201);
      expect(first.body.results).toEqual([{ key: queued.key, status: 'applied' }]);
      const again = await tech
        .post('/api/mobile/mutations')
        .send({ mutations: [queued] })
        .expect(201);
      expect(again.body.results[0]).toMatchObject({ status: 'applied', replayed: true });
      expect((await tech.get(`/api/work-orders/${mine.id}/time`).expect(200)).body.items).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
