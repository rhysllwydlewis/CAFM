import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { createTestTenant, DEMO_TENANT, signIn, startApp } from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const cleanups: Array<() => Promise<void>> = [];

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterEach(async () => {
  await withTenant(db, DEMO_TENANT, (tx) => tx.tenantBranding.deleteMany({}));
  while (cleanups.length) await cleanups.pop()!();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const get = (slug: string) => request(app.getHttpServer()).get(`/api/public/sign-in-message/${slug}`);

describe('public sign-in message', () => {
  it('shows the message an organisation saved, without a session', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent
      .put('/api/admin/branding')
      .send({ accentColour: null, loginMessage: 'Welcome to Demo Estates.' })
      .expect(200);
    expect((await get('demo-estates').expect(200)).body).toEqual({ message: 'Welcome to Demo Estates.' });
  });

  it('answers the same for an unknown organisation, one with no message and a bad address', async () => {
    const unset = (await get('demo-estates').expect(200)).body;
    const unknown = (await get('no-such-organisation').expect(200)).body;
    const malformed = (await get('Not%20A%20Slug').expect(200)).body;
    expect(unset).toEqual({ message: null });
    expect(unknown).toEqual(unset);
    expect(malformed).toEqual(unset);
  });

  it('never shows one organisation the message of another, and hides it when the plan lacks branding', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/branding').send({ accentColour: null, loginMessage: 'Demo only.' }).expect(200);
    const other = await createTestTenant(db, 'starter');
    cleanups.push(other.cleanup);
    await withTenant(db, other.tenant.id, (tx) =>
      tx.tenantBranding.create({ data: { tenantId: other.tenant.id, loginMessage: 'Starter message.' } }),
    );
    expect((await get(other.tenant.slug).expect(200)).body).toEqual({ message: null });
    expect((await get('demo-estates').expect(200)).body).toEqual({ message: 'Demo only.' });
  });
});
