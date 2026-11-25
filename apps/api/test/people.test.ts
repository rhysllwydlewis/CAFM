import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DEMO_PERSONAS } from '@cafm/shared';
import { PrismaClient, withTenant } from '@cafm/db';
import { signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const demoEmails = DEMO_PERSONAS.filter((p) => p.tenant === 'demo-estates').map((p) => p.email);

describe('GET /api/people', () => {
  it('needs a session', async () => {
    await request(app.getHttpServer()).get('/api/people').expect(401);
  });

  it('needs the people.read permission', async () => {
    const { agent } = await signIn(app, 'requester@demo.example');
    await agent.get('/api/people').expect(403);
  });

  it('lists the people in the signed-in organisation', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const res = await agent.get('/api/people').expect(200);
    const emails = res.body.map((p: { email: string }) => p.email);
    expect(emails).toEqual(expect.arrayContaining(demoEmails));
    expect(emails).not.toContain('starter@demo.example');
  });

  it('cross-tenant: a Super User of another organisation sees none of these people', async () => {
    const { agent } = await signIn(app, 'starter@demo.example');
    const res = await agent.get('/api/people').expect(200);
    const emails = res.body.map((p: { email: string }) => p.email);
    expect(emails).toEqual(['starter@demo.example']);
    for (const email of demoEmails) expect(emails).not.toContain(email);
  });
});

describe('GET /api/people/export', () => {
  it('needs a session and the people.read permission', async () => {
    await request(app.getHttpServer()).get('/api/people/export').expect(401);
    const { agent } = await signIn(app, 'requester@demo.example');
    await agent.get('/api/people/export').expect(403);
  });

  it('exports the signed-in organisation as CSV and audits it', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const res = await agent.get('/api/people/export').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('people.csv');
    expect(res.text).toContain('name,email,role,status');
    for (const email of demoEmails) expect(res.text).toContain(email);
    expect(res.text).not.toContain('starter@demo.example');
    const me = (await agent.get('/api/auth/me').expect(200)).body;
    const tenantId = me.tenant.id as string;
    const events = await withTenant(db, tenantId, (tx) =>
      tx.auditEvent.findMany({ where: { action: 'people.exported' } }),
    );
    expect(events.length).toBeGreaterThan(0);
  });

  it('cross-tenant: another organisation exports only its own people', async () => {
    const { agent } = await signIn(app, 'starter@demo.example');
    const res = await agent.get('/api/people/export').expect(200);
    expect(res.text).toContain('starter@demo.example');
    for (const email of demoEmails) expect(res.text).not.toContain(email);
  });
});
