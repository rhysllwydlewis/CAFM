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

async function estate(plan?: string) {
  const tenant = await createTestTenant(db, plan);
  const owner = await createTestAccount(db, [tenant.tenant.id], undefined, 'super_user');
  const { agent } = await signIn(app, owner.email, owner.password);
  return { ...tenant, owner, agent };
}

const locations = '/api/locations';

it('maintains branch ancestry on moves, refuses cycles and stale edits, and audits changes', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const site = (await agent.post(locations).send({ code: 'a', name: 'Site A', kind: 'site' }).expect(201)).body;
    const other = (await agent.post(locations).send({ code: 'B', name: 'Site B', kind: 'site' }).expect(201)).body;
    const floor = (
      await agent.post(locations).send({ code: 'F', name: 'Floor', kind: 'floor', parentId: site.id }).expect(201)
    ).body;
    const room = (
      await agent.post(locations).send({ code: 'R', name: 'Room', kind: 'space', parentId: floor.id }).expect(201)
    ).body;
    await agent.post(locations).send({ code: ' A ', name: 'Duplicate', kind: 'region' }).expect(409);
    await agent.post(locations).send({ code: 'S', name: 'Nested site', kind: 'site', parentId: floor.id }).expect(422);
    await agent.patch(`${locations}/${floor.id}`).send({ parentId: room.id, version: 1 }).expect(422);
    const moved = await agent.patch(`${locations}/${floor.id}`).send({ parentId: other.id, version: 1 }).expect(200);
    expect(moved.body).toMatchObject({ parentId: other.id, version: 2 });
    await agent.patch(`${locations}/${floor.id}`).send({ name: 'Stale', version: 1 }).expect(409);
    const path = await withTenant(db, tenant.id, (tx) =>
      tx.locationPath.findMany({ where: { descendantId: room.id } }),
    );
    expect(path.map((row) => row.ancestorId).sort()).toEqual([other.id, floor.id, room.id].sort());
    const page = (await agent.get(`${locations}?kind=site&limit=1`).expect(200)).body;
    expect(page.items).toHaveLength(1);
    const next = (await agent.get(`${locations}?kind=site&limit=1&after=${page.nextCursor}`).expect(200)).body;
    expect(next.items).toHaveLength(1);
    expect(next.items[0].id).not.toBe(page.items[0].id);
    expect(next.nextCursor).toBeNull();
    expect((await agent.get(`${locations}?q=room`).expect(200)).body.items).toMatchObject([{ id: room.id }]);
    const events = (await agent.get('/api/audit').expect(200)).body;
    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'location.updated', entityId: floor.id })]),
    );
  } finally {
    await cleanup();
  }
});

it('searches names and codes for literal text', async () => {
  const { agent, cleanup } = await estate();
  try {
    await agent.post(locations).send({ code: 'A_1', name: '100% occupied', kind: 'site' }).expect(201);
    await agent.post(locations).send({ code: 'AB1', name: '100 people', kind: 'site' }).expect(201);
    await agent
      .post(locations)
      .send({ code: 'ß'.repeat(32), name: 'Code too long', kind: 'site' })
      .expect(400);
    for (const q of ['A_1', '100%']) {
      const response = await agent.get(locations).query({ q }).expect(200);
      expect(response.body.items.map((row: { code: string }) => row.code)).toEqual(['A_1']);
    }
  } finally {
    await cleanup();
  }
});

