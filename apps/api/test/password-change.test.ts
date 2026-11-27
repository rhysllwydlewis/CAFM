import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@fmstead/db';
import { DEMO_PASSWORD } from '@fmstead/shared';
import { createTestAccount, DEMO_TENANT, ownerDb, signIn, startApp, testPassword } from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const owner = ownerDb();

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
  await owner.$disconnect();
});

const login = (identifier: string, password: string) =>
  request(app.getHttpServer()).post('/api/auth/login').send({ identifier, password });

describe('changing your own password', () => {
  it('needs a session', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/password')
      .send({ currentPassword: 'x', newPassword: 'y' })
      .expect(401);
  });

  it('a shared demo account cannot change its password', async () => {
    const original = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'true';
    try {
      const { agent } = await signIn(app, 'requester@demo.example');
      await agent
        .post('/api/auth/password')
        .send({ currentPassword: DEMO_PASSWORD, newPassword: testPassword() })
        .expect(403);
    } finally {
      if (original === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = original;
    }
  });

  it('refuses a wrong current password, a weak new one and the same one, and changes nothing', async () => {
    const person = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const { agent } = await signIn(app, person.email, person.password);
      const wrong = await agent
        .post('/api/auth/password')
        .send({ currentPassword: 'not-my-password', newPassword: testPassword() })
        .expect(422);
      expect(wrong.body.code).toBe('wrong_current_password');
      const weak = await agent
        .post('/api/auth/password')
        .send({ currentPassword: person.password, newPassword: 'short' })
        .expect(422);
      expect(weak.body.code).toBe('weak_password');
      const same = await agent
        .post('/api/auth/password')
        .send({ currentPassword: person.password, newPassword: person.password })
        .expect(422);
      expect(same.body.code).toBe('same_password');
      await agent.post('/api/auth/password').send({ currentPassword: person.password }).expect(400);
      await login(person.email, person.password).expect(200);
      expect(
        await owner.authEvent.count({ where: { accountId: person.account.id, type: 'password_change_failed' } }),
      ).toBe(1);
    } finally {
      await person.cleanup();
    }
  });

  it('changes it, ends every other session, keeps this one and records it', async () => {
    const person = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const here = await signIn(app, person.email, person.password);
      const elsewhere = await signIn(app, person.email, person.password);
      await here.agent.get('/api/auth/organisations').expect(200);
      await elsewhere.agent.get('/api/auth/organisations').expect(200);

      const next = testPassword();
      await here.agent
        .post('/api/auth/password')
        .send({ currentPassword: person.password, newPassword: next })
        .expect(204);

      await here.agent.get('/api/auth/organisations').expect(200);
      await elsewhere.agent.get('/api/auth/organisations').expect(401);
      await login(person.email, person.password).expect(401);
      expect((await login(person.email, next).expect(200)).body.status).toBe('signed_in');
      expect(await owner.authEvent.count({ where: { accountId: person.account.id, type: 'password_changed' } })).toBe(
        1,
      );
    } finally {
      await person.cleanup();
    }
  });

  it('counts wrong current passwords against the per-IP limit on failed attempts', async () => {
    const original = process.env.LOGIN_FAILURES_PER_IP;
    process.env.LOGIN_FAILURES_PER_IP = '2';
    const limited = await startApp();
    const person = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const agent = request.agent(limited.getHttpServer());
      await agent.post('/api/auth/login').send({ identifier: person.email, password: person.password }).expect(200);
      for (let i = 0; i < 2; i++) {
        await agent
          .post('/api/auth/password')
          .send({ currentPassword: 'not-my-password', newPassword: testPassword() })
          .expect(422);
      }
      await agent
        .post('/api/auth/password')
        .send({ currentPassword: person.password, newPassword: testPassword() })
        .expect(429);
    } finally {
      await limited.close();
      if (original === undefined) delete process.env.LOGIN_FAILURES_PER_IP;
      else process.env.LOGIN_FAILURES_PER_IP = original;
      await person.cleanup();
    }
  });
});
