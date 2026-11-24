import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { DEMO_PASSWORD, passwordProblem } from '@cafm/shared';
import { DEMO_TENANT, STARTER_TENANT, ownerDb, signIn, startApp } from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterEach(async () => {
  await withTenant(db, DEMO_TENANT, (tx) => tx.tenantSecurity.deleteMany({}));
  await withTenant(db, STARTER_TENANT, (tx) => tx.tenantSecurity.deleteMany({}));
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const settings = { passwordMinLength: 16, sessionTimeoutHours: 2, mfaRequired: true };

describe('passwordProblem', () => {
  it('never allows fewer than 12 characters and honours a longer organisation minimum', () => {
    expect(passwordProblem('a-long-enough-one')).toBeNull();
    expect(passwordProblem('short-pw-123', null, 4)).toBeNull();
    expect(passwordProblem('twelve-chars1', null, 16)).toBe('Use at least 16 characters');
  });
});

describe('security settings access', () => {
  it.each(['/api/admin/security', '/api/admin/audit'])('GET %s needs a session', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
  });

  it('PUT needs a session', async () => {
    await request(app.getHttpServer()).put('/api/admin/security').send(settings).expect(401);
  });

  it('is refused to someone without the permission', async () => {
    const { agent } = await signIn(app, 'requester@demo.example');
    await agent.get('/api/admin/security').expect(403);
    await agent.put('/api/admin/security').send(settings).expect(403);
    await agent.get('/api/admin/audit').expect(403);
  });

  it('starts with the standard rules', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    expect((await agent.get('/api/admin/security').expect(200)).body).toEqual({
      passwordMinLength: 12,
      sessionTimeoutHours: null,
      mfaRequired: false,
    });
  });

  it('saves valid settings, audits the change and keeps them inside the organisation', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/security').send(settings).expect(200);
    expect((await agent.get('/api/admin/security').expect(200)).body).toEqual(settings);

    const log = (await agent.get('/api/admin/audit?action=security_updated').expect(200)).body;
    expect(log.items[0]).toMatchObject({ action: 'settings.security_updated', entityType: 'tenant_security' });
    expect(log.items[0].actor).toBeTruthy();

    const other = await signIn(app, 'starter@demo.example');
    expect((await other.agent.get('/api/admin/security').expect(200)).body.passwordMinLength).toBe(12);
    const otherLog = (await other.agent.get('/api/admin/audit?action=security_updated').expect(200)).body;
    expect(otherLog.items).toEqual([]);
  });

  it.each([
    { ...settings, passwordMinLength: 11 },
    { ...settings, passwordMinLength: 65 },
    { ...settings, sessionTimeoutHours: 0 },
    { ...settings, sessionTimeoutHours: 721 },
    { ...settings, mfaRequired: 'yes' },
  ])('rejects %j', async (body) => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/security').send(body).expect(400);
  });
});

describe('session timeout', () => {
  it('shortens a new sign-in to the organisation limit', async () => {
    const admin = await signIn(app, 'superuser@demo.example');
    await admin.agent
      .put('/api/admin/security')
      .send({ ...settings, sessionTimeoutHours: 1 })
      .expect(200);
    const { res } = await signIn(app, 'manager@demo.example');
    expect(res.status).toBe(200);
    const owner = ownerDb();
    try {
      const row = await owner.session.findFirst({
        where: { account: { email: 'manager@demo.example' } },
        orderBy: { createdAt: 'desc' },
      });
      const ms = row!.expiresAt.getTime() - Date.now();
      expect(ms).toBeLessThan(61 * 60 * 1000);
      expect(ms).toBeGreaterThan(50 * 60 * 1000);
    } finally {
      await owner.$disconnect();
    }
  });
});

describe('session persistence under a limit', () => {
  it('remembers "keep me signed in" even when the limit shortens the session', async () => {
    const admin = await signIn(app, 'superuser@demo.example');
    await admin.agent
      .put('/api/admin/security')
      .send({ ...settings, sessionTimeoutHours: 2 })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'manager@demo.example', password: DEMO_PASSWORD, keepSignedIn: true })
      .expect(200);
    const owner = ownerDb();
    try {
      const row = await owner.session.findFirst({
        where: { account: { email: 'manager@demo.example' } },
        orderBy: { createdAt: 'desc' },
      });
      expect(row!.persistent).toBe(true);
      expect(row!.expiresAt.getTime() - Date.now()).toBeLessThan(2 * 60 * 60 * 1000 + 1000);
    } finally {
      await owner.$disconnect();
    }
  });
});

describe('audit log viewer', () => {
  it('pages through events newest first and filters by action', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    for (let i = 0; i < 3; i++) await agent.put('/api/admin/security').send(settings).expect(200);
    const all = (await agent.get('/api/admin/audit').expect(200)).body;
    expect(all.items.length).toBeGreaterThan(2);
    const ids = all.items.map((e: { id: string }) => e.id);
    expect([...ids].sort().reverse()).toEqual(ids);
    const filtered = (await agent.get('/api/admin/audit?action=security_updated').expect(200)).body;
    expect(filtered.items.every((e: { action: string }) => e.action.includes('security_updated'))).toBe(true);
    await agent.get('/api/admin/audit?cursor=not-a-uuid').expect(400);
  });
});
