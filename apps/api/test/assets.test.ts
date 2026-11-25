import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient, withTenant } from '@cafm/db';
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

const assets = '/api/assets';
const classes = '/api/asset-classes';
const locations = '/api/locations';

async function estate(plan?: string) {
  const tenant = await createTestTenant(db, plan);
  const boss = await createTestAccount(db, [tenant.tenant.id], undefined, 'super_user');
  const { agent } = await signIn(app, boss.email, boss.password);
  return { ...tenant, boss, agent };
}
type Agent = Awaited<ReturnType<typeof estate>>['agent'];

/** Site A (floor, plant room) and Site B, as the location API builds them. */
async function tree(agent: Agent) {
  const make = async (body: object) => (await agent.post(locations).send(body).expect(201)).body;
  const siteA = await make({ code: 'A', name: 'Site A', kind: 'site' });
  const floor = await make({ code: 'A-F', name: 'Floor', kind: 'floor', parentId: siteA.id });
  const room = await make({ code: 'A-R', name: 'Plant room', kind: 'space', parentId: floor.id });
  const siteB = await make({ code: 'B', name: 'Site B', kind: 'site' });
  const region = await make({ code: 'REG', name: 'Region', kind: 'region' });
  return { siteA, floor, room, siteB, region };
}

const create = (agent: Agent, body: object) => agent.post(assets).send(body);

it('builds a hierarchy, numbers assets in order, and audits every change', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { siteA, floor, room } = await tree(agent);
    const system = (await create(agent, { name: 'Heating system', locationId: floor.id }).expect(201)).body;
    const boiler = (
      await create(agent, {
        name: 'Boiler 2',
        locationId: room.id,
        parentId: system.id,
        make: 'Hamworthy',
        model: 'Wessex ModuMax 254',
        serial: 'HW-1',
        installedOn: '2014-03-14',
        supplier: 'Heatcare Wales',
        expectedLifeYears: 20,
        replacementCost: { amountMinor: 1_850_000, currency: 'GBP' },
        criticality: 'high',
        condition: 'B',
      }).expect(201)
    ).body;
    expect([system.number, boiler.number]).toEqual(['AST-00001', 'AST-00002']);
    expect(boiler).toMatchObject({
      status: 'in_service',
      installedOn: '2014-03-14',
      replacementCost: { amountMinor: 1_850_000, currency: 'GBP' },
      locationPath: ['Site A', 'Floor', 'Plant room'],
      parentId: system.id,
      version: 1,
    });

    const detail = (await agent.get(`${assets}/${boiler.id}`).expect(200)).body;
    expect(detail).toMatchObject({
      parent: { id: system.id, number: 'AST-00001', name: 'Heating system' },
      site: { id: siteA.id, name: 'Site A' },
      componentCount: 0,
    });
    const roots = (await agent.get(`${assets}?parent=root`).expect(200)).body;
    expect(roots.items.map((a: { id: string }) => a.id)).toEqual([system.id]);
    expect(roots.items[0].componentCount).toBe(1);
    expect((await agent.get(`${assets}?parent=${system.id}`).expect(200)).body.items).toMatchObject([
      { id: boiler.id },
    ]);
    // Everything in a branch, from any level above it.
    expect((await agent.get(`${assets}?locationId=${floor.id}`).expect(200)).body.items).toHaveLength(2);
    expect((await agent.get(`${assets}?locationId=${room.id}`).expect(200)).body.items).toHaveLength(1);

    await agent.patch(`${assets}/${boiler.id}`).send({ version: 1, name: 'Boiler two' }).expect(200);
    await agent.patch(`${assets}/${boiler.id}`).send({ version: 1, name: 'Stale' }).expect(409);
    const cleared = await agent
      .patch(`${assets}/${boiler.id}`)
      .send({ version: 2, replacementCost: null, condition: null, make: null })
      .expect(200);
    expect(cleared.body).toMatchObject({ replacementCost: null, condition: null, make: null, version: 3 });

    const events = (await agent.get('/api/audit').expect(200)).body as { action: string; entityId: string }[];
    expect(events.filter((e) => e.entityId === boiler.id).map((e) => e.action)).toEqual(
      expect.arrayContaining(['asset.created', 'asset.updated']),
    );
  } finally {
    await cleanup();
  }
});