it('restricts members to assigned branches, including writes and parent links', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const manager = await createTestAccount(db, [tenant.id], undefined, 'fm_manager');
    const restricted = (await signIn(app, manager.email, manager.password)).agent;
    const region = (await agent.post(locations).send({ code: 'REG', name: 'Region', kind: 'region' }).expect(201)).body;
    const site = (
      await agent.post(locations).send({ code: 'A', name: 'Site A', kind: 'site', parentId: region.id }).expect(201)
    ).body;
    const sibling = (await agent.post(locations).send({ code: 'B', name: 'Site B', kind: 'site' }).expect(201)).body;
    const access = `${locations}/access/${manager.memberships[0]}`;
    await agent
      .put(access)
      .send({ locationIds: [site.id] })
      .expect(200);
    expect((await restricted.get(`${locations}/${site.id}`).expect(200)).body.parentId).toBeNull();
    const renamedSite = await restricted
      .patch(`${locations}/${site.id}`)
      .send({ version: 1, parentId: null, name: 'Renamed Site A' })
      .expect(200);
    expect(renamedSite.body).toMatchObject({ name: 'Renamed Site A', parentId: null });
    expect((await agent.get(`${locations}/${site.id}`).expect(200)).body.parentId).toBe(region.id);
    await restricted.get(`${locations}/${sibling.id}`).expect(404);
    const floor = (
      await restricted.post(locations).send({ code: 'F', name: 'Floor', kind: 'floor', parentId: site.id }).expect(201)
    ).body;
    await restricted
      .post(locations)
      .send({ code: 'OUT', name: 'Outside', kind: 'floor', parentId: sibling.id })
      .expect(404);
    await restricted.patch(`${locations}/${floor.id}`).send({ version: 1, parentId: sibling.id }).expect(403);
    await restricted.patch(`${locations}/${floor.id}`).send({ version: 1, parentId: null }).expect(403);
    await restricted.patch(`${locations}/${sibling.id}`).send({ version: 1, name: 'Outside' }).expect(404);
    await restricted.put(access).send({ locationIds: null }).expect(403);
    const visible = (await restricted.get(locations).expect(200)).body.items;
    expect(visible.map((row: { id: string }) => row.id).sort()).toEqual([site.id, floor.id].sort());
    await agent.put(access).send({ locationIds: [] }).expect(200);
    expect((await restricted.get(locations).expect(200)).body.items).toEqual([]);

    const person = `/api/people/${manager.memberships[0]}`;
    await agent.patch(person).send({ role: 'super_user' }).expect(200);
    await restricted.get(`${locations}/${sibling.id}`).expect(200);
    await agent.patch(person).send({ role: 'fm_manager' }).expect(200);
    await restricted.get(`${locations}/${sibling.id}`).expect(404);

    await agent.put(access).send({ locationIds: null }).expect(200);
    await restricted.get(`${locations}/${sibling.id}`).expect(200);
    const aliases = await agent
      .put(access)
      .send({ locationIds: [site.id, site.id.toUpperCase()] })
      .expect(200);
    expect(aliases.body.locationIds).toEqual([site.id]);
  } finally {
    await cleanup();
  }
});

it('keeps omitted custom values and hides retired fields while preserving their stored values', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const fields = '/api/config/fields';
    for (const key of ['use_class', 'manager', 'retired']) {
      await agent.post(fields).send({ entityType: 'location', key, label: key, type: 'text' }).expect(201);
    }
    const site = (
      await agent
        .post(locations)
        .send({
          code: 'A',
          name: 'Site A',
          kind: 'site',
          custom: { use_class: 'Office', manager: 'Morgan', retired: 'Old value' },
        })
        .expect(201)
    ).body;
    const definitions = (await agent.get(fields).query({ entityType: 'location' }).expect(200)).body;
    const retired = definitions.find((field: { key: string }) => field.key === 'retired');
    await agent.delete(`${fields}/${retired.id}`).expect(204);

    const updated = (
      await agent
        .patch(`${locations}/${site.id}`)
        .send({
          version: 1,
          custom: { use_class: 'Clinic' },
        })
        .expect(200)
    ).body;
    expect(updated.custom).toEqual({ use_class: 'Clinic', manager: 'Morgan' });
    const page = (await agent.get(locations).expect(200)).body;
    expect(page.items[0].custom).toEqual(updated.custom);
    expect((await agent.get(`${locations}/${site.id}`).expect(200)).body.custom).toEqual(updated.custom);
    const stored = await withTenant(db, tenant.id, (tx) => tx.location.findUniqueOrThrow({ where: { id: site.id } }));
    expect(stored.custom).toEqual({ ...updated.custom, retired: 'Old value' });
  } finally {
    await cleanup();
  }
});

