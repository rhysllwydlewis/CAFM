import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { contrastWithWhite } from '@cafm/shared';
import { DEMO_TENANT, signIn, startApp } from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterEach(async () => {
  await withTenant(db, DEMO_TENANT, (tx) => tx.tenantBranding.deleteMany({}));
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe('contrastWithWhite', () => {
  it('rates dark colours high, light colours low, and rejects bad input', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 1);
    expect(contrastWithWhite('#136676')!).toBeGreaterThan(4.5);
    expect(contrastWithWhite('red')).toBeNull();
  });
});

describe('branding access', () => {
  it.each(['/api/branding', '/api/admin/branding'])('GET %s needs a session', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
  });

  it('PUT needs a session', async () => {
    await request(app.getHttpServer()).put('/api/admin/branding').send({}).expect(401);
  });

  it('is refused to someone without settings.manage', async () => {
    const { agent } = await signIn(app, 'requester@demo.example');
    await agent.get('/api/admin/branding').expect(403);
    await agent.put('/api/admin/branding').send({ accentColour: null, loginMessage: null }).expect(403);
  });

  it('is refused when the plan does not include it', async () => {
    const { agent } = await signIn(app, 'starter@demo.example');
    const res = await agent.put('/api/admin/branding').send({ accentColour: null, loginMessage: null });
    expect([402, 403]).toContain(res.status);
  });

  it('never shows one organisation the colour of another', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/branding').send({ accentColour: '#136676', loginMessage: null }).expect(200);
    const other = await signIn(app, 'starter@demo.example');
    expect((await other.agent.get('/api/branding').expect(200)).body).toEqual({
      accentColour: null,
      loginMessage: null,
    });
  });
});

describe('saving branding', () => {
  it('saves a colour and message, audits it, and lets any member read it', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const saved = await agent
      .put('/api/admin/branding')
      .send({ accentColour: '#136676', loginMessage: 'Welcome to Demo Estates facilities.' })
      .expect(200);
    expect(saved.body).toEqual({ accentColour: '#136676', loginMessage: 'Welcome to Demo Estates facilities.' });
    const member = await signIn(app, 'requester@demo.example');
    expect((await member.agent.get('/api/branding').expect(200)).body.accentColour).toBe('#136676');
    const events = await withTenant(db, DEMO_TENANT, (tx) =>
      tx.auditEvent.count({ where: { action: 'settings.branding_updated' } }),
    );
    expect(events).toBeGreaterThan(0);
  });

  it('puts the standard look back when cleared', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/branding').send({ accentColour: '#136676', loginMessage: 'Hi' }).expect(200);
    const res = await agent.put('/api/admin/branding').send({ accentColour: null, loginMessage: '' }).expect(200);
    expect(res.body).toEqual({ accentColour: null, loginMessage: null });
  });

  it.each([
    ['too light for white text', { accentColour: '#ffee88', loginMessage: null }],
    ['not a hex colour', { accentColour: 'teal', loginMessage: null }],
    ['a message that is too long', { accentColour: null, loginMessage: 'x'.repeat(201) }],
  ])('rejects %s', async (_name, body) => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/branding').send(body).expect(400);
  });
});
