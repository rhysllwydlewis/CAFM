import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { createTestAccount, createTestTenant, DEMO_TENANT, signIn, startApp, testPassword } from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const id = '019a0000-0000-7000-8000-000000000001';

describe('teams need a session and the right permission', () => {
  it('refuses anonymous callers', async () => {
    await request(app.getHttpServer()).get('/api/teams').expect(401);
    await request(app.getHttpServer()).post('/api/teams').send({ name: 'X' }).expect(401);
  });

  it('lets a requester neither read nor change teams', async () => {
    const { agent } = await signIn(app, 'requester@demo.example');
    await agent.post('/api/teams').send({ name: 'Nope' }).expect(403);
    await agent.patch(`/api/teams/${id}`).send({ name: 'Nope' }).expect(403);
    await agent.delete(`/api/teams/${id}`).expect(403);
  });

  it('lets an FM Manager read teams but a technician neither read nor change them', async () => {
    await (await signIn(app, 'manager@demo.example')).agent.get('/api/teams').expect(200);
    const { agent } = await signIn(app, 'technician@demo.example');
    await agent.get('/api/teams').expect(403);
    await agent.post('/api/teams').send({ name: 'Nope' }).expect(403);
  });
});

describe('teams', () => {
  it('lists the seeded demo teams with their members', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const res = await agent.get('/api/teams').expect(200);
    const field = res.body.find((t: { name: string }) => t.name === 'Field engineers');
    expect(field.members.map((m: { name: string }) => m.name)).toEqual(['Tom Price']);
  });

  it('creates, renames, changes members of and deletes a team, with audit', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const people = (await agent.get('/api/admin/users').expect(200)).body as { membershipId: string; email: string }[];
    const tom = people.find((p) => p.email === 'technician@demo.example')!;
    const hana = people.find((p) => p.email === 'helpdesk@demo.example')!;
    const created = await agent
      .post('/api/teams')
      .send({ name: 'Test crew', memberIds: [tom.membershipId] })
      .expect(201);
    try {
      expect(created.body.members).toHaveLength(1);
      await agent.post('/api/teams').send({ name: 'Test crew' }).expect(409);
      const updated = await agent
        .patch(`/api/teams/${created.body.id}`)
        .send({ name: 'Test crew 2', memberIds: [hana.membershipId] })
        .expect(200);
      expect(updated.body).toMatchObject({ name: 'Test crew 2' });
      expect(updated.body.members.map((m: { membershipId: string }) => m.membershipId)).toEqual([hana.membershipId]);
    } finally {
      await agent.delete(`/api/teams/${created.body.id}`).expect(204);
    }
    const actions = await withTenant(db, DEMO_TENANT, (tx) =>
      tx.auditEvent.findMany({ where: { entityType: 'team' }, select: { action: true } }),
    );
    expect(actions.map((e) => e.action)).toEqual(
      expect.arrayContaining(['team.created', 'team.updated', 'team.deleted']),
    );
  });

  it('rejects a name that is empty or members from nowhere', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.post('/api/teams').send({ name: ' ' }).expect(400);
    await agent
      .post('/api/teams')
      .send({ name: 'Ghosts', memberIds: [id] })
      .expect(422);
  });
});

describe('teams across organisations', () => {
  it('cross-tenant: another organisation sees none of these teams and cannot change them', async () => {
    const demo = await signIn(app, 'superuser@demo.example');
    const teams = (await demo.agent.get('/api/teams').expect(200)).body as { id: string }[];
    expect(teams.length).toBeGreaterThan(0);
    const starter = await signIn(app, 'starter@demo.example');
    expect((await starter.agent.get('/api/teams').expect(200)).body).toEqual([]);
    await starter.agent.patch(`/api/teams/${teams[0]!.id}`).send({ name: 'Taken' }).expect(404);
    await starter.agent.delete(`/api/teams/${teams[0]!.id}`).expect(404);
  });

  it('cross-tenant: a person from another organisation cannot be added to a team', async () => {
    const t = await createTestTenant(db);
    const password = testPassword();
    const outsider = await createTestAccount(db, [t.tenant.id], password, 'technician');
    try {
      const { agent } = await signIn(app, 'superuser@demo.example');
      const foreign = outsider.memberships[0]!;
      await agent
        .post('/api/teams')
        .send({ name: 'Leak', memberIds: [foreign] })
        .expect(422);
    } finally {
      await outsider.cleanup();
      await t.cleanup();
    }
  });
});

describe('teams and data scope', () => {
  it('a role with scope "own" sees only itself among team members, and a deactivated member can be removed', async () => {
    const t = await createTestTenant(db);
    const tenantId = t.tenant.id;
    try {
      await withTenant(db, tenantId, (tx) =>
        tx.role.create({
          data: {
            tenantId,
            key: 'custom_team_own',
            name: 'Own teams',
            permissions: ['people.read', 'people.manage'],
            scope: 'own',
          },
        }),
      );
      const password = testPassword();
      const scoped = await createTestAccount(db, [tenantId], password, 'custom_team_own');
      const other = await createTestAccount(db, [tenantId], password, 'helpdesk');
      try {
        const scopedId = scoped.memberships[0]!;
        const otherId = other.memberships[0]!;
        const team = await withTenant(db, tenantId, async (tx) => {
          const created = await tx.team.create({ data: { tenantId, name: 'Mixed' } });
          await tx.teamMember.createMany({
            data: [scopedId, otherId].map((membershipId) => ({ tenantId, teamId: created.id, membershipId })),
          });
          return created;
        });
        const { agent } = await signIn(app, scoped.email, password);
        const listed = (await agent.get('/api/teams').expect(200)).body as { members: { membershipId: string }[] }[];
        expect(listed[0]!.members.map((m) => m.membershipId)).toEqual([scopedId]);

        // A member deactivated after joining can stay or be removed, never blocking edits to the team.
        await withTenant(db, tenantId, (tx) =>
          tx.membership.update({ where: { id: otherId }, data: { status: 'deactivated' } }),
        );
        await agent
          .patch(`/api/teams/${team.id}`)
          .send({ memberIds: [scopedId, otherId] })
          .expect(200);
        await agent
          .patch(`/api/teams/${team.id}`)
          .send({ memberIds: [scopedId] })
          .expect(200);
        await agent
          .patch(`/api/teams/${team.id}`)
          .send({ memberIds: [otherId] })
          .expect(422);
      } finally {
        await other.cleanup();
        await scoped.cleanup();
      }
    } finally {
      await t.cleanup();
    }
  });
});
