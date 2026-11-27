import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { dataScope } from '../src/core/data-scope';
import type { AuthContext } from '../src/core/session';
import { createTestAccount, createTestTenant, signIn, startApp, testPassword } from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const withScope = (scope: string | undefined) => ({ access: scope ? { scope } : undefined }) as unknown as AuthContext;

describe('data scope', () => {
  it('treats an unknown or missing scope as own records only', () => {
    expect(dataScope(withScope('all'))).toBe('all');
    expect(dataScope(withScope('team'))).toBe('team');
    expect(dataScope(withScope('own'))).toBe('own');
    expect(dataScope(withScope('everything'))).toBe('own');
    expect(dataScope(withScope(undefined))).toBe('own');
  });
});

describe('the team data scope', () => {
  it('shows a person themself and their teammates, and nobody else, in the people list', async () => {
    const t = await createTestTenant(db);
    try {
      await withTenant(db, t.tenant.id, (tx) =>
        tx.role.create({
          data: {
            tenantId: t.tenant.id,
            key: 'custom_team_scope',
            name: 'Team scope',
            permissions: ['people.manage', 'people.read'],
            scope: 'team',
          },
        }),
      );
      const password = testPassword();
      const me = await createTestAccount(db, [t.tenant.id], password, 'custom_team_scope');
      const mate = await createTestAccount(db, [t.tenant.id], password, 'helpdesk');
      const stranger = await createTestAccount(db, [t.tenant.id], password, 'helpdesk');
      try {
        const members = await withTenant(db, t.tenant.id, (tx) =>
          tx.membership.findMany({ where: { tenantId: t.tenant.id }, include: { account: true } }),
        );
        const idOf = (email: string) => members.find((m) => m.account.email === email)!.id;
        await withTenant(db, t.tenant.id, async (tx) => {
          // Anyone below "all" is limited to sites, so make the others visible to that limit and let
          // only the team decide who shows.
          await tx.membership.updateMany({
            where: { tenantId: t.tenant.id, id: { in: [idOf(mate.email), idOf(stranger.email)] } },
            data: { locationScoped: true },
          });
          const team = await tx.team.create({ data: { tenantId: t.tenant.id, name: 'Crew' } });
          await tx.teamMember.createMany({
            data: [me.email, mate.email].map((e) => ({
              tenantId: t.tenant.id,
              teamId: team.id,
              membershipId: idOf(e),
            })),
          });
        });
        const { agent } = await signIn(app, me.email, password);
        for (const path of ['/api/admin/users', '/api/people']) {
          const res = await agent.get(path).expect(200);
          const emails = res.body.map((u: { email: string }) => u.email).sort();
          expect(emails).toEqual([me.email, mate.email].sort());
          expect(emails).not.toContain(stranger.email);
        }
        const teams = await agent.get('/api/teams').expect(200);
        const crew = teams.body.find((x: { name: string }) => x.name === 'Crew');
        expect(crew.members).toHaveLength(2);
      } finally {
        await stranger.cleanup();
        await mate.cleanup();
        await me.cleanup();
      }
    } finally {
      await t.cleanup();
    }
  });

  it('never reaches across organisations', async () => {
    const { agent } = await signIn(app, 'starter@demo.example');
    const res = await agent.get('/api/people').expect(200);
    expect(res.body.map((u: { email: string }) => u.email)).not.toContain('manager@demo.example');
  });

  it('can be chosen for a role, and an unknown scope is refused', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const made = await agent
      .post('/api/roles')
      .send({ name: 'Team scope test role', permissions: ['people.read'], scope: 'team' })
      .expect(201);
    try {
      expect(made.body.scope).toBe('team');
      await agent
        .post('/api/roles')
        .send({ name: 'Bad scope role', permissions: ['people.read'], scope: 'galaxy' })
        .expect(400);
    } finally {
      await agent.delete(`/api/roles/${made.body.id}`).expect(204);
    }
    await request(app.getHttpServer()).post('/api/roles').send({}).expect(401);
  });
});
