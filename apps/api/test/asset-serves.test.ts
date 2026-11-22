import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@cafm/db';
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

const assets = '/api/assets';
const locations = '/api/locations';

async function estate() {
  const tenant = await createTestTenant(db, 'starter');
  const boss = await createTestAccount(db, [tenant.tenant.id], undefined, 'super_user');
  const { agent } = await signIn(app, boss.email, boss.password);
  return { ...tenant, agent };
}
type Agent = Awaited<ReturnType<typeof estate>>['agent'];

/** A site with a basement and two floors, and a second site. */
async function tree(agent: Agent) {
  const make = async (body: object) => (await agent.post(locations).send(body).expect(201)).body;
  const site = await make({ code: 'A', name: 'Site A', kind: 'site' });
  const basement = await make({ code: 'A-B', name: 'Basement', kind: 'floor', parentId: site.id });
  const plant = await make({ code: 'A-P', name: 'Plant room', kind: 'space', parentId: basement.id });
  const floor1 = await make({ code: 'A-1', name: 'Floor 1', kind: 'floor', parentId: site.id });
  const floor2 = await make({ code: 'A-2', name: 'Floor 2', kind: 'floor', parentId: site.id });
  const other = await make({ code: 'B', name: 'Site B', kind: 'site' });
  return { site, basement, plant, floor1, floor2, other };
}
const asset = async (agent: Agent, name: string, locationId: string) =>
  (await agent.post(assets).send({ name, locationId }).expect(201)).body;
const serves = (id: string) => `${assets}/${id}/serves`;

it('records what an asset serves, and shows it from both sides', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { plant, floor1, floor2 } = await tree(agent);
    const boiler = await asset(agent, 'Boiler', plant.id);
    const fan = await asset(agent, 'Fan coil', floor1.id);
    const pump = await asset(agent, 'Pump', plant.id);

    expect((await agent.get(serves(boiler.id)).expect(200)).body).toEqual({ locations: [], assets: [], servedBy: [] });
    const set = await agent
      .put(serves(boiler.id))
      .send({ locationIds: [floor1.id, floor2.id, floor1.id], assetIds: [fan.id] })
      .expect(200);
    expect(set.body.locations).toEqual([
      { id: floor1.id, name: 'Floor 1', path: ['Site A', 'Floor 1'] },
      { id: floor2.id, name: 'Floor 2', path: ['Site A', 'Floor 2'] },
    ]);
    expect(set.body.assets).toMatchObject([{ id: fan.id, number: fan.number, name: 'Fan coil', status: 'in_service' }]);
    expect((await agent.get(serves(fan.id)).expect(200)).body.servedBy).toMatchObject([{ id: boiler.id }]);

    // Replacing the set adds, keeps and removes; saving the same set again changes nothing.
    await agent
      .put(serves(boiler.id))
      .send({ locationIds: [floor2.id], assetIds: [fan.id, pump.id] })
      .expect(200);
    const after = (await agent.get(serves(boiler.id)).expect(200)).body;
    expect(after.locations.map((l: { id: string }) => l.id)).toEqual([floor2.id]);
    expect(after.assets.map((a: { id: string }) => a.id).sort()).toEqual([fan.id, pump.id].sort());
    await agent
      .put(serves(boiler.id))
      .send({ locationIds: [floor2.id], assetIds: [fan.id, pump.id] })
      .expect(200);
    await agent.put(serves(boiler.id)).send({ locationIds: [], assetIds: [] }).expect(200);
    expect((await agent.get(serves(boiler.id)).expect(200)).body).toEqual({ locations: [], assets: [], servedBy: [] });

    const events = (await agent.get('/api/audit').expect(200)).body as { action: string; entityId: string }[];
    expect(events.filter((e) => e.entityId === boiler.id && e.action === 'asset.serves_updated')).toHaveLength(4);
  } finally {
    await cleanup();
  }
});

