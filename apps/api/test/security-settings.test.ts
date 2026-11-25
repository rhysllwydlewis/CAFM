import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { DEMO_PASSWORD, passwordProblem } from '@cafm/shared';
import { csvCell } from '../src/modules/admin/security.controller';
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
  it.each(['/api/admin/security', '/api/admin/audit', '/api/admin/audit/filters', '/api/admin/audit/export'])(
    'GET %s needs a session',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
    },
  );

  it('PUT needs a session', async () => {
    await request(app.getHttpServer()).put('/api/admin/security').send(settings).expect(401);
  });

  it('is refused to someone without the permission', async () => {
    const { agent } = await signIn(app, 'requester@demo.example');
    await agent.get('/api/admin/security').expect(403);
    await agent.put('/api/admin/security').send(settings).expect(403);
    await agent.get('/api/admin/audit').expect(403);
    await agent.get('/api/admin/audit/filters').expect(403);
    await agent.get('/api/admin/audit/export').expect(403);
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

  it('filters by person, record type, record and date range', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/security').send(settings).expect(200);
    const options = (await agent.get('/api/admin/audit/filters').expect(200)).body;
    expect(options.entityTypes).toContain('tenant_security');
    const sam = options.people.find((p: { name: string }) => p.name === 'Sam Sutton');
    expect(sam).toBeTruthy();

    const mine = (await agent.get('/api/admin/audit?actorId=' + sam.id + '&entityType=tenant_security').expect(200))
      .body;
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((e: { actor: string }) => e.actor === 'Sam Sutton')).toBe(true);

    const nobody = (await agent.get('/api/admin/audit?actorId=' + randomUUID()).expect(200)).body;
    expect(nobody.items).toEqual([]);
    const recordId = mine.items[0].entityId;
    if (recordId) {
      const one = (await agent.get('/api/admin/audit?entityId=' + recordId).expect(200)).body;
      expect(one.items.every((e: { entityId: string }) => e.entityId === recordId)).toBe(true);
    }
    const old = (await agent.get('/api/admin/audit?to=2020-01-01T00:00:00.000Z').expect(200)).body;
    expect(old.items).toEqual([]);
    await agent.get('/api/admin/audit?actorId=not-a-uuid').expect(400);
    await agent.get('/api/admin/audit?from=not-a-date').expect(400);
  });

  it('shows another organisation neither its people, its record types nor its events', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/security').send(settings).expect(200);
    const sam = (await agent.get('/api/admin/audit/filters').expect(200)).body.people.find(
      (p: { name: string }) => p.name === 'Sam Sutton',
    );
    const other = await signIn(app, 'starter@demo.example');
    const options = (await other.agent.get('/api/admin/audit/filters').expect(200)).body;
    expect(options.people.some((p: { id: string }) => p.id === sam.id)).toBe(false);
    const events = (await other.agent.get('/api/admin/audit?actorId=' + sam.id).expect(200)).body;
    expect(events.items).toEqual([]);
    const csv = (await other.agent.get('/api/admin/audit/export?action=security_updated').expect(200)).text;
    expect(csv).not.toContain('Sam Sutton');
  });

  it('exports the filtered log as CSV, audits the export and neutralises spreadsheet formulas', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/security').send(settings).expect(200);
    const res = await agent.get('/api/admin/audit/export?action=security_updated').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('audit-log.csv');
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe('"When (UTC)","Who","Event","Record type","Record id","IP","Changes"');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).every((l) => l.includes('settings.security_updated'))).toBe(true);
    const log = (await agent.get('/api/admin/audit?action=audit.exported').expect(200)).body;
    expect(log.items[0]).toMatchObject({ action: 'audit.exported', entityType: 'audit' });
    await agent.get('/api/admin/audit/export?actorId=nope').expect(400);
  });
});

describe('csvCell', () => {
  it('quotes values and defuses formulas', () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell(null)).toBe('""');
  });
});