it('reports an asset’s location from its site down, leaving out the levels above', async () => {
  const { agent, cleanup } = await estate();
  try {
    const make = async (body: object) => (await agent.post(locations).send(body).expect(201)).body;
    const portfolio = await make({ code: 'P', name: 'Portfolio', kind: 'portfolio' });
    const region = await make({ code: 'R', name: 'Wales region', kind: 'region', parentId: portfolio.id });
    const site = await make({ code: 'S', name: 'Cardiff HQ', kind: 'site', parentId: region.id });
    const floor = await make({ code: 'F', name: 'Basement', kind: 'floor', parentId: site.id });
    const asset = (await create(agent, { name: 'Boiler', locationId: floor.id }).expect(201)).body;
    expect(asset.locationPath).toEqual(['Cardiff HQ', 'Basement']);
    const atSite = (await create(agent, { name: 'Roof unit', locationId: site.id }).expect(201)).body;
    expect(atSite.locationPath).toEqual(['Cardiff HQ']);
    expect((await agent.get(assets + '/' + asset.id).expect(200)).body.site).toMatchObject({ name: 'Cardiff HQ' });
  } finally {
    await cleanup();
  }
});

it('rejects bad input, and keeps money as whole pence', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { room } = await tree(agent);
    const base = { name: 'Pump', locationId: room.id };
    await create(agent, { ...base, installedOn: '2026-02-31' }).expect(400);
    await create(agent, { ...base, replacementCost: { amountMinor: 185.5, currency: 'GBP' } }).expect(400);
    await create(agent, { ...base, replacementCost: { amountMinor: -1, currency: 'GBP' } }).expect(400);
    await create(agent, { ...base, replacementCost: { amountMinor: 100, currency: 'pounds' } }).expect(400);
    await create(agent, { ...base, status: 'broken' }).expect(400);
    await create(agent, { ...base, condition: 'E' }).expect(400);
    await create(agent, { ...base, number: 'AST-99999' }).expect(400); // the reference is issued, never chosen
    await create(agent, { locationId: room.id, name: '   ' }).expect(400);
    await agent.patch(`${assets}/00000000-0000-4000-8000-000000000000`).send({ version: 1, name: 'x' }).expect(404);
    expect((await agent.get(assets).expect(200)).body.items).toEqual([]);
  } finally {
    await cleanup();
  }
});

