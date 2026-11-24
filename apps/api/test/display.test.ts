import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { DEMO_TENANT, signIn, startApp } from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterEach(async () => {
  // Leave the demo organisation as it was seeded.
  await withTenant(db, DEMO_TENANT, async (tx) => {
    await tx.moduleSetting.deleteMany({});
    await tx.termOverride.deleteMany({});
  });
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const SAVE = [
  ['PUT', '/api/admin/modules', { modules: [] }],
  ['PUT', '/api/admin/terminology', { terms: [] }],
] as const;

describe.each(['/api/display', '/api/admin/modules', '/api/admin/terminology'])('GET %s', (path) => {
  it('needs a session', async () => {
    await request(app.getHttpServer()).get(path).expect(401);
  });
});

describe('who may change modules and terminology', () => {
  it.each(SAVE)('%s %s is refused without a session', async (_m, path, body) => {
    await request(app.getHttpServer()).put(path).send(body).expect(401);
  });

  it.each(['/api/admin/modules', '/api/admin/terminology'])(
    '%s is refused to someone without settings.manage',
    async (path) => {
      const { agent } = await signIn(app, 'requester@demo.example');
      await agent.get(path).expect(403);
      await agent.put(path).send({ modules: [], terms: [] }).expect(403);
    },
  );

  it('lets any signed-in member read what the menu needs', async () => {
    const { agent } = await signIn(app, 'requester@demo.example');
    const res = await agent.get('/api/display').expect(200);
    expect(res.body).toEqual({ modules: [], terms: [] });
  });
});

describe('modules', () => {
  it('lists every module on by default, with the plan it needs', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const res = await agent.get('/api/admin/modules').expect(200);
    const keys = res.body.map((m: { key: string }) => m.key);
    expect(keys).toContain('work-orders');
    expect(res.body.every((m: { enabled: boolean }) => m.enabled)).toBe(true);
    expect(res.body.find((m: { key: string }) => m.key === 'work-orders')).toMatchObject({ inPlan: true });
  });

  it('switches a module off, renames it, audits the change, and restores the standard state', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const saved = await agent
      .put('/api/admin/modules')
      .send({
        modules: [
          { key: 'work-orders', enabled: true, label: 'Jobs', position: 2 },
          { key: 'finance', enabled: false, label: null, position: null },
        ],
      })
      .expect(200);
    expect(saved.body.modules).toHaveLength(2);
    const display = await agent.get('/api/display').expect(200);
    expect(display.body.modules).toEqual(
      expect.arrayContaining([{ key: 'finance', enabled: false, label: null, position: null }]),
    );
    // Anyone in the organisation sees it, so the menu changes for everyone.
    const other = await signIn(app, 'requester@demo.example');
    expect((await other.agent.get('/api/display').expect(200)).body.modules).toHaveLength(2);
    const events = await withTenant(db, DEMO_TENANT, (tx) =>
      tx.auditEvent.count({ where: { action: 'settings.modules_updated', entityType: 'module_setting' } }),
    );
    expect(events).toBeGreaterThan(0);
    await agent
      .put('/api/admin/modules')
      .send({ modules: [{ key: 'finance', enabled: true, label: null, position: null }] })
      .expect(200);
    expect((await agent.get('/api/display').expect(200)).body.modules).toHaveLength(1);
  });

  it.each([
    [{ modules: [{ key: 'nonsense', enabled: false, label: null, position: null }] }],
    [{ modules: [{ key: 'finance', enabled: true, label: '<b>x</b>', position: null }] }],
    [{ modules: [{ key: 'finance', enabled: true, label: 'x'.repeat(41), position: null }] }],
    [{ modules: [{ key: 'finance', enabled: true, label: null, position: 0 }] }],
    [
      {
        modules: [
          { key: 'finance', enabled: true, label: null, position: null },
          { key: 'finance', enabled: false, label: null, position: null },
        ],
      },
    ],
  ])('refuses invalid input %#', async (body) => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/modules').send(body).expect(400);
  });

  it('cross-tenant: another organisation never sees or inherits these choices', async () => {
    const demo = await signIn(app, 'superuser@demo.example');
    await demo.agent
      .put('/api/admin/modules')
      .send({ modules: [{ key: 'finance', enabled: false, label: 'Money', position: 3 }] })
      .expect(200);
    const starter = await signIn(app, 'starter@demo.example');
    expect((await starter.agent.get('/api/display').expect(200)).body.modules).toEqual([]);
    const list = await starter.agent.get('/api/admin/modules').expect(200);
    expect(list.body.find((m: { key: string }) => m.key === 'finance')).toMatchObject({ enabled: true, label: null });
    // And a change there doesn't touch the demo organisation.
    await starter.agent
      .put('/api/admin/modules')
      .send({ modules: [{ key: 'finance', enabled: true, label: null, position: null }] })
      .expect(200);
    expect((await demo.agent.get('/api/display').expect(200)).body.modules).toHaveLength(1);
  });
});

describe('terminology', () => {
  it('lists the standard words, saves your own, audits it, and puts the standard ones back', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const list = await agent.get('/api/admin/terminology').expect(200);
    expect(list.body.find((t: { key: string }) => t.key === 'site')).toMatchObject({
      singular: 'Site',
      plural: 'Sites',
      custom: null,
    });
    await agent
      .put('/api/admin/terminology')
      .send({ terms: [{ key: 'site', custom: { singular: 'School', plural: 'Schools' } }] })
      .expect(200);
    expect((await agent.get('/api/display').expect(200)).body.terms).toEqual([
      { key: 'site', singular: 'School', plural: 'Schools' },
    ]);
    const events = await withTenant(db, DEMO_TENANT, (tx) =>
      tx.auditEvent.count({ where: { action: 'settings.terminology_updated' } }),
    );
    expect(events).toBeGreaterThan(0);
    await agent
      .put('/api/admin/terminology')
      .send({ terms: [{ key: 'site', custom: null }] })
      .expect(200);
    expect((await agent.get('/api/display').expect(200)).body.terms).toEqual([]);
  });

  it.each([
    [{ terms: [{ key: 'nonsense', custom: { singular: 'A', plural: 'As' } }] }],
    [{ terms: [{ key: 'site', custom: { singular: '', plural: 'As' } }] }],
    [{ terms: [{ key: 'site', custom: { singular: '<i>', plural: 'As' } }] }],
  ])('refuses invalid input %#', async (body) => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/terminology').send(body).expect(400);
  });

  it('cross-tenant: another organisation keeps the standard words', async () => {
    const demo = await signIn(app, 'superuser@demo.example');
    await demo.agent
      .put('/api/admin/terminology')
      .send({ terms: [{ key: 'site', custom: { singular: 'School', plural: 'Schools' } }] })
      .expect(200);
    const starter = await signIn(app, 'starter@demo.example');
    expect((await starter.agent.get('/api/display').expect(200)).body.terms).toEqual([]);
    const list = await starter.agent.get('/api/admin/terminology').expect(200);
    expect(list.body.find((t: { key: string }) => t.key === 'site').custom).toBeNull();
  });
});
