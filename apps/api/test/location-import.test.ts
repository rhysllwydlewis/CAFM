import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
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

async function estate(plan?: string) {
  const tenant = await createTestTenant(db, plan);
  const owner = await createTestAccount(db, [tenant.tenant.id], undefined, 'super_user');
  const { agent } = await signIn(app, owner.email, owner.password);
  return { ...tenant, owner, agent };
}

const locations = '/api/locations';
const header = 'code,name,kind,status,parent_code,address,use_class,gross_area,net_area';
const count = (tenantId: string) => withTenant(db, tenantId, (tx) => tx.location.count());

it('previews every problem, makes nothing, and returns an error report', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    await agent.post(locations).send({ code: 'OLD', name: 'Old site', kind: 'site' }).expect(201);
    const csv = [
      header,
      'S1,Main site,site,,,,,,',
      'S1,Same code again,site,,,,,,',
      'B1,Block,castle,,S1,,,,',
      'F1,Floor,floor,,NOPE,,,,',
      'OLD,Already here,site,,,,,,',
      'R1,Room,space,,S1,,,5,9',
      'G1,Ground,building,,F2,,,,',
      'F2,Floor two,floor,,G1,,,,',
    ].join('\n');
    const res = await agent.post(`${locations}/import/preview`).send({ csv }).expect(201);
    expect(res.body).toMatchObject({ creates: 0 });
    const messages = res.body.issues.map((i: { row: number; column: string }) => `${i.row}:${i.column}`);
    expect(messages).toEqual(expect.arrayContaining(['3:code', '4:kind', '5:parent_code', '6:code', '7:net_area']));
    expect(res.body.issueCount).toBeGreaterThanOrEqual(6);
    const report = await agent.post(`${locations}/import/preview?format=csv`).send({ csv }).expect(201);
    expect(report.headers['content-type']).toContain('text/csv');
    expect(report.text).toContain('line,column,problem');
    expect(report.text).toContain('The code S1 is already used on line 2.');
    expect(await count(tenant.id)).toBe(1);
    await agent.post(`${locations}/import`).send({ csv }).expect(422);
    expect(await count(tenant.id)).toBe(1);
    await agent.post(`${locations}/import/preview`).send({ csv: 'code,name\nA,B' }).expect(201);
    const missing = await agent.post(`${locations}/import/preview`).send({ csv: 'code,name\nA,B' });
    expect(missing.body.issues[0]).toMatchObject({ column: 'kind', message: 'This column is missing.' });
    await agent.post(`${locations}/import/preview`).send({ csv: '' }).expect(400);
    await agent.post(`${locations}/import/preview`).send({ csv: 'a', extra: 1 }).expect(400);
  } finally {
    await cleanup();
  }
});

it('imports parents before children, keeps the tree, records an audit event, and rolls back', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    await agent
      .post('/api/config/fields')
      .send({ entityType: 'location', key: 'zone_code', label: 'Zone code', type: 'text' })
      .expect(201);
    const template = await agent.get(`${locations}/import/template`).expect(200);
    expect(template.text.trim()).toBe(`${header},custom.zone_code`);
    const existing = (await agent.post(locations).send({ code: 'HQ', name: 'Head office', kind: 'site' }).expect(201))
      .body;
    // The room comes before its floor, and the floor sits under a site that already exists.
    const csv = [
      `${header},custom.zone_code`,
      'rm1,"Meeting room, north",space,,f1,,,20,18,N1',
      'f1,First floor,floor,,HQ,,,,,',
      'S2,Second site,site,closed,,2 Low Road,Office,100,80,',
    ].join('\r\n');
    const preview = await agent.post(`${locations}/import/preview`).send({ csv }).expect(201);
    expect(preview.body).toMatchObject({ rows: 3, creates: 3, issueCount: 0 });
    expect(preview.body.sample.map((s: { code: string }) => s.code)).toEqual(['F1', 'S2', 'RM1']);
    const batch = (await agent.post(`${locations}/import`).send({ csv, fileName: 'estate.csv' }).expect(201)).body;
    expect(batch).toMatchObject({ entityType: 'location', rowCount: 3, status: 'applied', fileName: 'estate.csv' });
    const rows = await withTenant(db, tenant.id, (tx) => tx.location.findMany({ include: { ancestors: true } }));
    const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));
    expect(byCode.RM1).toMatchObject({ parentId: byCode.F1!.id, kind: 'space', custom: { zone_code: 'N1' } });
    expect(byCode.RM1!.details).toMatchObject({ grossArea: 20, netArea: 18 });
    expect(byCode.RM1!.ancestors.map((a) => a.ancestorId).sort()).toEqual(
      [existing.id, byCode.F1!.id, byCode.RM1!.id].sort(),
    );
    expect(byCode.S2).toMatchObject({ status: 'closed', details: { address: '2 Low Road', useClass: 'Office' } });
    await agent.post(`${locations}/import`).send({ csv }).expect(422);
    expect((await agent.get(`${locations}/import/batches`).expect(200)).body).toMatchObject([{ id: batch.id }]);
    const events = (await agent.get('/api/audit').expect(200)).body;
    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'location.imported', entityId: batch.id })]),
    );

    // An edit since the import stops the rollback, and nothing is removed.
    await agent.patch(`${locations}/${byCode.S2!.id}`).send({ name: 'Renamed', version: 1 }).expect(200);
    await agent.post(`${locations}/import/${batch.id}/rollback`).send({}).expect(409);
    expect(await count(tenant.id)).toBe(4);
    await agent.patch(`${locations}/${byCode.S2!.id}`).send({ name: 'Second site', version: 2 }).expect(200);
    // Still edited (version 3), so it stays blocked. Roll back a clean import instead.
    const clean = (
      await agent
        .post(`${locations}/import`)
        .send({ csv: `${header}\nC1,Clean site,site,,,,,,\nC2,Clean block,building,,C1,,,,` })
        .expect(201)
    ).body;
    const rolled = await agent.post(`${locations}/import/${clean.id}/rollback`).send({}).expect(201);
    expect(rolled.body).toMatchObject({ status: 'rolled_back' });
    expect(await count(tenant.id)).toBe(4);
    expect(
      await withTenant(db, tenant.id, (tx) => tx.locationPath.count({ where: { descendant: { code: 'C2' } } })),
    ).toBe(0);
    await agent.post(`${locations}/import/${clean.id}/rollback`).send({}).expect(409);
    const rollbackEvents = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.findMany({ where: { action: 'location.import_rolled_back' } }),
    );
    expect(rollbackEvents).toHaveLength(1);

    // Something now sits inside an imported location, so that import cannot be rolled back.
    const used = (
      await agent
        .post(`${locations}/import`)
        .send({ csv: `${header}\nU1,Used site,site,,,,,,` })
        .expect(201)
    ).body;
    const site = await withTenant(db, tenant.id, (tx) => tx.location.findFirstOrThrow({ where: { code: 'U1' } }));
    await agent.post(locations).send({ code: 'U2', name: 'Block', kind: 'building', parentId: site.id }).expect(201);
    await agent.post(`${locations}/import/${used.id}/rollback`).send({}).expect(409);
  } finally {
    await cleanup();
  }
});

