import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@fmstead/db';
import { SIGN_IN_FAILED } from '@fmstead/shared';
import {
  createTestAccount,
  createTestTenant,
  DEMO_TENANT,
  seedId,
  sessionCookie,
  signIn,
  startApp,
  STARTER_TENANT,
} from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('signs a demo persona in and sets a secure session cookie', async () => {
    const { agent, res } = await signIn(app, 'Technician@demo.example');
    expect(res.body).toEqual({ status: 'signed_in', landingPage: '/app' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/fmstead_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).not.toMatch(/Expires=/); // browser-session cookie unless "keep me signed in"

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ name: 'Tom Price', roleLabel: 'Technician', tenant: { name: 'Demo Estates Ltd' } });
  });

  it('sets a 30-day cookie with "keep me signed in"', async () => {
    const res = await http()
      .post('/api/auth/login')
      .send({ identifier: 'requester@demo.example', password: 'FmsDemo!2026', keepSignedIn: true })
      .expect(200);
    expect(String(res.headers['set-cookie'])).toMatch(/Expires=/);
  });

  it('gives the same generic error for a wrong password and an unknown account', async () => {
    const wrong = await http().post('/api/auth/login').send({ identifier: 'finance@demo.example', password: 'nope' });
    const unknown = await http().post('/api/auth/login').send({ identifier: 'nobody@demo.example', password: 'nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(SIGN_IN_FAILED);
    expect(unknown.body.message).toBe(SIGN_IN_FAILED);
  });

  it('rejects an empty form with field messages', async () => {
    const res = await http().post('/api/auth/login').send({ identifier: '', password: '' }).expect(400);
    expect(res.body.message).toEqual(['Enter your email or username', 'Enter your password']);
  });

  it('locks a normal account after five failures, even for the right password', async () => {
    const t = await createTestAccount(db, [DEMO_TENANT]);
    try {
      for (let i = 0; i < 5; i++) {
        await http().post('/api/auth/login').send({ identifier: t.email, password: 'wrong' }).expect(401);
      }
      await http().post('/api/auth/login').send({ identifier: t.email, password: t.password }).expect(401);
      const events = await db.authEvent.findMany({ where: { accountId: t.account.id }, select: { type: true } });
      expect(events.map((e) => e.type)).toContain('account_locked');
    } finally {
      await t.cleanup();
    }
  });

  it('never locks a demo account, so nobody can break the demo', async () => {
    for (let i = 0; i < 6; i++) {
      await http().post('/api/auth/login').send({ identifier: 'auditor@demo.example', password: 'wrong' }).expect(401);
    }
    await signIn(app, 'auditor@demo.example');
  });
});

describe('CSRF protection', () => {
  it('refuses a state-changing request that is not JSON', async () => {
    await http().post('/api/auth/login').type('form').send('identifier=a&password=b').expect(403);
  });

  it('accepts a request from the site it was made to', async () => {
    await http()
      .post('/api/auth/login')
      .set('Origin', 'https://fmstead.example')
      .set('X-Forwarded-Host', 'fmstead.example')
      .send({ identifier: 'executive@demo.example', password: 'FmsDemo!2026' })
      .expect(200);
  });

  it('refuses a request whose origin is not the site it was made to', async () => {
    await http()
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .set('X-Forwarded-Host', 'fmstead.example')
      .send({ identifier: 'executive@demo.example', password: 'FmsDemo!2026' })
      .expect(403);
  });

  it('refuses a request from another origin', async () => {
    await http()
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ identifier: 'superuser@demo.example', password: 'FmsDemo!2026' })
      .expect(403);
  });
});