it('refuses an asset serving itself, serving another site, or serving what does not exist', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { plant, floor1, other } = await tree(agent);
    const boiler = await asset(agent, 'Boiler', plant.id);
    const away = await asset(agent, 'Elsewhere', other.id);
    const put = (body: object) => agent.put(serves(boiler.id)).send(body);

    expect((await put({ locationIds: [], assetIds: [boiler.id] }).expect(422)).body.code).toBe('serves_self');
    expect((await put({ locationIds: [other.id], assetIds: [] }).expect(422)).body.code).toBe('serves_other_site');
    expect((await put({ locationIds: [], assetIds: [away.id] }).expect(422)).body.code).toBe('serves_other_site');
    await put({ locationIds: [crypto.randomUUID()], assetIds: [] }).expect(404);
    await put({ locationIds: [], assetIds: [crypto.randomUUID()] }).expect(404);
    await put({ locationIds: [floor1.id] }).expect(400);
    await put({ locationIds: ['not-an-id'], assetIds: [] }).expect(400);
    await put({ locationIds: [], assetIds: [], extra: true }).expect(400);
    await agent.put(serves(crypto.randomUUID())).send({ locationIds: [], assetIds: [] }).expect(404);
    expect((await agent.get(serves(boiler.id)).expect(200)).body.locations).toEqual([]);
  } finally {
    await cleanup();
  }
});

it('keeps serving inside a site: an asset with serves links can not move to another site', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { plant, floor1, other } = await tree(agent);
    const pump = await asset(agent, 'Pump', plant.id);
    const boiler = await asset(agent, 'Boiler', plant.id);
    const loose = await asset(agent, 'Loose', plant.id);
    await agent
      .put(serves(pump.id))
      .send({ locationIds: [floor1.id], assetIds: [] })
      .expect(200);
    await agent
      .put(serves(boiler.id))
      .send({ locationIds: [], assetIds: [loose.id] })
      .expect(200);

    // Serving a place, or being served by another asset, ties it to the site.
    const serving = await agent.patch(`${assets}/${pump.id}`).send({ version: 1, locationId: other.id }).expect(422);
    expect(serving.body.code).toBe('asset_site_change');
    const served = await agent.patch(`${assets}/${loose.id}`).send({ version: 1, locationId: other.id }).expect(422);
    expect(served.body.code).toBe('asset_site_change');
    // Moving within the site is fine, and so is moving once the links are gone.
    await agent.patch(`${assets}/${pump.id}`).send({ version: 1, locationId: floor1.id }).expect(200);
    await agent.put(serves(pump.id)).send({ locationIds: [], assetIds: [] }).expect(200);
    await agent.patch(`${assets}/${pump.id}`).send({ version: 2, locationId: other.id }).expect(200);
  } finally {
    await cleanup();
  }
});

it('lets a component that is served by other assets stand alone', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { plant } = await tree(agent);
    const system = await asset(agent, 'System', plant.id);
    const part = (
      await agent.post(assets).send({ name: 'Part', locationId: plant.id, parentId: system.id }).expect(201)
    ).body;
    await agent
      .put(serves(system.id))
      .send({ locationIds: [], assetIds: [part.id] })
      .expect(200);
    const alone = await agent.patch(`${assets}/${part.id}`).send({ version: 1, parentId: null }).expect(200);
    expect(alone.body.parentId).toBeNull();
    // Its serves link is untouched by that.
    expect((await agent.get(serves(part.id)).expect(200)).body.servedBy).toMatchObject([{ id: system.id }]);
  } finally {
    await cleanup();
  }
});

it('follows the links to show everything that depends on an asset, and survives a loop', async () => {
  const { agent, cleanup } = await estate();
  try {
    const { plant, floor1, floor2, basement } = await tree(agent);
    const boiler = await asset(agent, 'Boiler', plant.id);
    const loop = await asset(agent, 'Loop', plant.id);
    const fan = await asset(agent, 'Fan coil', floor1.id);
    const radiator = await asset(agent, 'Radiator', floor2.id);
    const unrelated = await asset(agent, 'Unrelated', plant.id);
    const set = (id: string, locationIds: string[], assetIds: string[]) =>
      agent.put(serves(id)).send({ locationIds, assetIds }).expect(200);
    await set(boiler.id, [basement.id], [loop.id, fan.id]);
    await set(fan.id, [floor1.id], [radiator.id]);
    await set(radiator.id, [floor2.id], []);
    // The radiator serves the boiler back: a loop, which must not hang or list the boiler as its own impact.
    await set(radiator.id, [floor2.id], [boiler.id]);

    const impact = (await agent.get(`${assets}/${boiler.id}/impact`).expect(200)).body;
    // Nearest first, then by reference.
    expect(impact.assets.map((a: { name: string; depth: number }) => [a.name, a.depth])).toEqual([
      ['Loop', 1],
      ['Fan coil', 1],
      ['Radiator', 2],
    ]);
    expect(impact.locations.map((l: { name: string }) => l.name).sort()).toEqual(['Basement', 'Floor 1', 'Floor 2']);
    const leaf = (await agent.get(`${assets}/${unrelated.id}/impact`).expect(200)).body;
    expect(leaf).toEqual({ assets: [], locations: [] });
    await agent.get(`${assets}/${crypto.randomUUID()}/impact`).expect(404);
  } finally {
    await cleanup();
  }
});

