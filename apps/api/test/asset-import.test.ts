import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient, withTenant } from '@fmstead/db';
import { createTestAccount, createTestTenant, ownerDb, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const owner = ownerDb();

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
  await owner.$disconnect();
});

async function estate(plan?: string) {
  const tenant = await createTestTenant(db, plan);
  const owner = await createTestAccount(db, [tenant.tenant.id], undefined, 'super_user');
  const { agent } = await signIn(app, owner.email, owner.password);
  await agent.post('/api/locations').send({ code: 'HQ', name: 'Head office', kind: 'site' }).expect(201);
  return { ...tenant, owner, agent };
}

const assets = '/api/assets';
const header =
  'ref,name,location_code,parent,class,status,make,model,serial,installed_on,supplier,expected_life_years,replacement_cost_minor,currency,criticality,condition';
const count = (tenantId: string) => withTenant(db, tenantId, (tx) => tx.asset.count());

it('previews every problem, makes nothing, and returns an error report', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const csv = [
      header,
      'a,Boiler,HQ,,,in_service,,,,2026-02-31,,,,,,',
      'a,Pump,NOWHERE,,,,,,,,,,,,,',
      'c,Fan,HQ,,Ghost class,,,,,,,,12.5,,,',
      'd,Door,HQ,zz,,castle,,,,,,,,GBP,,',
      'e,Lift,HQ,e,,,,,,,,,,,,',
    ].join('\n');
    const res = await agent.post(`${assets}/import/preview`).send({ csv }).expect(201);
    expect(res.body).toMatchObject({ creates: 0 });
    const where = res.body.issues.map((i: { row: number; column: string }) => `${i.row}:${i.column}`);
    expect(where).toEqual(
      expect.arrayContaining([
        '2:installed_on',
        '3:ref',
        '3:location_code',
        '4:class',
        '4:replacement_cost_minor',
        '5:status',
        '5:currency',
        '6:parent',
      ]),
    );
    const report = await agent.post(`${assets}/import/preview?format=csv`).send({ csv }).expect(201);
    expect(report.text).toContain('line,column,problem');
    expect(report.text).toContain('The ref a is already used on line 2.');
    await agent.post(`${assets}/import`).send({ csv }).expect(422);
    expect(await count(tenant.id)).toBe(0);
    const missing = await agent.post(`${assets}/import/preview`).send({ csv: 'name\nX' }).expect(201);
    expect(missing.body.issues[0]).toMatchObject({ column: 'location_code', message: 'This column is missing.' });
    await agent.post(`${assets}/import/preview`).send({ csv: '' }).expect(400);
  } finally {
    await cleanup();
  }
});

