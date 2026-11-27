import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@fmstead/db';
import { TOO_MANY_ATTEMPTS } from '@fmstead/shared';
import { codeFor, stepAt } from '../src/core/totp';
import { createTestAccount, DEMO_TENANT, ownerDb, signIn, startApp } from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const owner = ownerDb();
const original = process.env.LOGIN_FAILURES_PER_IP;

let app: NestExpressApplication;
beforeAll(async () => {
  process.env.LOGIN_FAILURES_PER_IP = '3';
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
  await owner.$disconnect();
  if (original === undefined) delete process.env.LOGIN_FAILURES_PER_IP;
  else process.env.LOGIN_FAILURES_PER_IP = original;
});

describe('wrong passwords on the MFA password checks count against the per-IP limit', () => {
  it('refuses disable and new recovery codes with 429 once the limit is reached, even with the right password', async () => {
    const person = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const { agent } = await signIn(app, person.email, person.password);
      const { secret } = (await agent.post('/api/auth/mfa/enrol').send({}).expect(200)).body as { secret: string };
      await agent
        .post('/api/auth/mfa/confirm')
        .send({ code: codeFor(secret, stepAt(Date.now())) })
        .expect(200);

      // Three wrong passwords across the two endpoints use up the limit of three.
      await agent.post('/api/auth/mfa/disable').send({ password: 'not-the-password' }).expect(401);
      await agent.post('/api/auth/mfa/disable').send({ password: 'not-the-password' }).expect(401);
      await agent.post('/api/auth/mfa/recovery-codes').send({ password: 'not-the-password' }).expect(401);

      const disable = await agent.post('/api/auth/mfa/disable').send({ password: person.password }).expect(429);
      expect(disable.body.message).toBe(TOO_MANY_ATTEMPTS);
      const codes = await agent.post('/api/auth/mfa/recovery-codes').send({ password: person.password }).expect(429);
      expect(codes.body.message).toBe(TOO_MANY_ATTEMPTS);

      // The refused requests changed nothing, and were recorded.
      const where = { accountId: person.account.id };
      expect(await owner.accountMfa.count({ where })).toBe(1);
      expect(await owner.authEvent.count({ where: { ...where, type: 'mfa_password_failed' } })).toBe(3);
      expect(await owner.authEvent.count({ where: { ...where, type: 'sign_in_rate_limited' } })).toBe(2);
    } finally {
      await person.cleanup();
    }
  });
});
