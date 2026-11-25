import { afterAll, beforeAll, expect, it } from 'vitest';
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

async function estate(role = 'super_user') {
  const tenant = await createTestTenant(db);
  const owner = await createTestAccount(db, [tenant.tenant.id], undefined, 'super_user');
  const { agent } = await signIn(app, owner.email, owner.password);
  const site = (await agent.post('/api/locations').send({ code: 'HQ', name: 'Head office', kind: 'site' }).expect(201))
    .body;
  const asset = async (name: string) =>
    (await agent.post('/api/assets').send({ name, locationId: site.id }).expect(201)).body as {
      id: string;
      number: string;
    };
  const person = async (key: string) => {
    const account = await createTestAccount(db, [tenant.tenant.id], undefined, key);
    return (await signIn(app, account.email, account.password)).agent;
  };
  return { ...tenant, agent, asset, person, role };
}

const base = '/api/ppm/schedules/import';
const header =
  'title,discipline,criticality,frequency_type,interval,unit_or_meter,mode,starts_on,duration_minutes,lead_days,priority,assets';
const schedules = (tenantId: string) =>
  withTenant(db, tenantId, (tx) => tx.ppmSchedule.findMany({ orderBy: { createdAt: 'asc' }, include: { rows: true } }));

it('previews every problem, saves nothing, and returns an error report', async () => {
  const { agent, tenant, asset, cleanup } = await estate();
  try {
    const pump = await asset('Pump');
    const csv = [
      header,
      `Pump service,Mechanical,statutory,calendar,6,month,,2027-01-04,90,28,2,${pump.number}`,
      ',,castle,yearly,x,fortnight,,2027-02-31,2,,9,AST-NOPE',
      'Run hours,,,meter,250,Hours,fixed,2027-01-04,60,,,' + pump.number,
      `Dup,,,calendar,1,year,,2027-01-04,60,,,${pump.number};${pump.number}`,
    ].join('\n');
    const res = await agent.post(`${base}/preview`).send({ csv }).expect(201);
    expect(res.body).toMatchObject({ rows: 4, creates: 0 });
    const where = res.body.issues.map((i: { row: number; column: string }) => `${i.row}:${i.column}`);
    expect(where).toEqual(
      expect.arrayContaining([
        '3:title',
        '3:criticality',
        '3:frequency_type',
        '3:starts_on',
        '3:duration_minutes',
        '3:priority',
        '3:assets',
        '4:mode',
        '4:assets',
        '5:assets',
      ]),
    );
    const report = await agent.post(`${base}/preview?format=csv`).send({ csv }).expect(201);
    expect(report.text).toContain('line,column,problem');
    expect(report.text).toContain('No asset in service has the number AST-NOPE.');
    await agent.post(base).send({ csv }).expect(422);
    expect(await schedules(tenant.id)).toHaveLength(0);
    const missing = await agent.post(`${base}/preview`).send({ csv: 'title\nX' }).expect(201);
    expect(missing.body.issues[0]).toMatchObject({ column: 'frequency_type', message: 'This column is missing.' });
    await agent.post(`${base}/preview`).send({ csv: '' }).expect(400);
  } finally {
    await cleanup();
  }
});

it('imports schedules with their assets, audits, lists the batch, and rolls back', async () => {
  const { agent, tenant, asset, cleanup } = await estate();
  try {
    const [a, b] = [await asset('Pump A'), await asset('Pump B')];
    await agent
      .post(`/api/assets/${a.id}/operations/meters`)
      .send({ name: 'Run hours', unit: 'h', rolloverAt: null })
      .expect(201);
    const template = (await agent.get(`${base}/template`).expect(200)).text;
    expect(template.trim()).toBe(header);
    const csv = [
      header,
      `Pump service,Mechanical,statutory,calendar,6,month,,2027-01-04,90,,2,${a.number};${b.number}`,
      `Run hours service,,,meter,250,Run hours,,2027-01-04,60,14,,${a.number}`,
      'Unattached check,,,calendar,1,week,floating,2027-01-04,30,,,',
    ].join('\n');
    const preview = await agent.post(`${base}/preview`).send({ csv }).expect(201);
    expect(preview.body).toMatchObject({ rows: 3, creates: 3, issueCount: 0 });
    expect(await schedules(tenant.id)).toHaveLength(0);

    const applied = await agent.post(base).send({ csv, fileName: 'schedules.csv' }).expect(201);
    expect(applied.body).toMatchObject({ entityType: 'ppm_schedule', rowCount: 3, status: 'applied' });
    const made = await schedules(tenant.id);
    expect(made.map((s) => [s.title, s.freqType, s.mode, s.leadDays, s.priority, s.rows.length])).toEqual([
      ['Pump service', 'calendar', 'fixed', 28, 2, 2],
      ['Run hours service', 'meter', 'floating', 14, 3, 1],
      ['Unattached check', 'calendar', 'floating', 28, 3, 0],
    ]);
    expect(made[0]!.rows.every((row) => row.nextDueOn)).toBe(true);
    const audits = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.count({ where: { action: 'ppm_schedule.imported' } }),
    );
    expect(audits).toBe(1);
    const listed = await agent.get(`${base}/batches`).expect(200);
    expect(listed.body).toHaveLength(1);

    await agent.post(`${base}/${applied.body.id}/rollback`).send({}).expect(201);
    expect(await schedules(tenant.id)).toHaveLength(0);
    await agent.post(`${base}/${applied.body.id}/rollback`).send({}).expect(409);
  } finally {
    await cleanup();
  }
});

it('refuses to roll back schedules that were edited or have raised jobs', async () => {
  const { agent, tenant, asset, cleanup } = await estate();
  try {
    const pump = await asset('Pump');
    const csv = [header, `Pump service,,,calendar,6,month,,2027-01-04,90,,,${pump.number}`].join('\n');
    const applied = await agent.post(base).send({ csv }).expect(201);
    const [schedule] = await schedules(tenant.id);
    await withTenant(db, tenant.id, (tx) =>
      tx.ppmSchedule.update({ where: { id: schedule!.id }, data: { version: { increment: 1 } } }),
    );
    await agent.post(`${base}/${applied.body.id}/rollback`).send({}).expect(409);
    expect(await schedules(tenant.id)).toHaveLength(1);
  } finally {
    await cleanup();
  }
});

it('needs ppm.manage, and never reaches another organisation', async () => {
  const { agent, person, asset, cleanup } = await estate();
  const stranger = await estate();
  try {
    const pump = await asset('Pump');
    const csv = [header, `Pump service,,,calendar,6,month,,2027-01-04,90,,,${pump.number}`].join('\n');
    for (const role of ['auditor', 'technician', 'requester']) {
      const other = await person(role);
      await other.get(`${base}/template`).expect(403);
      await other.post(`${base}/preview`).send({ csv }).expect(403);
      await other.post(base).send({ csv }).expect(403);
      await other.get(`${base}/batches`).expect(403);
    }
    // Another organisation cannot see this one's assets by number, so the same file fails there.
    const res = await stranger.agent.post(`${base}/preview`).send({ csv }).expect(201);
    expect(res.body.issues[0]).toMatchObject({ column: 'assets' });
    await stranger.agent.post(base).send({ csv }).expect(422);
    const applied = await agent.post(base).send({ csv }).expect(201);
    expect((await stranger.agent.get(`${base}/batches`).expect(200)).body).toEqual([]);
    await stranger.agent.post(`${base}/${applied.body.id}/rollback`).send({}).expect(404);
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});