it('keeps assets inside a site, a parent in the same site, and refuses loops and orphaned components', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { floor, room, siteB, region } = await tree(agent);
    const system = (await create(agent, { name: 'System', locationId: floor.id }).expect(201)).body;
    const part = (await create(agent, { name: 'Part', locationId: room.id, parentId: system.id }).expect(201)).body;
    const elsewhere = (await create(agent, { name: 'Elsewhere', locationId: siteB.id }).expect(201)).body;

    // A site itself is a valid place; a region above the sites is not.
    await create(agent, { name: 'Spare', locationId: region.id }).expect(422);
    await create(agent, { name: 'Cross-site part', locationId: siteB.id, parentId: system.id }).expect(422);
    await create(agent, { name: 'Missing parent', locationId: room.id, parentId: crypto.randomUUID() }).expect(404);

    // Loops: under its own component, or under itself.
    const loop = await agent.patch(`${assets}/${system.id}`).send({ version: 1, parentId: part.id }).expect(422);
    expect(loop.body.code).toBe('asset_cycle');
    await agent.patch(`${assets}/${system.id}`).send({ version: 1, parentId: system.id }).expect(422);

    // A component stays in its parent's site, a system can't leave its components behind,
    // and a standalone asset can move freely.
    const moved = await agent.patch(`${assets}/${part.id}`).send({ version: 1, locationId: siteB.id }).expect(422);
    expect(moved.body.code).toBe('asset_parent_site');
    // The edit form always sends the current parent too; that must not skip the check.
    const withParent = await agent
      .patch(`${assets}/${part.id}`)
      .send({ version: 1, locationId: siteB.id, parentId: system.id })
      .expect(422);
    expect(withParent.body.code).toBe('asset_parent_site');
    const left = await agent.patch(`${assets}/${system.id}`).send({ version: 1, locationId: siteB.id }).expect(422);
    expect(left.body.code).toBe('asset_site_change');
    await agent.patch(`${assets}/${elsewhere.id}`).send({ version: 1, locationId: room.id }).expect(200);
    // Reparenting within the site is fine, and so is making a component stand alone.
    await agent.patch(`${assets}/${part.id}`).send({ version: 1, parentId: null }).expect(200);
    await agent.patch(`${assets}/${part.id}`).send({ version: 2, parentId: system.id }).expect(200);

    // A system with live components can't be decommissioned until they are.
    const blocked = await agent
      .patch(`${assets}/${system.id}`)
      .send({ version: 1, status: 'decommissioned' })
      .expect(409);
    expect(blocked.body.code).toBe('asset_has_components');
    await agent.patch(`${assets}/${part.id}`).send({ version: 3, status: 'decommissioned' }).expect(200);
    await agent.patch(`${assets}/${system.id}`).send({ version: 1, status: 'decommissioned' }).expect(200);
    const events = (await agent.get('/api/audit').expect(200)).body as { action: string }[];
    expect(events.map((e) => e.action)).toContain('asset.decommissioned');
  } finally {
    await cleanup();
  }
});

it('validates attributes against the class template, and starts afresh when the class changes', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { room } = await tree(agent);
    const template = [
      { key: 'output_kw', label: 'Output', type: 'number', unit: 'kW', required: true, min: 1 },
      { key: 'fuel', label: 'Fuel', type: 'picklist', options: [{ value: 'gas', label: 'Gas' }] },
    ];
    const boilers = (
      await agent
        .post(classes)
        .send({ scheme: 'custom', code: 'BOILER', name: 'Boilers', group: 'Heating', attributes: template })
        .expect(201)
    ).body;
    const pumps = (
      await agent.post(classes).send({ scheme: 'custom', code: 'PUMP', name: 'Pumps', group: 'Heating' }).expect(201)
    ).body;
    await agent.post(classes).send({ scheme: 'custom', code: 'BOILER', name: 'Again', group: 'Heating' }).expect(409);
    await agent
      .post(classes)
      .send({
        scheme: 'custom',
        code: 'BAD',
        name: 'Bad',
        group: 'X',
        attributes: [{ key: 'colour', label: 'Colour', type: 'picklist' }],
      })
      .expect(400);

    const base = { name: 'Boiler', locationId: room.id, classId: boilers.id };
    const missing = await create(agent, { ...base, attributes: {} }).expect(422);
    expect(missing.body).toMatchObject({ code: 'invalid_attributes', errors: { output_kw: 'Enter Output (kW)' } });
    const detailOfMissing = await create(agent, { ...base, attributes: { output_kw: 1 } }).expect(201);
    expect((await agent.get(`${assets}/${detailOfMissing.body.id}`).expect(200)).body.classAttributes).toMatchObject([
      { key: 'output_kw', unit: 'kW' },
      { key: 'fuel' },
    ]);
    await create(agent, { ...base, attributes: { output_kw: 'big' } }).expect(422);
    await create(agent, { ...base, attributes: { output_kw: 0 } }).expect(422);
    await create(agent, { ...base, attributes: { output_kw: 5, fuel: 'coal' } }).expect(422);
    await create(agent, { ...base, attributes: { output_kw: 5, colour: 'red' } }).expect(422);
    await create(agent, { name: 'Loose', locationId: room.id, attributes: { output_kw: 5 } }).expect(422);
    await create(agent, { ...base, classId: crypto.randomUUID(), attributes: {} }).expect(422);

    const boiler = (await create(agent, { ...base, attributes: { output_kw: 254, fuel: 'gas' } }).expect(201)).body;
    expect(boiler).toMatchObject({ className: 'Boilers', classGroup: 'Heating', attributes: { output_kw: 254 } });
    const edited = await agent
      .patch(`${assets}/${boiler.id}`)
      .send({ version: 1, attributes: { output_kw: 300 } })
      .expect(200);
    expect(edited.body.attributes).toEqual({ output_kw: 300, fuel: 'gas' });
    await agent
      .patch(`${assets}/${boiler.id}`)
      .send({ version: 2, attributes: { output_kw: null } })
      .expect(422);

    // A new class starts with its own attributes, not the old ones.
    const reclassed = await agent.patch(`${assets}/${boiler.id}`).send({ version: 2, classId: pumps.id }).expect(200);
    expect(reclassed.body).toMatchObject({ className: 'Pumps', attributes: {} });

    // Retiring a class stops new use but leaves assets that have it.
    await agent.patch(`${classes}/${boilers.id}`).send({ active: false }).expect(200);
    await create(agent, { ...base, attributes: { output_kw: 5 } }).expect(422);
    expect((await agent.get(classes).expect(200)).body.map((c: { code: string }) => c.code)).toEqual(['PUMP']);
    expect(
      (await agent.get(`${classes}?includeInactive=true`).expect(200)).body.map((c: { code: string }) => c.code).sort(),
    ).toEqual(['BOILER', 'PUMP']);
    const events = (await agent.get('/api/audit').expect(200)).body as { action: string }[];
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(['asset_class.created', 'asset_class.updated']));
  } finally {
    await cleanup();
  }
});