it('rejects other organisations at every location entry point and enforces read and write permissions', async () => {
  const first = await estate();
  const second = await estate();
  try {
    const foreign = (
      await second.agent.post(locations).send({ code: 'X', name: 'Other site', kind: 'site' }).expect(201)
    ).body;
    const member = await createTestAccount(db, [first.tenant.id]);
    const requester = (await signIn(app, member.email, member.password)).agent;
    expect((await first.agent.get(locations).expect(200)).body.items).toEqual([]);
    await first.agent.get(`${locations}/${foreign.id}`).expect(404);
    await first.agent
      .post(locations)
      .send({ code: 'F', name: 'Floor', kind: 'floor', parentId: foreign.id })
      .expect(404);
    await first.agent.patch(`${locations}/${foreign.id}`).send({ version: 1, name: 'Outside' }).expect(404);
    await first.agent.put(`${locations}/access/${second.owner.memberships[0]}`).send({ locationIds: [] }).expect(404);
    await first.agent
      .put(`${locations}/access/${member.memberships[0]}`)
      .send({ locationIds: [foreign.id] })
      .expect(404);
    await requester.get(locations).expect(403);
    await requester.post(locations).send({ code: 'Y', name: 'No permission', kind: 'site' }).expect(403);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

it('enforces site limits under concurrent creation and validates custom fields', async () => {
  const { agent, cleanup } = await estate('free');
  try {
    await agent
      .post('/api/config/fields')
      .send({ entityType: 'location', key: 'use_class', label: 'Use class', type: 'text', required: true })
      .expect(201);
    expect((await agent.get(locations + '/custom-fields').expect(200)).body).toMatchObject([
      { key: 'use_class', type: 'text', required: true },
    ]);
    await agent.post(locations).send({ code: 'X', name: 'Site without a use class', kind: 'site' }).expect(422);
    const attempts = await Promise.all(
      ['A', 'B'].map((code) =>
        agent.post(locations).send({ code, name: `Site ${code}`, kind: 'site', custom: { use_class: 'Office' } }),
      ),
    );
    expect(attempts.map(({ status }) => status).sort()).toEqual([201, 403]);
    expect(attempts.find(({ status }) => status === 403)?.body).toMatchObject({ code: 'limit_reached', limit: 1 });
  } finally {
    await cleanup();
  }
});

it('manages site details and calendars and restricts access instructions to authorised readers', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const viewer = await createTestAccount(db, [tenant.id], undefined, 'helpdesk');
    const readOnly = (await signIn(app, viewer.email, viewer.password)).agent;
    const siteDetails = { address: '1 Example Street', latitude: 51.4, longitude: -3.2, grossArea: 100, netArea: 80 };
    const calendar = {
      jurisdiction: 'wales',
      timeZone: 'Europe/London',
      observeBankHolidays: true,
      hours: [{ day: 1, opens: '09:00', closes: '17:00' }],
      closures: [{ name: 'Repairs', from: '2027-01-04', to: '2027-01-05' }],
    };
    const region = (await agent.post(locations).send({ code: 'REG', name: 'Region', kind: 'region' }).expect(201)).body;
    const site = (
      await agent
        .post(locations)
        .send({
          code: 'A',
          name: 'Site A',
          kind: 'site',
          parentId: region.id,
          details: siteDetails,
          siteCalendar: calendar,
          restrictedAccess: 'Ask reception before entering',
        })
        .expect(201)
    ).body;
    expect(site.siteCalendar).toEqual(calendar);
    expect((await agent.get(locations + '/' + site.id).expect(200)).body.restrictedAccess).toBe(
      'Ask reception before entering',
    );
    expect((await readOnly.get(locations + '/' + site.id).expect(200)).body).not.toHaveProperty('restrictedAccess');
    expect((await agent.get(locations).query({ kind: 'site' }).expect(200)).body.items[0]).not.toHaveProperty(
      'restrictedAccess',
    );
    const audit = await agent.get('/api/audit').expect(200);
    expect(JSON.stringify(audit.body)).not.toContain('Ask reception before entering');
    await readOnly
      .patch(locations + '/' + site.id)
      .send({ version: 1, siteCalendar: calendar })
      .expect(403);
    await agent
      .patch(locations + '/' + region.id)
      .send({ version: 1, siteCalendar: calendar })
      .expect(422);
    await agent
      .patch(locations + '/' + site.id)
      .send({ version: 1, details: { latitude: 1 } })
      .expect(400);
    await agent
      .patch(locations + '/' + site.id)
      .send({ version: 1, status: 'closed' })
      .expect(200);
    expect((await agent.get(locations).query({ kind: 'site', status: 'closed' }).expect(200)).body.items).toMatchObject(
      [{ id: site.id, details: siteDetails, siteCalendar: calendar }],
    );
  } finally {
    await cleanup();
  }
});

it('lists available roots and child indicators from the member’s own branches', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const scoped = await createTestAccount(db, [tenant.id], undefined, 'fm_manager');
    const reader = (await signIn(app, scoped.email, scoped.password)).agent;
    const region = (await agent.post(locations).send({ code: 'REG', name: 'Region', kind: 'region' }).expect(201)).body;
    const site = (
      await agent.post(locations).send({ code: 'S', name: 'Site', kind: 'site', parentId: region.id }).expect(201)
    ).body;
    const floor = (
      await agent.post(locations).send({ code: 'F', name: 'Floor', kind: 'floor', parentId: site.id }).expect(201)
    ).body;
    await agent
      .put(locations + '/access/' + scoped.memberships[0])
      .send({ locationIds: [site.id] })
      .expect(200);
    expect((await agent.get(locations).query({ parent: 'root' }).expect(200)).body).toMatchObject({
      canManageHierarchy: true,
      items: [{ id: region.id, hasChildren: true }],
    });
    expect((await reader.get(locations).query({ parent: 'root' }).expect(200)).body).toMatchObject({
      canManageHierarchy: false,
      items: [{ id: site.id, parentId: null, hasChildren: true }],
    });
    expect((await reader.get(locations).query({ parent: site.id }).expect(200)).body.items).toMatchObject([
      { id: floor.id, parentId: site.id, hasChildren: false },
    ]);
  } finally {
    await cleanup();
  }
});
