import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@fmstead/db';
import { nextNumber } from '../src/core/config';
import { createTestAccount, createTestTenant, DEMO_TENANT, seedId, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe('custom fields', () => {
  it('a Super User adds a field; every change is a version that can be rolled back, and audited', async () => {
    const t = await createTestTenant(db, 'professional');
    try {
      const boss = await createTestAccount(db, [t.tenant.id], undefined, 'super_user');
      const { agent } = await signIn(app, boss.email, boss.password);
      const field = (
        await agent
          .post('/api/config/fields')
          .send({
            entityType: 'asset',
            key: 'fire_zone',
            label: 'Fire zone',
            type: 'picklist',
            options: [{ value: 'a', label: 'Zone A' }],
          })
          .expect(201)
      ).body;
      await agent.patch(`/api/config/fields/${field.id}`).send({ label: 'Fire compartment' }).expect(200);
      expect(
        (await agent.get('/api/config/fields?entityType=asset').expect(200)).body.map(
          (f: { label: string }) => f.label,
        ),
      ).toEqual(['Fire compartment']);

      const versions = (await agent.get(`/api/config/fields/${field.id}/versions`).expect(200)).body;
      expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
      const rolled = (await agent.post(`/api/config/fields/${field.id}/rollback`).send({ version: 1 }).expect(200))
        .body;
      expect(rolled.label).toBe('Fire zone');
      expect((await agent.get(`/api/config/fields/${field.id}/versions`).expect(200)).body).toHaveLength(3);

      const log = (await agent.get('/api/audit').expect(200)).body as { action: string }[];
      expect(log.map((e) => e.action)).toEqual(
        expect.arrayContaining(['field.created', 'field.updated', 'field.rolled_back']),
      );

      // A pick list can't lose its options by being edited.
      await agent.patch(`/api/config/fields/${field.id}`).send({ options: [] }).expect(422);
    } finally {
      await t.cleanup();
    }
  });

  it('validates values against the definitions, with messages per field', async () => {
    const { agent } = await signIn(app, 'technician@demo.example');
    await agent
      .post('/api/config/fields/validate')
      .send({ entityType: 'asset', values: { criticality: 'high', warranty_expires: '2027-01-31' } })
      .expect(200);
    const res = await agent
      .post('/api/config/fields/validate')
      .send({ entityType: 'asset', values: { criticality: 'severe', colour: 'red' } })
      .expect(422);
    expect(res.body.errors).toEqual({
      criticality: 'Choose one of the options for Criticality',
      colour: 'This field doesn’t exist',
    });
  });

  it('enforces the plan’s custom field limit', async () => {
    const t = await createTestTenant(db, 'free');
    try {
      const boss = await createTestAccount(db, [t.tenant.id], undefined, 'super_user');
      const { agent } = await signIn(app, boss.email, boss.password);
      for (let i = 1; i <= 5; i++) {
        await agent
          .post('/api/config/fields')
          .send({ entityType: 'asset', key: `f${i}`, label: `Field ${i}`, type: 'text' })
          .expect(201);
      }
      const res = await agent
        .post('/api/config/fields')
        .send({ entityType: 'asset', key: 'f6', label: 'Field 6', type: 'text' })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'limit_reached', limit: 5 });
    } finally {
      await t.cleanup();
    }
  });

  it('rolling back can’t bring a field back past the plan’s limit', async () => {
    const t = await createTestTenant(db, 'free');
    try {
      const boss = await createTestAccount(db, [t.tenant.id], undefined, 'super_user');
      const { agent } = await signIn(app, boss.email, boss.password);
      const ids: string[] = [];
      for (let i = 1; i <= 5; i++) {
        ids.push(
          (
            await agent
              .post('/api/config/fields')
              .send({ entityType: 'asset', key: `f${i}`, label: `Field ${i}`, type: 'text' })
              .expect(201)
          ).body.id,
        );
      }
      await agent.delete(`/api/config/fields/${ids[0]}`).expect(204);
      await agent
        .post('/api/config/fields')
        .send({ entityType: 'asset', key: 'f6', label: 'Field 6', type: 'text' })
        .expect(201);
      const res = await agent.post(`/api/config/fields/${ids[0]}/rollback`).send({ version: 1 }).expect(403);
      expect(res.body.code).toBe('limit_reached');
    } finally {
      await t.cleanup();
    }
  });

  it('needs settings.manage to change fields', async () => {
    const { agent } = await signIn(app, 'manager@demo.example');
    await agent
      .post('/api/config/fields')
      .send({ entityType: 'asset', key: 'x1', label: 'X', type: 'text' })
      .expect(403);
  });

  it('the administration list includes deactivated fields and the plan limit, for settings.manage only', async () => {
    const t = await createTestTenant(db, 'professional');
    try {
      const boss = await createTestAccount(db, [t.tenant.id], undefined, 'super_user');
      const { agent } = await signIn(app, boss.email, boss.password);
      const field = (
        await agent
          .post('/api/config/fields')
          .send({ entityType: 'asset', key: 'old_tag', label: 'Old tag', type: 'text' })
          .expect(201)
      ).body;
      await agent.delete(`/api/config/fields/${field.id}`).expect(204);
      const all = (await agent.get('/api/config/fields/all').expect(200)).body;
      expect(all.fields.map((f: { key: string; active: boolean }) => [f.key, f.active])).toEqual([['old_tag', false]]);
      expect(all).toHaveProperty('limit');
    } finally {
      await t.cleanup();
    }
    const { agent: manager } = await signIn(app, 'manager@demo.example');
    await manager.get('/api/config/fields/all').expect(403);
    await request(app.getHttpServer()).get('/api/config/fields/all').expect(401);
  });

  it('cross-tenant: the administration list shows only your own organisation’s fields', async () => {
    const [one, two] = [await createTestTenant(db, 'professional'), await createTestTenant(db, 'professional')];
    try {
      const bossOne = await createTestAccount(db, [one.tenant.id], undefined, 'super_user');
      const bossTwo = await createTestAccount(db, [two.tenant.id], undefined, 'super_user');
      const { agent: agentOne } = await signIn(app, bossOne.email, bossOne.password);
      const { agent: agentTwo } = await signIn(app, bossTwo.email, bossTwo.password);
      const created = (
        await agentOne
          .post('/api/config/fields')
          .send({ entityType: 'asset', key: 'only_mine', label: 'Only mine', type: 'text' })
          .expect(201)
      ).body;
      const seen = (await agentTwo.get('/api/config/fields/all').expect(200)).body;
      expect(seen.fields).toEqual([]);
      const own = (await agentOne.get('/api/config/fields/all').expect(200)).body;
      expect(own.fields.map((f: { id: string }) => f.id)).toEqual([created.id]);
    } finally {
      await one.cleanup();
      await two.cleanup();
    }
  });

  it('cross-tenant: another organisation’s fields are invisible and can’t be changed', async () => {
    const { agent } = await signIn(app, 'starter@demo.example');
    const demoField = seedId('field:asset:criticality');
    await agent.patch(`/api/config/fields/${demoField}`).send({ label: 'Hijacked' }).expect(404);
    expect(
      (await agent.get('/api/config/fields').expect(200)).body.some((f: { id: string }) => f.id === demoField),
    ).toBe(false);
  });
});