it('applies the plan’s asset limit, counting only assets in use, and holds it under concurrency', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const { room } = await tree(agent);
    await owner.tenantEntitlement.create({ data: { tenantId: tenant.id, feature: 'assets', enabled: true, limit: 2 } });
    const one = (await create(agent, { name: 'One', locationId: room.id }).expect(201)).body;
    await create(agent, { name: 'Two', locationId: room.id }).expect(201);
    const full = await create(agent, { name: 'Three', locationId: room.id }).expect(403);
    expect(full.body).toMatchObject({ code: 'limit_reached', limit: 2 });

    await agent.patch(`${assets}/${one.id}`).send({ version: 1, status: 'decommissioned' }).expect(200);
    const three = (await create(agent, { name: 'Three', locationId: room.id }).expect(201)).body;
    // Bringing a decommissioned asset back needs a place too.
    const back = await agent.patch(`${assets}/${one.id}`).send({ version: 2, status: 'in_service' }).expect(403);
    expect(back.body.code).toBe('limit_reached');
    await agent.patch(`${assets}/${three.id}`).send({ version: 1, status: 'decommissioned' }).expect(200);
    await agent.patch(`${assets}/${one.id}`).send({ version: 2, status: 'in_service' }).expect(200);

    // Several at once can't take the plan past its limit, and numbers stay unique.
    await agent.patch(`${assets}/${one.id}`).send({ version: 3, status: 'decommissioned' }).expect(200);
    const attempts = await Promise.all(
      [1, 2, 3, 4].map((n) => create(agent, { name: `Parallel ${n}`, locationId: room.id })),
    );
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 403)).toHaveLength(3);
    const numbers = await withTenant(db, tenant.id, (tx) => tx.asset.findMany({ select: { number: true } }));
    expect(new Set(numbers.map((n) => n.number)).size).toBe(numbers.length);
  } finally {
    await cleanup();
  }
});

