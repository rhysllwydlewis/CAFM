import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { ALL_PERMISSIONS, BUILTIN_ROLES, DEMO_PERSONAS } from '@cafm/shared';
import { AppModule } from '../src/app.module';
import { assertNotLastSuperUser } from '../src/core/access-rules';
import { PermissionGuard, RequireFeature, SessionGuard, TenantGuard } from '../src/core/auth.guards';
import { createTestAccount, createTestTenant, DEMO_TENANT, seedId, signIn, startApp, testPassword } from './helpers';

/** A probe endpoint gated on a Professional feature, to test @RequireFeature. */
@Controller('probe')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
class FeatureProbeController {
  @Get('compliance')
  @RequireFeature('compliance')
  compliance() {
    return { ok: true };
  }
}
@Module({ imports: [AppModule], controllers: [FeatureProbeController] })
class ProbeModule {}

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await startApp(ProbeModule);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe('built-in roles', () => {
  const demoPersonas = DEMO_PERSONAS.filter((p) => p.tenant === 'demo-estates');

  it.each(demoPersonas.map((p) => [p.key, p.role] as const))(
    '%s gets GET /api/people only if their role grants people.read',
    async (key, role) => {
      const { agent } = await signIn(app, `${key}@demo.example`);
      const grants = BUILTIN_ROLES.find((r) => r.key === role)!.permissions.includes('people.read');
      await agent.get('/api/people').expect(grants ? 200 : 403);
    },
  );

  it('/me returns the role’s permissions and the tenant’s entitlements', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const me = (await agent.get('/api/auth/me').expect(200)).body;
    expect(me.permissions).toEqual([...ALL_PERMISSIONS].sort());
    expect(me.scope).toBe('all');
    expect(me.entitlements.plan).toBe('enterprise');
    expect(me.entitlements.features).toEqual(expect.arrayContaining(['space', 'workplace', 'energy']));
  });

  it('a role with scope "own" sees only itself in the people list', async () => {
    const t = await createTestTenant(db);
    try {
      // Give the requester role people.read but keep its "own" scope.
      await withTenant(db, t.tenant.id, (tx) =>
        tx.role.update({
          where: { tenantId_key: { tenantId: t.tenant.id, key: 'requester' } },
          data: { permissions: ['people.read'] },
        }),
      );
      const me = await createTestAccount(db, [t.tenant.id], testPassword(), 'requester');
      await createTestAccount(db, [t.tenant.id], testPassword(), 'helpdesk');
      const { agent } = await signIn(app, me.email, me.password);
      const people = (await agent.get('/api/people').expect(200)).body;
      expect(people.map((p: { email: string }) => p.email)).toEqual([me.email]);
    } finally {
      await t.cleanup();
    }
  });
});

describe('feature gating', () => {
  it('lets a plan that includes the feature through', async () => {
    const { agent } = await signIn(app, 'manager@demo.example');
    await agent.get('/api/probe/compliance').expect(200);
  });

  it('locks it on a plan that doesn’t, with the plan that unlocks it', async () => {
    const { agent } = await signIn(app, 'starter@demo.example');
    const res = await agent.get('/api/probe/compliance').expect(403);
    expect(res.body).toMatchObject({ code: 'feature_locked', feature: 'compliance', plan: 'professional' });
    const me = (await agent.get('/api/auth/me').expect(200)).body;
    expect(me.entitlements.plan).toBe('starter');
    expect(me.entitlements.features).toContain('ppm');
    expect(me.entitlements.features).not.toContain('compliance');
  });
});

describe('roles', () => {
  it('a Super User can create, edit and delete a custom role, and it is audited', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const suffix = Math.random().toString(36).slice(2, 8);
    const created = await agent
      .post('/api/roles')
      .send({
        name: `Test Night Shift ${suffix}`,
        permissions: ['work_orders.read', 'work_orders.close'],
        scope: 'own',
      })
      .expect(201);
    try {
      expect(created.body.key).toBe(`custom_test_night_shift_${suffix}`);
      await agent
        .patch(`/api/roles/${created.body.id}`)
        .send({ permissions: ['work_orders.read'] })
        .expect(200);
      const log = (await agent.get('/api/audit').expect(200)).body;
      const actions = log
        .filter((e: { entityId: string }) => e.entityId === created.body.id)
        .map((e: { action: string }) => e.action);
      expect(actions).toEqual(expect.arrayContaining(['role.created', 'role.updated']));
    } finally {
      await agent.delete(`/api/roles/${created.body.id}`).expect(204);
    }
  });

  it('nobody can grant a permission they don’t hold', async () => {
    const { agent } = await signIn(app, 'admin@demo.example'); // Administrator: no billing.manage
    const res = await agent
      .post('/api/roles')
      .send({ name: 'Sneaky', permissions: ['billing.manage'] })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'privilege_escalation', permissions: ['billing.manage'] });
  });

  it('only Super Users can create roles with admin permissions', async () => {
    const { agent } = await signIn(app, 'admin@demo.example');
    const res = await agent
      .post('/api/roles')
      .send({ name: 'Inviters', permissions: ['people.invite'] })
      .expect(403);
    expect(res.body.code).toBe('admin_permissions_need_super_user');
  });

  it('needs roles.manage', async () => {
    const { agent } = await signIn(app, 'manager@demo.example');
    await agent.post('/api/roles').send({ name: 'Nope', permissions: [] }).expect(403);
  });

  it('the Super User role and built-in roles are protected', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const superUserRole = seedId(`role:${DEMO_TENANT}:super_user`);
    const helpdeskRole = seedId(`role:${DEMO_TENANT}:helpdesk`);
    await agent.patch(`/api/roles/${superUserRole}`).send({ permissions: [] }).expect(403);
    await agent.delete(`/api/roles/${helpdeskRole}`).expect(403);
  });

  it('cross-tenant: another organisation’s roles are not found', async () => {
    const { agent } = await signIn(app, 'starter@demo.example');
    const demoRole = seedId(`role:${DEMO_TENANT}:helpdesk`);
    await agent.patch(`/api/roles/${demoRole}`).send({ name: 'Hijacked' }).expect(404);
    const roles = (await agent.get('/api/roles').expect(200)).body;
    expect(roles.every((r: { id: string }) => r.id !== demoRole)).toBe(true);
  });
});

