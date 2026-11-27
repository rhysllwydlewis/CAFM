import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@fmstead/db';
import { ADMIN_CALENDARS_PAGE_SIZE, DEFAULT_SITE_CALENDAR } from '@fmstead/shared';
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

describe.each(['overview', 'users', 'calendars'])('GET /api/admin/%s', (path) => {
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

describe('GET /api/admin/calendars', () => {
  it('lists every site with its business calendar', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const res = await agent.get('/api/admin/calendars').expect(200);
    expect(res.body.sites.length).toBeGreaterThan(5);
    const withCalendar = res.body.sites.filter((s: { calendar: unknown }) => s.calendar);
    expect(withCalendar.length).toBeGreaterThan(0);
    expect(withCalendar[0].calendar.hours.length).toBeGreaterThan(0);
  });

  it('cross-tenant: another organisation sees none of these sites', async () => {
    const demo = (await (await signIn(app, 'superuser@demo.example')).agent.get('/api/admin/calendars').expect(200))
      .body;
    const starter = (await (await signIn(app, 'starter@demo.example')).agent.get('/api/admin/calendars').expect(200))
      .body;
    const demoIds = new Set(demo.sites.map((s: { id: string }) => s.id));
    expect(starter.sites.every((s: { id: string }) => !demoIds.has(s.id))).toBe(true);
  });
});

describe('GET /api/admin/calendars paging and counts', () => {
  it('says how many sites there are and how many have no calendar, for the demo organisation', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const body = (await agent.get('/api/admin/calendars').expect(200)).body;
    expect(body).toMatchObject({ page: 1, pageSize: ADMIN_CALENDARS_PAGE_SIZE });
    expect(body.total).toBe(body.sites.length);
    expect(body.missing).toBe(body.sites.filter((s: { calendar: unknown }) => !s.calendar).length);
  });

  it('pages through every site, with the counts covering all pages and none left out', async () => {
    const { tenant, cleanup } = await createTestTenant(db);
    try {
      const password = testPassword();
      const admin = await createTestAccount(db, [tenant.id], password, 'super_user');
      const count = ADMIN_CALENDARS_PAGE_SIZE * 2 + 5;
      // Every second site has a calendar, and some of the others hold a stored calendar that no longer validates.
      const stored = (i: number) =>
        i % 2 === 0 ? DEFAULT_SITE_CALENDAR : i % 5 === 0 ? { hours: 'nonsense' } : undefined;
      const expectedMissing = Array.from({ length: count }, (_, i) => i).filter((i) => i % 2 !== 0).length;
      await withTenant(db, tenant.id, (tx) =>
        tx.location.createMany({
          data: Array.from({ length: count }, (_, i) => ({
            tenantId: tenant.id,
            name: `Site ${String(i).padStart(3, '0')}`,
            code: `S${i}`,
            kind: 'site',
            siteCalendar: stored(i),
          })),
        }),
      );
      // A closed site and a floor are not part of the overview.
      await withTenant(db, tenant.id, (tx) =>
        tx.location.createMany({
          data: [
            { tenantId: tenant.id, name: 'Closed site', code: 'CLOSED', kind: 'site', status: 'closed' },
            { tenantId: tenant.id, name: 'A floor', code: 'FLOOR', kind: 'floor' },
          ],
        }),
      );
      const { agent } = await signIn(app, admin.email, password);

      const seen: string[] = [];
      for (const [page, expected] of [
        [1, ADMIN_CALENDARS_PAGE_SIZE],
        [2, ADMIN_CALENDARS_PAGE_SIZE],
        [3, 5],
      ] as const) {
        const body = (await agent.get(`/api/admin/calendars?page=${page}`).expect(200)).body;
        expect(body).toMatchObject({
          page,
          pageSize: ADMIN_CALENDARS_PAGE_SIZE,
          total: count,
          missing: expectedMissing,
        });
        expect(body.sites).toHaveLength(expected);
        seen.push(...body.sites.map((s: { name: string }) => s.name));
      }
      // Name order across the pages, every site exactly once.
      expect(seen).toEqual(Array.from({ length: count }, (_, i) => `Site ${String(i).padStart(3, '0')}`));

      // A page past the end gives the last page, and the page it returns says so.
      const past = (await agent.get('/api/admin/calendars?page=99').expect(200)).body;
      expect(past.page).toBe(3);
      expect(past.sites).toHaveLength(5);
    } finally {
      await cleanup();
    }
  });

  it('refuses a page that is not a positive whole number', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    for (const page of ['0', '-1', 'abc', '1.5']) {
      await agent.get(`/api/admin/calendars?page=${page}`).expect(400);
    }
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