it('limits members to their branches, hides what is above them, and blocks writes outside', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const { floor, room, siteB } = await tree(agent);
    const system = (await create(agent, { name: 'System', locationId: floor.id }).expect(201)).body;
    const inRoom = (await create(agent, { name: 'In room', locationId: room.id, parentId: system.id }).expect(201))
      .body;
    const inB = (await create(agent, { name: 'In B', locationId: siteB.id }).expect(201)).body;

    const manager = await createTestAccount(db, [tenant.id], undefined, 'fm_manager');
    const restricted = (await signIn(app, manager.email, manager.password)).agent;
    // Before any restriction, an FM Manager sees everything their role covers.
    expect((await restricted.get(assets).expect(200)).body.items).toHaveLength(3);
    await agent
      .put(`${locations}/access/${manager.memberships[0]}`)
      .send({ locationIds: [room.id] })
      .expect(200);

    const visible = (await restricted.get(assets).expect(200)).body.items;
    expect(visible.map((a: { id: string }) => a.id)).toEqual([inRoom.id]);
    // The parent and the levels above the room are outside the branch, so they stay hidden.
    expect(visible[0]).toMatchObject({ parentId: null, locationPath: ['Plant room'] });
    expect((await restricted.get(`${assets}?parent=root`).expect(200)).body.items).toHaveLength(1);
    await restricted.get(`${assets}/${system.id}`).expect(404);
    await restricted.get(`${assets}/${inB.id}`).expect(404);
    expect((await restricted.get(`${assets}/summary`).expect(200)).body.total).toBe(1);

    await restricted.post(assets).send({ name: 'Out', locationId: siteB.id }).expect(404);
    await restricted.post(assets).send({ name: 'Out', locationId: floor.id }).expect(404);
    await restricted.patch(`${assets}/${inB.id}`).send({ version: 1, name: 'Out' }).expect(404);
    const added = await restricted.post(assets).send({ name: 'New in room', locationId: room.id }).expect(201);
    // Saving with the hidden parent shown as empty leaves the real link alone.
    await restricted.patch(`${assets}/${inRoom.id}`).send({ version: 1, parentId: null, name: 'Renamed' }).expect(200);
    expect((await agent.get(`${assets}/${inRoom.id}`).expect(200)).body.parentId).toBe(system.id);
    await restricted.patch(`${assets}/${inRoom.id}`).send({ version: 2, parentId: added.body.id }).expect(403);
    await restricted.patch(`${assets}/${added.body.id}`).send({ version: 1, parentId: system.id }).expect(404);
    await restricted.patch(`${assets}/${added.body.id}`).send({ version: 1, locationId: siteB.id }).expect(404);
  } finally {
    await cleanup();
  }
});

it('needs the right permission for each action', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const { room } = await tree(agent);
    const asset = (await create(agent, { name: 'Pump', locationId: room.id }).expect(201)).body;
    const as = async (role: string) => {
      const account = await createTestAccount(db, [tenant.id], undefined, role);
      return (await signIn(app, account.email, account.password)).agent;
    };
    const requester = await as('requester');
    await requester.get(assets).expect(403);
    await requester.get(`${assets}/${asset.id}`).expect(403);
    await requester.get(`${assets}/summary`).expect(403);
    await requester.get(classes).expect(403);

    // An auditor can read everything but change nothing.
    const auditor = await as('auditor');
    expect((await auditor.get(assets).expect(200)).body).toMatchObject({ canManage: false });
    await auditor.post(assets).send({ name: 'X', locationId: room.id }).expect(403);
    await auditor.patch(`${assets}/${asset.id}`).send({ version: 1, name: 'X' }).expect(403);
    await auditor.post(classes).send({ scheme: 'custom', code: 'X', name: 'X', group: 'X' }).expect(403);

    // A technician's role is limited to their own work, so without a site they see no assets.
    const technician = await as('technician');
    expect((await technician.get(assets).expect(200)).body.items).toEqual([]);
    await technician.get(`${assets}/${asset.id}`).expect(404);
    await technician.post(assets).send({ name: 'X', locationId: room.id }).expect(403);

    await request403WithoutSession(asset.id);
  } finally {
    await cleanup();
  }
});