describe('changing people', () => {
  it('a Super User can change someone’s role, and it is audited', async () => {
    const t = await createTestTenant(db);
    try {
      const boss = await createTestAccount(db, [t.tenant.id], testPassword(), 'super_user');
      const worker = await createTestAccount(db, [t.tenant.id], testPassword(), 'helpdesk');
      const target = worker.memberships[0]!;
      const { agent } = await signIn(app, boss.email, boss.password);
      await agent.patch(`/api/people/${target}`).send({ role: 'planner' }).expect(200);
      const log = (await agent.get('/api/audit').expect(200)).body;
      expect(
        log.find(
          (e: { entityId: string; action: string }) => e.entityId === target && e.action === 'membership.updated',
        ),
      ).toMatchObject({
        changes: { before: { role: 'helpdesk' }, after: { role: 'planner' } },
      });
    } finally {
      await t.cleanup();
    }
  });

  it('in the demo, the demo personas and built-in roles can’t be changed', async () => {
    const original = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'true';
    try {
      const { agent } = await signIn(app, 'superuser@demo.example');
      const hana = seedId('membership:demo-estates:helpdesk');
      expect((await agent.patch(`/api/people/${hana}`).send({ role: 'planner' }).expect(403)).body.code).toBe(
        'demo_locked',
      );
      const helpdeskRole = seedId(`role:${DEMO_TENANT}:helpdesk`);
      expect((await agent.patch(`/api/roles/${helpdeskRole}`).send({ name: 'Renamed' }).expect(403)).body.code).toBe(
        'demo_locked',
      );
    } finally {
      process.env.DEMO_MODE = original;
    }
  });

  it('nobody can change their own role', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent
      .patch(`/api/people/${seedId('membership:demo-estates:superuser')}`)
      .send({ role: 'requester' })
      .expect(403);
  });

  it('an Administrator can’t change a Super User or make anyone a Super User', async () => {
    const { agent } = await signIn(app, 'admin@demo.example');
    const sam = seedId('membership:demo-estates:superuser');
    const hana = seedId('membership:demo-estates:helpdesk');
    expect((await agent.patch(`/api/people/${sam}`).send({ status: 'deactivated' }).expect(403)).body.code).toBe(
      'privilege_escalation',
    );
    expect((await agent.patch(`/api/people/${hana}`).send({ role: 'super_user' }).expect(403)).body.code).toBe(
      'privilege_escalation',
    );
  });

  it('deactivating someone signs them out', async () => {
    const t = await createTestTenant(db);
    try {
      const boss = await createTestAccount(db, [t.tenant.id], testPassword(), 'super_user');
      const worker = await createTestAccount(db, [t.tenant.id], testPassword(), 'helpdesk');
      const { agent: bossAgent } = await signIn(app, boss.email, boss.password);
      const { agent: workerAgent } = await signIn(app, worker.email, worker.password);
      await workerAgent.get('/api/auth/me').expect(200);
      await bossAgent.patch(`/api/people/${worker.memberships[0]}`).send({ status: 'deactivated' }).expect(200);
      await workerAgent.get('/api/auth/me').expect(401);
    } finally {
      await t.cleanup();
    }
  });

  it('one Super User can demote another while two are active', async () => {
    const t = await createTestTenant(db);
    try {
      const a = await createTestAccount(db, [t.tenant.id], testPassword(), 'super_user');
      const b = await createTestAccount(db, [t.tenant.id], testPassword(), 'super_user');
      const { agent } = await signIn(app, a.email, a.password);
      await agent.patch(`/api/people/${b.memberships[0]}`).send({ role: 'administrator' }).expect(200);
    } finally {
      await t.cleanup();
    }
  });

  it('refuses to remove the last active Super User', () => {
    expect(() => assertNotLastSuperUser(1)).toThrow(/at least one active Super User/);
    expect(() => assertNotLastSuperUser(2)).not.toThrow();
  });

  it('cross-tenant: can’t change a member of another organisation', async () => {
    const { agent } = await signIn(app, 'starter@demo.example');
    await agent
      .patch(`/api/people/${seedId('membership:demo-estates:helpdesk')}`)
      .send({ role: 'requester' })
      .expect(404);
  });
});

describe('audit log', () => {
  it('needs audit.read', async () => {
    const { agent } = await signIn(app, 'manager@demo.example');
    await agent.get('/api/audit').expect(403);
  });

  it('cross-tenant: shows only this organisation’s events', async () => {
    const { agent } = await signIn(app, 'starter@demo.example');
    const log = (await agent.get('/api/audit').expect(200)).body;
    expect(log.every((e: { tenantId: string }) => e.tenantId !== DEMO_TENANT)).toBe(true);
  });

  it('needs a session', async () => {
    await http().get('/api/audit').expect(401);
  });
});
