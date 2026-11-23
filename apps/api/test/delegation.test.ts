import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { BUILTIN_ROLES } from '@cafm/shared';
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

/** One organisation with two sites, a Super User and a regional admin limited to site A. */
async function estate() {
  const { tenant, cleanup } = await createTestTenant(db);
  const superUser = await createTestAccount(db, [tenant.id], undefined, 'super_user');
  const admin = (await signIn(app, superUser.email, superUser.password)).agent;
  const siteA = (await admin.post('/api/locations').send({ code: 'A', name: 'Site A', kind: 'site' }).expect(201)).body;
  const siteB = (await admin.post('/api/locations').send({ code: 'B', name: 'Site B', kind: 'site' }).expect(201)).body;
  const base = BUILTIN_ROLES.find((r) => r.key === 'fm_manager')!;
  await withTenant(db, tenant.id, (tx) =>
    tx.role.create({
      data: {
        tenantId: tenant.id,
        key: 'regional_admin',
        name: 'Regional admin',
        permissions: [...new Set([...base.permissions, 'people.manage', 'people.invite'])],
        scope: 'all',
      },
    }),
  );
  const regional = await createTestAccount(db, [tenant.id], undefined, 'regional_admin');
  await admin
    .put(`/api/locations/access/${regional.memberships[0]}`)
    .send({ locationIds: [siteA.id] })
    .expect(200);
  const delegate = (await signIn(app, regional.email, regional.password)).agent;
  const member = async (role: string, locationIds: string[] | null) => {
    const account = await createTestAccount(db, [tenant.id], undefined, role);
    if (locationIds)
      await admin.put(`/api/locations/access/${account.memberships[0]}`).send({ locationIds }).expect(200);
    return account.memberships[0]!;
  };
  return { tenant, cleanup, admin, delegate, siteA, siteB, regional, superUser, member };
}

it('shows a delegated admin only the people inside their own sites', async () => {
  const { cleanup, admin, delegate, siteA, siteB, member, regional } = await estate();
  try {
    const inside = await member('technician', [siteA.id]);
    const outside = await member('technician', [siteB.id]);
    const straddling = await member('technician', [siteA.id, siteB.id]);
    const unrestricted = await member('technician', null);

    const everyone = (await admin.get('/api/admin/users').expect(200)).body as { membershipId: string }[];
    expect(everyone.map((u) => u.membershipId)).toEqual(expect.arrayContaining([inside, outside, unrestricted]));

    const seen = ((await delegate.get('/api/admin/users').expect(200)).body as { membershipId: string }[]).map(
      (u) => u.membershipId,
    );
    expect(seen.sort()).toEqual([inside, regional.memberships[0]!].sort());
    expect(seen).not.toContain(straddling);

    const overview = (await delegate.get('/api/admin/site-access').expect(200)).body;
    expect(overview.delegated).toBe(true);
    expect(overview.areas.map((a: { id: string }) => a.id)).toEqual([siteA.id]);
    expect(overview.members.map((m: { membershipId: string }) => m.membershipId)).toEqual([inside]);
    const full = (await admin.get('/api/admin/site-access').expect(200)).body;
    expect(full.delegated).toBe(false);
    expect(full.areas).toHaveLength(2);
    expect(full.members.find((m: { membershipId: string }) => m.membershipId === outside)).toMatchObject({
      restricted: true,
      locationIds: [siteB.id],
    });
  } finally {
    await cleanup();
  }
});

