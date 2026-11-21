import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DEMO_PERSONAS } from '@cafm/shared';
import { signIn, startApp } from './helpers';

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterAll(() => app.close());

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