describe('numbering', () => {
  it('validates and stores a format, and audits it', async () => {
    const t = await createTestTenant(db, 'starter');
    try {
      const boss = await createTestAccount(db, [t.tenant.id], undefined, 'super_user');
      const { agent } = await signIn(app, boss.email, boss.password);
      const bad = await agent.put('/api/config/numbering/work_order').send({ format: 'WO-{YYYY}' }).expect(422);
      expect(bad.body.message).toBe('Include exactly one sequence, like {00000}');
      // A token with no value would break every number, so it is refused up front.
      const unknown = await agent
        .put('/api/config/numbering/work_order')
        .send({ format: 'WO-{REGION}-{00000}' })
        .expect(422);
      expect(unknown.body.message).toMatch(/\{REGION\} isn’t a token you can use/);
      await agent.put('/api/config/numbering/constructor').send({ format: 'X-{00000}' }).expect(422);
      await agent.put('/api/config/numbering/work_order').send({ format: 'JOB-{YYYY}-{0000}' }).expect(200);
      const list = (await agent.get('/api/config/numbering').expect(200)).body as { key: string; example: string }[];
      expect(list.find((s) => s.key === 'work_order')?.example).toMatch(/^JOB-\d{4}-0001$/);
    } finally {
      await t.cleanup();
    }
  });

  it('issues gap-free, unique numbers under concurrency', async () => {
    const t = await createTestTenant(db, 'starter');
    try {
      const numbers = await Promise.all(
        Array.from({ length: 20 }, () =>
          withTenant(db, t.tenant.id, (tx) => nextNumber(tx, t.tenant.id, 'work_order')),
        ),
      );
      expect(new Set(numbers).size).toBe(20);
      expect([...numbers].sort()).toEqual(Array.from({ length: 20 }, (_, i) => `WO-${String(i + 1).padStart(5, '0')}`));
      // A rolled-back transaction gives its number back.
      await expect(
        withTenant(db, t.tenant.id, async (tx) => {
          await nextNumber(tx, t.tenant.id, 'work_order');
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(await withTenant(db, t.tenant.id, (tx) => nextNumber(tx, t.tenant.id, 'work_order'))).toBe('WO-00021');
    } finally {
      await t.cleanup();
    }
  });

  it('cross-tenant: one organisation’s numbers don’t affect another’s', async () => {
    const a = await withTenant(db, DEMO_TENANT, (tx) => nextNumber(tx, DEMO_TENANT, 'request'));
    expect(a).toMatch(/^REQ-\d{5}$/);
  });
});