it('imports an exported file back unchanged into another organisation', async () => {
  const first = await estate();
  const second = await estate();
  try {
    const hq = (await first.agent.post(locations).send({ code: 'HQ', name: '=Head office', kind: 'site' }).expect(201))
      .body;
    await first.agent.post(locations).send({ code: 'F1', name: 'Floor', kind: 'floor', parentId: hq.id }).expect(201);
    const exported = (await first.agent.get(`${locations}/export`).expect(200)).text;
    await second.agent.post(`${locations}/import`).send({ csv: exported }).expect(201);
    const names = await withTenant(db, second.tenant.id, (tx) => tx.location.findMany({ orderBy: { code: 'asc' } }));
    expect(names.map(({ code, name, parentId }) => [code, name, parentId !== null])).toEqual([
      ['F1', 'Floor', true],
      ['HQ', '=Head office', false],
    ]);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

it('applies the plan site limit and refuses people without location management', async () => {
  const { agent, tenant, cleanup } = await estate('free');
  try {
    const csv = `${header}\nA,Site A,site,,,,,,\nB,Site B,site,,,,,,`;
    const res = await agent.post(`${locations}/import/preview`).send({ csv }).expect(201);
    expect(res.body.issues[0].message).toContain('Your plan includes 1 sites');
    await agent.post(`${locations}/import`).send({ csv }).expect(422);
    expect(await count(tenant.id)).toBe(0);
    const member = await createTestAccount(db, [tenant.id]);
    const requester = (await signIn(app, member.email, member.password)).agent;
    await requester.get(`${locations}/import/template`).expect(403);
    await requester.post(`${locations}/import/preview`).send({ csv }).expect(403);
    await requester.post(`${locations}/import`).send({ csv }).expect(403);
    await requester.get(`${locations}/import/batches`).expect(403);
    await requester.post(`${locations}/import/00000000-0000-4000-8000-000000000000/rollback`).send({}).expect(403);
    await request(app.getHttpServer()).post(`${locations}/import`).send({ csv }).expect(401);
  } finally {
    await cleanup();
  }
});

it('keeps imports and rollbacks inside one organisation', async () => {
  const first = await estate();
  const second = await estate();
  try {
    await second.agent.post(locations).send({ code: 'THEIRS', name: 'Their site', kind: 'site' }).expect(201);
    const csv = `${header}\nT1,Block,building,,THEIRS,,,,`;
    // Another organisation's code is not a parent here, and its code is no clash.
    const res = await first.agent.post(`${locations}/import/preview`).send({ csv }).expect(201);
    expect(res.body.issues).toEqual([
      expect.objectContaining({ row: 2, column: 'parent_code', message: 'No location has the code THEIRS.' }),
    ]);
    const only = (
      await first.agent
        .post(`${locations}/import`)
        .send({ csv: `${header}\nTHEIRS,Mine,site,,,,,,` })
        .expect(201)
    ).body;
    // Their batch is invisible and cannot be rolled back from here.
    await second.agent.post(`${locations}/import/${only.id}/rollback`).send({}).expect(404);
    expect((await second.agent.get(`${locations}/import/batches`).expect(200)).body).toEqual([]);
    expect(await count(second.tenant.id)).toBe(1);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});
