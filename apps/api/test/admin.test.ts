import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
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

describe.each(['overview', 'users'])('GET /api/admin/%s', (path) => {
  it('needs a session', async () => {
    await request(app.getHttpServer()).get(`/api/admin/${path}`).expect(401);
  });

  it('is refused to someone without the admin permission', async () => {
    const { agent } = await signIn(app, 'requester@demo.example');
    await agent.get(`/api/admin/${path}`).expect(403);
  });
});

describe('GET /api/admin/overview', () => {
  it('summarises licences, seats and the setup checklist', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const res = await agent.get('/api/admin/overview').expect(200);
    expect(res.body.organisation).toBe('Demo Estates Ltd');
    expect(res.body.activeUsers).toBeGreaterThan(5);
    const total = (Object.values(res.body.licences) as number[]).reduce((a, b) => a + b, 0);
    expect(total).toBe(res.body.activeUsers);
    expect(res.body.checklist.length).toBeGreaterThan(3);
  });

  it('cross-tenant: counts only the signed-in organisation', async () => {
    const demo = await (await signIn(app, 'superuser@demo.example')).agent.get('/api/admin/overview').expect(200);
    const starter = await (await signIn(app, 'starter@demo.example')).agent.get('/api/admin/overview').expect(200);
    expect(starter.body.organisation).not.toBe(demo.body.organisation);
    expect(starter.body.activeUsers).toBeLessThan(demo.body.activeUsers);
  });
});

describe('GET /api/admin/users', () => {
  it('lists people with licence and role', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const res = await agent.get('/api/admin/users').expect(200);
    const sam = res.body.find((u: { email: string }) => u.email === 'superuser@demo.example');
    expect(sam).toMatchObject({ role: 'super_user', status: 'active' });
    expect(sam.licence).toBe('full');
  });

  it('cross-tenant: another organisation sees none of these people', async () => {
    const { agent } = await signIn(app, 'starter@demo.example');
    const res = await agent.get('/api/admin/users').expect(200);
    expect(res.body.map((u: { email: string }) => u.email)).toEqual(['starter@demo.example']);
  });

  it('applies the data scope: a role with scope "own" sees only itself', async () => {
    const t = await createTestTenant(db);
    try {
      await withTenant(db, t.tenant.id, (tx) =>
        tx.role.create({
          data: {
            tenantId: t.tenant.id,
            key: 'custom_own_scope',
            name: 'Own scope',
            permissions: ['people.manage'],
            scope: 'own',
          },
        }),
      );
      const password = testPassword();
      const scoped = await createTestAccount(db, [t.tenant.id], password, 'custom_own_scope');
      const other = await createTestAccount(db, [t.tenant.id], password, 'helpdesk');
      try {
        const { agent } = await signIn(app, scoped.email, password);
        const res = await agent.get('/api/admin/users').expect(200);
        expect(res.body.map((u: { email: string }) => u.email)).toEqual([scoped.email]);
        expect(res.body.some((u: { email: string }) => u.email === other.email)).toBe(false);
      } finally {
        await other.cleanup();
        await scoped.cleanup();
      }
    } finally {
      await t.cleanup();
    }
  });
});