async function request403WithoutSession(id: string) {
  const { default: request } = await import('supertest');
  await request(app.getHttpServer()).get(`${assets}/${id}`).expect(401);
  await request(app.getHttpServer()).get(assets).expect(401);
}

it('denies everything across organisations', async () => {
  const first = await estate();
  const second = await estate();
  try {
    const one = await tree(first.agent);
    const two = await tree(second.agent);
    const mine = (await create(first.agent, { name: 'Mine', locationId: one.room.id }).expect(201)).body;
    const theirs = (await create(second.agent, { name: 'Theirs', locationId: two.room.id }).expect(201)).body;
    const theirClass = (
      await second.agent.post(classes).send({ scheme: 'custom', code: 'T', name: 'Theirs', group: 'T' }).expect(201)
    ).body;

    expect((await first.agent.get(assets).expect(200)).body.items.map((a: { id: string }) => a.id)).toEqual([mine.id]);
    expect((await first.agent.get(`${assets}/summary`).expect(200)).body.total).toBe(1);
    expect((await first.agent.get(classes).expect(200)).body).toEqual([]);
    await first.agent.get(`${assets}/${theirs.id}`).expect(404);
    await first.agent.patch(`${assets}/${theirs.id}`).send({ version: 1, name: 'Mine now' }).expect(404);
    await first.agent.patch(`${classes}/${theirClass.id}`).send({ name: 'Mine now' }).expect(404);
    await create(first.agent, { name: 'X', locationId: two.room.id }).expect(404);
    await create(first.agent, { name: 'X', locationId: one.room.id, parentId: theirs.id }).expect(404);
    await create(first.agent, { name: 'X', locationId: one.room.id, classId: theirClass.id }).expect(422);
    await first.agent.patch(`${assets}/${mine.id}`).send({ version: 1, parentId: theirs.id }).expect(404);
    await first.agent.patch(`${assets}/${mine.id}`).send({ version: 1, locationId: two.room.id }).expect(404);
    await first.agent.patch(`${assets}/${mine.id}`).send({ version: 1, classId: theirClass.id }).expect(422);
    // Each organisation numbers from its own sequence.
    expect([mine.number, theirs.number]).toEqual(['AST-00001', 'AST-00001']);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

it('searches, filters and pages the register, and summarises it', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { room, floor } = await tree(agent);
    const heating = (
      await agent.post(classes).send({ scheme: 'custom', code: 'H', name: 'Boilers', group: 'Heating' }).expect(201)
    ).body;
    const power = (
      await agent.post(classes).send({ scheme: 'custom', code: 'P', name: 'UPS', group: 'Electrical' }).expect(201)
    ).body;
    const make = async (body: object) => (await create(agent, body).expect(201)).body;
    const boiler = await make({
      name: 'Boiler 2',
      locationId: room.id,
      classId: heating.id,
      condition: 'B',
      criticality: 'high',
      make: 'Hamworthy',
      serial: 'SN_100%',
    });
    const ups = await make({
      name: 'UPS-A',
      locationId: floor.id,
      classId: power.id,
      condition: 'C',
      criticality: 'critical',
    });
    const loose = await make({ name: 'Loose item', locationId: room.id, condition: 'D', status: 'out_of_service' });
    await make({ name: 'Old kit', locationId: room.id, status: 'decommissioned' });

    const ids = async (query: string) =>
      ((await agent.get(`${assets}?${query}`).expect(200)).body.items as { id: string }[]).map((a) => a.id);
    expect(await ids('q=boiler')).toEqual([boiler.id]);
    expect(await ids('q=hamworthy')).toEqual([boiler.id]);
    expect(await ids('q=AST-00002')).toEqual([ups.id]);
    // Search text is literal: % and _ are not wildcards.
    expect(await ids('q=SN_100%25')).toEqual([boiler.id]);
    expect(await ids('q=%25')).toEqual([boiler.id]);
    expect(await ids('group=Heating')).toEqual([boiler.id]);
    expect(await ids(`classId=${power.id}`)).toEqual([ups.id]);
    expect(await ids('condition=C')).toEqual([ups.id]);
    expect(await ids('criticality=critical')).toEqual([ups.id]);
    expect(await ids('status=out_of_service')).toEqual([loose.id]);
    await agent.get(`${assets}?status=nonsense`).expect(400);
    await agent.get(`${assets}?limit=0`).expect(400);

    const first = (await agent.get(`${assets}?limit=2`).expect(200)).body;
    expect(first.items).toHaveLength(2);
    const next = (await agent.get(`${assets}?limit=2&after=${first.nextCursor}`).expect(200)).body;
    expect(next.items).toHaveLength(2);
    expect(next.nextCursor).toBeNull();
    expect(new Set([...first.items, ...next.items].map((a: { id: string }) => a.id)).size).toBe(4);

    // Sorting by name pages through every asset once, in either direction, and rejects unknown columns.
    const byName = async (dir: string) => {
      const seen: string[] = [];
      let after = '';
      do {
        const body = (await agent.get(`${assets}?sort=name&dir=${dir}&limit=1${after}`).expect(200)).body;
        seen.push(...body.items.map(({ name }: { name: string }) => name));
        after = body.nextCursor ? `&after=${body.nextCursor}` : '';
      } while (after);
      return seen;
    };
    const named = await byName('asc');
    expect(named).toHaveLength(4);
    expect(await byName('desc')).toEqual([...named].reverse());
    await agent.get(`${assets}?sort=password`).expect(400);

    // Decommissioned assets are left out of the tiles; unclassified ones are grouped together.
    expect((await agent.get(`${assets}/summary`).expect(200)).body).toEqual({
      total: 3,
      maintainable: 3,
      conditionCOrD: 2,
      groups: [
        { group: 'Electrical', count: 1 },
        { group: 'Heating', count: 1 },
        { group: 'Unclassified', count: 1 },
      ],
    });
  } finally {
    await cleanup();
  }
});

it('validates the organisation’s custom fields on assets', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { room } = await tree(agent);
    await agent
      .post('/api/config/fields')
      .send({ entityType: 'asset', key: 'cost_centre', label: 'Cost centre', type: 'text', required: true })
      .expect(201);
    expect((await agent.get(`${assets}/custom-fields`).expect(200)).body).toMatchObject([{ key: 'cost_centre' }]);
    const base = { name: 'Pump', locationId: room.id };
    const missing = await create(agent, base).expect(422);
    expect(missing.body.code).toBe('invalid_custom_fields');
    await create(agent, { ...base, custom: { cost_centre: 'CC-410', other: 'x' } }).expect(422);
    const pump = (await create(agent, { ...base, custom: { cost_centre: 'CC-410' } }).expect(201)).body;
    expect(pump.custom).toEqual({ cost_centre: 'CC-410' });
    const changed = await agent
      .patch(`${assets}/${pump.id}`)
      .send({ version: 1, custom: { cost_centre: 'CC-500' } })
      .expect(200);
    expect(changed.body.custom).toEqual({ cost_centre: 'CC-500' });
  } finally {
    await cleanup();
  }
});

