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
      senderName: null,
      hasLogo: false,
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
    expect(saved.body).toEqual({
      accentColour: '#136676',
      loginMessage: 'Welcome to Demo Estates facilities.',
      senderName: null,
      hasLogo: false,
    });
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
    expect(res.body).toEqual({ accentColour: null, loginMessage: null, senderName: null, hasLogo: false });
  });

  it.each([
    ['too light for white text', { accentColour: '#ffee88', loginMessage: null }],
    ['not a hex colour', { accentColour: 'teal', loginMessage: null }],
    ['a message that is too long', { accentColour: null, loginMessage: 'x'.repeat(201) }],
    ['a sender name with a line break', { accentColour: null, loginMessage: null, senderName: 'Hi\r\nBcc: x@y.z' }],
    ['a sender name with an address in it', { accentColour: null, loginMessage: null, senderName: 'a <b@c.d>' }],
  ])('rejects %s', async (_name, body) => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/branding').send(body).expect(400);
  });
});

describe('sender name', () => {
  it('is saved, kept when left out, and cleared when empty', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const saved = await agent
      .put('/api/admin/branding')
      .send({ accentColour: null, loginMessage: null, senderName: 'Demo Estates (Facilities) & Co.' })
      .expect(200);
    expect(saved.body.senderName).toBe('Demo Estates (Facilities) & Co.');
    const kept = await agent.put('/api/admin/branding').send({ accentColour: null, loginMessage: null }).expect(200);
    expect(kept.body.senderName).toBe('Demo Estates (Facilities) & Co.');
    const cleared = await agent
      .put('/api/admin/branding')
      .send({ accentColour: null, loginMessage: null, senderName: '' })
      .expect(200);
    expect(cleared.body.senderName).toBeNull();
  });
});

describe('logo', () => {
  // The smallest valid PNG and JPEG headers are enough: only the file signature is checked.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
  const upload = { contentType: 'image/png', dataBase64: png.toString('base64') };

  it('needs a session, settings.manage and the plan', async () => {
    await request(app.getHttpServer()).get('/api/branding/logo').expect(401);
    await request(app.getHttpServer()).put('/api/admin/branding/logo').send(upload).expect(401);
    await request(app.getHttpServer()).delete('/api/admin/branding/logo').expect(401);
    const member = await signIn(app, 'requester@demo.example');
    await member.agent.put('/api/admin/branding/logo').send(upload).expect(403);
    await member.agent.delete('/api/admin/branding/logo').expect(403);
    const starter = await signIn(app, 'starter@demo.example');
    expect([402, 403]).toContain((await starter.agent.put('/api/admin/branding/logo').send(upload)).status);
  });

  it('is stored, served with safe headers to members, audited, and removed', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.get('/api/branding/logo').expect(404);
    const saved = await agent.put('/api/admin/branding/logo').send(upload).expect(200);
    expect(saved.body.hasLogo).toBe(true);
    const member = await signIn(app, 'requester@demo.example');
    const res = await member.agent.get('/api/branding/logo').expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body).equals(png)).toBe(true);
    const events = await withTenant(db, DEMO_TENANT, (tx) =>
      tx.auditEvent.count({ where: { action: 'settings.branding_logo_updated' } }),
    );
    expect(events).toBeGreaterThan(0);
    const removed = await agent.delete('/api/admin/branding/logo').expect(200);
    expect(removed.body.hasLogo).toBe(false);
    await agent.get('/api/branding/logo').expect(404);
  });

  it('never shows one organisation the logo of another', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/branding/logo').send(upload).expect(200);
    const other = await signIn(app, 'starter@demo.example');
    await other.agent.get('/api/branding/logo').expect(404);
  });

  it.each([
    ['an SVG', { contentType: 'image/svg+xml', dataBase64: Buffer.from('<svg onload="x()"/>').toString('base64') }],
    ['a file that is not the type it claims', { contentType: 'image/jpeg', dataBase64: png.toString('base64') }],
    ['an empty file', { contentType: 'image/png', dataBase64: '' }],
    ['text that is not base64', { contentType: 'image/png', dataBase64: 'not base64!!' }],
    [
      'a file over 64 KB',
      { contentType: 'image/png', dataBase64: Buffer.concat([png, Buffer.alloc(70_000)]).toString('base64') },
    ],
  ])('rejects %s', async (_name, body) => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.put('/api/admin/branding/logo').send(body).expect(400);
  });
});