it('imports systems before components, applies attributes and custom fields, audits, and rolls back', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    await agent
      .post('/api/config/fields')
      .send({ entityType: 'asset', key: 'tag_colour', label: 'Tag colour', type: 'text' })
      .expect(201);
    await agent
      .post('/api/asset-classes')
      .send({
        scheme: 'custom',
        code: 'BOILER',
        name: 'Boilers',
        group: 'Heating',
        attributes: [{ key: 'output_kw', label: 'Output', type: 'number', unit: 'kW', required: true }],
      })
      .expect(201);
    const template = await agent.get(`${assets}/import/template`).expect(200);
    expect(template.text.trim()).toBe(`${header},custom.tag_colour`);
    const csv = [
      `${header},custom.tag_colour,attr.output_kw`,
      'burner,"Burner, main",HQ,boiler,,spare,Acme,,SN1,2024-05-01,,10,125000,gbp,HIGH,b,red,',
      'boiler,Boiler 1,hq,,boilers,,,,,,,,,,,,,45',
    ].join('\r\n');
    const preview = await agent.post(`${assets}/import/preview`).send({ csv }).expect(201);
    expect(preview.body).toMatchObject({ rows: 2, creates: 2, issueCount: 0 });
    expect(preview.body.sample.map((s: { code: string }) => s.code)).toEqual(['boiler', 'burner']);
    const batch = (await agent.post(`${assets}/import`).send({ csv, fileName: 'assets.csv' }).expect(201)).body;
    expect(batch).toMatchObject({ entityType: 'asset', rowCount: 2, status: 'applied', fileName: 'assets.csv' });
    const rows = await withTenant(db, tenant.id, (tx) => tx.asset.findMany({ orderBy: { number: 'asc' } }));
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName['Boiler 1']).toMatchObject({ attributes: { output_kw: 45 }, status: 'in_service' });
    expect(byName['Burner, main']).toMatchObject({
      parentId: byName['Boiler 1']!.id,
      status: 'spare',
      criticality: 'high',
      condition: 'B',
      replacementCostMinor: 125000,
      currency: 'GBP',
      custom: { tag_colour: 'red' },
    });
    expect(byName['Burner, main']!.installedOn?.toISOString().slice(0, 10)).toBe('2024-05-01');
    expect(rows.map(({ number }) => number)).toHaveLength(2);
    expect((await agent.get(`${assets}/import/batches`).expect(200)).body).toMatchObject([{ id: batch.id }]);
    const events = (await agent.get('/api/audit').expect(200)).body;
    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'asset.imported', entityId: batch.id })]),
    );

    // A new parent for an existing asset number, in the same site.
    const next = (
      await agent
        .post(`${assets}/import`)
        .send({ csv: `${header}\n,Gauge,HQ,${byName['Boiler 1']!.number},,,,,,,,,,,,` })
        .expect(201)
    ).body;
    // An edit since the import stops the rollback.
    await agent.patch(`${assets}/${byName['Boiler 1']!.id}`).send({ name: 'Boiler one', version: 1 }).expect(200);
    await agent.post(`${assets}/import/${batch.id}/rollback`).send({}).expect(409);
    // The gauge is a component of an asset outside its batch, and rolls back on its own.
    await agent.post(`${assets}/import/${next.id}/rollback`).send({}).expect(201);
    expect(await count(tenant.id)).toBe(2);
    const clean = (
      await agent
        .post(`${assets}/import`)
        .send({ csv: `${header}\nx,Pump,HQ,,,,,,,,,,,,,\ny,Valve,HQ,x,,,,,,,,,,,,` })
        .expect(201)
    ).body;
    const rolled = await agent.post(`${assets}/import/${clean.id}/rollback`).send({}).expect(201);
    expect(rolled.body).toMatchObject({ status: 'rolled_back' });
    expect(await count(tenant.id)).toBe(2);
    await agent.post(`${assets}/import/${clean.id}/rollback`).send({}).expect(409);
    // A component added later stops the rollback.
    const used = (
      await agent
        .post(`${assets}/import`)
        .send({ csv: `${header}\nu,Tank,HQ,,,,,,,,,,,,,` })
        .expect(201)
    ).body;
    const tank = await withTenant(db, tenant.id, (tx) => tx.asset.findFirstOrThrow({ where: { name: 'Tank' } }));
    const hq = await withTenant(db, tenant.id, (tx) => tx.location.findFirstOrThrow({ where: { code: 'HQ' } }));
    await agent.post(assets).send({ name: 'Cap', locationId: hq.id, parentId: tank.id }).expect(201);
    await agent.post(`${assets}/import/${used.id}/rollback`).send({}).expect(409);
  } finally {
    await cleanup();
  }
});