it('changes the status of several assets at once and reports what happened to each', async () => {
  const first = await estate();
  const second = await estate();
  try {
    const { room, floor } = await tree(first.agent);
    const two = await tree(second.agent);
    const [a, b] = await Promise.all(
      ['Pump A', 'Pump B'].map(
        async (name) => (await create(first.agent, { name, locationId: room.id }).expect(201)).body,
      ),
    );
    const parent = (await create(first.agent, { name: 'System', locationId: floor.id }).expect(201)).body;
    await create(first.agent, { name: 'Part', locationId: floor.id, parentId: parent.id }).expect(201);
    const theirs = (await create(second.agent, { name: 'Theirs', locationId: two.room.id }).expect(201)).body;
    const bulk = (agent: Agent, body: object) => agent.post(`${assets}/bulk`).send(body);

    const result = (
      await bulk(first.agent, {
        action: 'status',
        status: 'out_of_service',
        items: [
          { id: a.id, version: a.version },
          { id: b.id, version: 99 },
          { id: parent.id, version: parent.version },
          { id: crypto.randomUUID(), version: 1 },
        ],
      }).expect(201)
    ).body;
    expect(result).toMatchObject({ succeeded: 2, failed: 2 });
    expect(result.results.map((r: { ok: boolean; status?: number }) => [r.ok, r.status])).toEqual([
      [true, undefined],
      [false, 409],
      [true, undefined],
      [false, 404],
    ]);
    expect((await first.agent.get(`${assets}/${a.id}`).expect(200)).body.status).toBe('out_of_service');

    // Decommissioning keeps its rule per row: a system with live components is refused.
    const decommission = (
      await bulk(first.agent, {
        action: 'status',
        status: 'decommissioned',
        items: [{ id: parent.id, version: result.results[2].version }],
      }).expect(201)
    ).body;
    expect(decommission.results[0]).toMatchObject({ ok: false, status: 409 });

    await bulk(first.agent, { action: 'status', status: 'in_service', items: [] }).expect(400);
    await bulk(first.agent, { action: 'status', status: 'gone', items: [{ id: a.id, version: 1 }] }).expect(400);
    await bulk(first.agent, { action: 'rename', items: [{ id: a.id, version: 1 }] }).expect(400);

    // Another organisation's assets answer 404, and a role without assets.manage is refused.
    const cross = (
      await bulk(first.agent, {
        action: 'status',
        status: 'spare',
        items: [{ id: theirs.id, version: theirs.version }],
      }).expect(201)
    ).body;
    expect(cross.results[0]).toMatchObject({ ok: false, status: 404 });
    expect((await second.agent.get(`${assets}/${theirs.id}`).expect(200)).body.status).toBe('in_service');
    const auditor = await createTestAccount(db, [first.tenant.id], undefined, 'auditor');
    const audit = (await signIn(app, auditor.email, auditor.password)).agent;
    await bulk(audit, { action: 'status', status: 'spare', items: [{ id: a.id, version: 1 }] }).expect(403);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

it('exports assets as CSV for the signed-in organisation only, safely, and audits the export', async () => {
  const first = await estate();
  const second = await estate();
  try {
    const { floor } = await tree(first.agent);
    await create(first.agent, {
      name: '=Boiler, "main"',
      locationId: floor.id,
      installedOn: '2014-03-14',
      replacementCost: { amountMinor: 1_850_000, currency: 'GBP' },
    }).expect(201);
    const other = await tree(second.agent);
    await create(second.agent, { name: 'Other estate asset', locationId: other.floor.id }).expect(201);
    const member = await createTestAccount(db, [first.tenant.id]);
    const requester = (await signIn(app, member.email, member.password)).agent;
    const res = await first.agent.get(`${assets}/export`).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('assets.csv');
    expect(res.text).toContain('number,name,status,location_code,parent_number');
    expect(res.text).toContain(`"'=Boiler, ""main"""`);
    expect(res.text).toContain('2014-03-14');
    expect(res.text).toContain('1850000,GBP');
    expect(res.text).not.toContain('Other estate asset');
    await requester.get(`${assets}/export`).expect(403);
    await request(app.getHttpServer()).get(`${assets}/export`).expect(401);
    const events = await withTenant(db, first.tenant.id, (tx) =>
      tx.auditEvent.findMany({ where: { action: 'asset.exported' } }),
    );
    expect(events).toHaveLength(1);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});