describe('GET /api/auth/demo-accounts', () => {
  const original = process.env.DEMO_MODE;
  afterEach(() => {
    process.env.DEMO_MODE = original;
  });

  it('does not exist unless DEMO_MODE is true', async () => {
    delete process.env.DEMO_MODE;
    await http().get('/api/auth/demo-accounts').expect(404);
    process.env.DEMO_MODE = 'false';
    await http().get('/api/auth/demo-accounts').expect(404);
  });

  it('lists the 16 demo personas in demo mode', async () => {
    process.env.DEMO_MODE = 'true';
    const res = await http().get('/api/auth/demo-accounts').expect(200);
    expect(res.body.personas).toHaveLength(16);
    expect(res.body.personas.filter((p: { featured: boolean }) => p.featured)).toHaveLength(6);
  });
});

describe('choosing an organisation', () => {
  it('asks an account with two memberships to choose, then rotates the session', async () => {
    const t = await createTestAccount(db, [DEMO_TENANT, STARTER_TENANT]);
    try {
      const { agent, res } = await signIn(app, t.email, t.password);
      expect(res.body.status).toBe('choose_organisation');
      expect(res.body.organisations.map((o: { tenantName: string }) => o.tenantName)).toEqual([
        'Demo Estates Ltd',
        'Starter Demo Ltd',
      ]);
      const me = await agent.get('/api/auth/me').expect(403);
      expect(me.body.code).toBe('organisation_required');

      // Someone else's membership can't be chosen.
      const other = seedId('membership:demo-estates:superuser');
      await agent.post('/api/auth/select-organisation').send({ membershipId: other }).expect(401);

      const first = sessionCookie(res);
      const chosen = await agent
        .post('/api/auth/select-organisation')
        .send({ membershipId: t.memberships[1] })
        .expect(200);
      expect(sessionCookie(chosen)).not.toBe(first);
      const after = await agent.get('/api/auth/me').expect(200);
      expect(after.body.tenant.name).toBe('Starter Demo Ltd');
      // The pre-rotation token no longer works.
      await http().get('/api/auth/me').set('Cookie', first).expect(401);
    } finally {
      await t.cleanup();
    }
  });
});

describe('sessions', () => {
  it('signing in again ends the previous session', async () => {
    const { agent, res } = await signIn(app, 'planner@demo.example');
    const first = sessionCookie(res);
    await agent
      .post('/api/auth/login')
      .send({ identifier: 'planner@demo.example', password: 'FmsDemo!2026' })
      .expect(200);
    await http().get('/api/auth/me').set('Cookie', first).expect(401);
    await agent.get('/api/auth/me').expect(200);
  });

  it('rejects and removes an expired session', async () => {
    const { agent } = await signIn(app, 'stores@demo.example');
    const accountId = seedId('account:stores');
    const latest = await db.session.findFirstOrThrow({ where: { accountId }, orderBy: { createdAt: 'desc' } });
    await db.session.update({ where: { id: latest.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await agent.get('/api/auth/me').expect(401);
    expect(await db.session.count({ where: { id: latest.id } })).toBe(0);
  });

  it('stops working when the organisation is suspended', async () => {
    const tt = await createTestTenant(db);
    const t = await createTestAccount(db, [tt.tenant.id]);
    try {
      const { agent } = await signIn(app, t.email, t.password);
      await agent.get('/api/auth/me').expect(200);
      await db.tenant.update({ where: { id: tt.tenant.id }, data: { status: 'suspended' } });
      const me = await agent.get('/api/auth/me').expect(403);
      expect(me.body.code).toBe('organisation_required');
    } finally {
      await t.cleanup();
      await tt.cleanup();
    }
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session and clears the cookie', async () => {
    const { agent } = await signIn(app, 'manager@demo.example');
    const res = await agent.post('/api/auth/logout').send({}).expect(204);
    expect(String(res.headers['set-cookie'])).toMatch(/fmstead_session=;.*Expires=Thu, 01 Jan 1970/);
    await agent.get('/api/auth/me').expect(401);
  });

  it('succeeds without a session, so signing out never gets stuck', async () => {
    await http().post('/api/auth/logout').send({}).expect(204);
    await http().post('/api/auth/logout').set('Cookie', 'fmstead_session=not-a-real-token').send({}).expect(204);
  });
});