it('imports an exported file back into another organisation', async () => {
  const first = await estate();
  const second = await estate();
  try {
    const hq = await withTenant(db, first.tenant.id, (tx) => tx.location.findFirstOrThrow({ where: { code: 'HQ' } }));
    await first.agent.post(assets).send({ name: '=Chiller', locationId: hq.id, make: 'Acme' }).expect(201);
    const exported = (await first.agent.get(`${assets}/export`).expect(200)).text;
    // The export names the parent column differently, so the file is mapped as the guide says.
    const csv = exported.replace(
      'number,name,status,location_code,parent_number',
      'ref,name,status,location_code,parent',
    );
    await second.agent.post(`${assets}/import`).send({ csv }).expect(201);
    const names = await withTenant(db, second.tenant.id, (tx) => tx.asset.findMany());
    expect(names.map(({ name, make }) => [name, make])).toEqual([['=Chiller', 'Acme']]);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

it('applies the plan asset limit, and refuses people without asset management', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    await owner.tenantEntitlement.create({ data: { tenantId: tenant.id, feature: 'assets', enabled: true, limit: 2 } });
    const csv = [header, 'a,One,HQ,,,,,,,,,,,,,', 'b,Two,HQ,,,,,,,,,,,,,', 'c,Three,HQ,,,,,,,,,,,,,'].join('\n');
    const res = await agent.post(`${assets}/import/preview`).send({ csv }).expect(201);
    expect(res.body.issues[0].message).toBe('Your plan includes 2 assets and you have 0 in use. This file adds 3.');
    await agent.post(`${assets}/import`).send({ csv }).expect(422);
    expect(await count(tenant.id)).toBe(0);
    // Decommissioned assets take no place.
    const ok = [header, 'a,One,HQ,,,,,,,,,,,,,', 'b,Two,HQ,,,decommissioned,,,,,,,,,,', 'c,Three,HQ,,,,,,,,,,,,,'].join(
      '\n',
    );
    await agent.post(`${assets}/import`).send({ csv: ok }).expect(201);
    const member = await createTestAccount(db, [tenant.id]);
    const requester = (await signIn(app, member.email, member.password)).agent;
    await requester.get(`${assets}/import/template`).expect(403);
    await requester.post(`${assets}/import/preview`).send({ csv }).expect(403);
    await requester.post(`${assets}/import`).send({ csv }).expect(403);
    await requester.get(`${assets}/import/batches`).expect(403);
    await requester.post(`${assets}/import/00000000-0000-4000-8000-000000000000/rollback`).send({}).expect(403);
    await request(app.getHttpServer()).post(`${assets}/import`).send({ csv }).expect(401);
  } finally {
    await cleanup();
  }
});

it('keeps imports and rollbacks inside one organisation', async () => {
  const first = await estate();
  const second = await estate();
  try {
    await second.agent.post('/api/locations').send({ code: 'THEIRS', name: 'Their site', kind: 'site' }).expect(201);
    const res = await first.agent
      .post(`${assets}/import/preview`)
      .send({ csv: `${header}\nt,Pump,THEIRS,,,,,,,,,,,,,` })
      .expect(201);
    expect(res.body.issues).toEqual([
      expect.objectContaining({ row: 2, column: 'location_code', message: 'No location has the code THEIRS.' }),
    ]);
    const only = (
      await first.agent
        .post(`${assets}/import`)
        .send({ csv: `${header}\nm,Mine,HQ,,,,,,,,,,,,,` })
        .expect(201)
    ).body;
    await second.agent.post(`${assets}/import/${only.id}/rollback`).send({}).expect(404);
    expect((await second.agent.get(`${assets}/import/batches`).expect(200)).body).toEqual([]);
    expect(await count(second.tenant.id)).toBe(0);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

it('rejects a parent in another site and a loop of parents', async () => {
  const { agent, cleanup } = await estate();
  try {
    await agent.post('/api/locations').send({ code: 'LAB', name: 'Lab site', kind: 'site' }).expect(201);
    const csv = [
      header,
      'a,Boiler,HQ,,,,,,,,,,,,,',
      'b,Burner,LAB,a,,,,,,,,,,,,',
      'c,One,HQ,d,,,,,,,,,,,,',
      'd,Two,HQ,c,,,,,,,,,,,,',
    ].join('\n');
    const res = await agent.post(`${assets}/import/preview`).send({ csv }).expect(201);
    expect(res.body.issues).toEqual([
      expect.objectContaining({
        row: 3,
        column: 'parent',
        message: 'A component must be in the same site as its parent.',
      }),
      expect.objectContaining({ row: 4, column: 'parent', message: 'The parents in this file form a loop.' }),
      expect.objectContaining({ row: 5, column: 'parent', message: 'The parents in this file form a loop.' }),
    ]);
  } finally {
    await cleanup();
  }
});

it('finds an existing parent whatever the case of its number', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    await agent
      .post(`${assets}/import`)
      .send({ csv: `${header}\np,Pump,HQ,,,,,,,,,,,,,` })
      .expect(201);
    const pump = await withTenant(db, tenant.id, (tx) => tx.asset.findFirstOrThrow({ where: { name: 'Pump' } }));
    await agent
      .post(`${assets}/import`)
      .send({ csv: `${header}\n,Seal,HQ,${pump.number.toLowerCase()},,,,,,,,,,,,` })
      .expect(201);
    const seal = await withTenant(db, tenant.id, (tx) => tx.asset.findFirstOrThrow({ where: { name: 'Seal' } }));
    expect(seal.parentId).toBe(pump.id);
  } finally {
    await cleanup();
  }
});