it('lets a delegated admin manage people inside their sites and no one else', async () => {
  const { cleanup, delegate, siteA, siteB, member, superUser, tenant } = await estate();
  try {
    const inside = await member('technician', [siteA.id]);
    const outside = await member('technician', [siteB.id]);
    const unrestricted = await member('technician', null);

    await delegate.patch(`/api/people/${inside}`).send({ role: 'planner' }).expect(200);
    await delegate.patch(`/api/people/${outside}`).send({ status: 'deactivated' }).expect(404);
    await delegate.patch(`/api/people/${unrestricted}`).send({ status: 'deactivated' }).expect(404);
    await delegate.patch(`/api/people/${superUser.memberships[0]}`).send({ status: 'deactivated' }).expect(404);

    // Site access: within their own sites only, never lifting the limit.
    await delegate
      .put(`/api/locations/access/${inside}`)
      .send({ locationIds: [siteA.id] })
      .expect(200);
    await delegate
      .put(`/api/locations/access/${inside}`)
      .send({ locationIds: [siteA.id, siteB.id] })
      .expect(404);
    await delegate.put(`/api/locations/access/${inside}`).send({ locationIds: null }).expect(403);
    await delegate
      .put(`/api/locations/access/${outside}`)
      .send({ locationIds: [siteA.id] })
      .expect(404);
    await delegate
      .put(`/api/locations/access/${unrestricted}`)
      .send({ locationIds: [siteA.id] })
      .expect(404);

    const events = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.findMany({ where: { tenantId: tenant.id, entityId: inside } }),
    );
    expect(events.map((e) => e.action)).toEqual(
      expect.arrayContaining(['membership.updated', 'location.access_updated']),
    );
  } finally {
    await cleanup();
  }
});

it('keeps a role limited to its own record to that record', async () => {
  const { tenant, cleanup, admin, siteA, member } = await estate();
  try {
    await withTenant(db, tenant.id, (tx) =>
      tx.role.create({
        data: {
          tenantId: tenant.id,
          key: 'own_admin',
          name: 'Own admin',
          permissions: ['people.manage'],
          scope: 'own',
        },
      }),
    );
    const own = await createTestAccount(db, [tenant.id], undefined, 'own_admin');
    await admin
      .put(`/api/locations/access/${own.memberships[0]}`)
      .send({ locationIds: [siteA.id] })
      .expect(200);
    await member('technician', [siteA.id]);
    const agent = (await signIn(app, own.email, own.password)).agent;
    const seen = (await agent.get('/api/admin/users').expect(200)).body as { membershipId: string }[];
    expect(seen.map((u) => u.membershipId)).toEqual([own.memberships[0]]);
  } finally {
    await cleanup();
  }
});

it('keeps invitations with organisation-wide admins', async () => {
  const { cleanup, admin, delegate } = await estate();
  try {
    await delegate.get('/api/people/invites').expect(403);
    await delegate.post('/api/people/invites').send({ email: 'new@test.example', role: 'technician' }).expect(403);
    await delegate.delete('/api/people/invites/019a0000-0000-7000-8000-000000000001').expect(403);
    await admin.get('/api/people/invites').expect(200);
  } finally {
    await cleanup();
  }
});

it('keeps team changes with organisation-wide admins', async () => {
  const { cleanup, admin, delegate, member } = await estate();
  try {
    const id = await member('technician', null);
    await delegate
      .post('/api/teams')
      .send({ name: 'Night crew', memberIds: [id] })
      .expect(403);
    const team = (
      await admin
        .post('/api/teams')
        .send({ name: 'Day crew', memberIds: [id] })
        .expect(201)
    ).body;
    await delegate.patch(`/api/teams/${team.id}`).send({ memberIds: [] }).expect(403);
    await delegate.delete(`/api/teams/${team.id}`).expect(403);
    await delegate.get('/api/teams').expect(200);
  } finally {
    await cleanup();
  }
});

it('keeps another organisation out of the site access list and out of reach', async () => {
  const first = await estate();
  const second = await estate();
  try {
    const foreign = await second.member('technician', [second.siteA.id]);
    const own = (await first.admin.get('/api/admin/site-access').expect(200)).body;
    expect(JSON.stringify(own)).not.toContain(foreign);
    expect(JSON.stringify(own)).not.toContain(second.siteA.id);
    await first.admin
      .put(`/api/locations/access/${foreign}`)
      .send({ locationIds: [first.siteA.id] })
      .expect(404);
    await first.delegate
      .put(`/api/locations/access/${foreign}`)
      .send({ locationIds: [first.siteA.id] })
      .expect(404);
    await first.delegate.patch(`/api/people/${foreign}`).send({ status: 'deactivated' }).expect(404);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

it('refuses people without people permissions', async () => {
  const { cleanup, tenant } = await estate();
  try {
    const tech = await createTestAccount(db, [tenant.id], undefined, 'technician');
    const agent = (await signIn(app, tech.email, tech.password)).agent;
    await agent.get('/api/admin/site-access').expect(403);
  } finally {
    await cleanup();
  }
});
