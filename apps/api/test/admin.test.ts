import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { signIn, startApp } from './helpers';

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterAll(() => app.close());

describe.each(['overview', 'users'])('GET /api/admin/%s', (path) => {
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
});