it('shows only what a branch-limited member can see, and keeps the links they can not', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const { plant, floor1, basement } = await tree(agent);
    const boiler = await asset(agent, 'Boiler', plant.id);
    const hiddenFan = await asset(agent, 'Fan coil', floor1.id);
    const visiblePump = await asset(agent, 'Pump', plant.id);
    await agent
      .put(serves(boiler.id))
      .send({ locationIds: [floor1.id, plant.id], assetIds: [hiddenFan.id, visiblePump.id] })
      .expect(200);

    const manager = await createTestAccount(db, [tenant.id], undefined, 'fm_manager');
    const restricted = (await signIn(app, manager.email, manager.password)).agent;
    await agent
      .put(`${locations}/access/${manager.memberships[0]}`)
      .send({ locationIds: [plant.id] })
      .expect(200);

    const seen = (await restricted.get(serves(boiler.id)).expect(200)).body;
    expect(seen.locations.map((l: { id: string }) => l.id)).toEqual([plant.id]);
    expect(seen.assets.map((a: { id: string }) => a.id)).toEqual([visiblePump.id]);
    expect((await restricted.get(`${assets}/${boiler.id}/impact`).expect(200)).body.locations).toHaveLength(1);

    // Naming something outside their branch is refused, and saving what they can see leaves the rest alone.
    await restricted
      .put(serves(boiler.id))
      .send({ locationIds: [floor1.id], assetIds: [] })
      .expect(404);
    await restricted
      .put(serves(boiler.id))
      .send({ locationIds: [], assetIds: [hiddenFan.id] })
      .expect(404);
    await restricted
      .put(serves(boiler.id))
      .send({ locationIds: [plant.id], assetIds: [] })
      .expect(200);
    const whole = (await agent.get(serves(boiler.id)).expect(200)).body;
    expect(whole.locations.map((l: { id: string }) => l.id).sort()).toEqual([floor1.id, plant.id].sort());
    expect(whole.assets.map((a: { id: string }) => a.id)).toEqual([hiddenFan.id]);
    // An asset they can't see has no serves page for them.
    await restricted.get(serves(hiddenFan.id)).expect(404);
    expect(basement.id).toBeTruthy();
  } finally {
    await cleanup();
  }
});

it('needs the right permission, and never crosses organisations', async () => {
  const first = await estate();
  const second = await estate();
  try {
    const one = await tree(first.agent);
    const two = await tree(second.agent);
    const mine = await asset(first.agent, 'Mine', one.plant.id);
    const theirs = await asset(second.agent, 'Theirs', two.plant.id);
    await first.agent
      .put(serves(mine.id))
      .send({ locationIds: [one.floor1.id], assetIds: [] })
      .expect(200);

    await first.agent.get(serves(theirs.id)).expect(404);
    await first.agent.get(`${assets}/${theirs.id}/impact`).expect(404);
    await first.agent.put(serves(theirs.id)).send({ locationIds: [], assetIds: [] }).expect(404);
    await first.agent
      .put(serves(mine.id))
      .send({ locationIds: [two.floor1.id], assetIds: [] })
      .expect(404);
    await first.agent
      .put(serves(mine.id))
      .send({ locationIds: [], assetIds: [theirs.id] })
      .expect(404);

    const as = async (role: string) => {
      const account = await createTestAccount(db, [first.tenant.id], undefined, role);
      return (await signIn(app, account.email, account.password)).agent;
    };
    const auditor = await as('auditor');
    expect((await auditor.get(serves(mine.id)).expect(200)).body.locations).toHaveLength(1);
    await auditor.put(serves(mine.id)).send({ locationIds: [], assetIds: [] }).expect(403);
    const requester = await as('requester');
    await requester.get(serves(mine.id)).expect(403);
    await requester.get(`${assets}/${mine.id}/impact`).expect(403);
    expect((await first.agent.get(serves(mine.id)).expect(200)).body.locations).toHaveLength(1);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});
