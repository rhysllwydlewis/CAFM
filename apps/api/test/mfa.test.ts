import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@cafm/db';
import { base32Encode, codeFor, stepAt, verifyCode } from '../src/core/totp';
import { createTestAccount, createTestTenant, DEMO_TENANT, ownerDb, signIn, startApp } from './helpers';

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

const now = () => stepAt(Date.now());
/** A code that was never valid for the current window. */
const wrongCode = (secret: string) => {
  const good = new Set([now() - 1, now(), now() + 1].map((s) => codeFor(secret, s)));
  return ['000000', '111111', '222222'].find((c) => !good.has(c))!;
};

describe('TOTP', () => {
  const rfcSecret = base32Encode(Buffer.from('12345678901234567890'));

  it('matches the RFC 6238 test vector', () => {
    // 59 seconds is step 1; the RFC's 8-digit code 94287082 ends in the 6-digit code 287082.
    expect(codeFor(rfcSecret, 1)).toBe('287082');
    expect(verifyCode(rfcSecret, '287082', 0, 59_000)).toBe(1);
  });

  it('allows one step of clock drift, refuses a used step and a far-off code', () => {
    expect(verifyCode(rfcSecret, codeFor(rfcSecret, 0), -1, 59_000)).toBe(0);
    expect(verifyCode(rfcSecret, codeFor(rfcSecret, 2), -1, 59_000)).toBe(2);
    expect(verifyCode(rfcSecret, codeFor(rfcSecret, 1), 1, 59_000)).toBeNull();
    expect(verifyCode(rfcSecret, codeFor(rfcSecret, 5), 0, 59_000)).toBeNull();
    expect(verifyCode(rfcSecret, 'abcdef', 0, 59_000)).toBeNull();
  });
});

describe('MFA needs a session', () => {
  it.each([
    ['get', '/api/auth/mfa'],
    ['post', '/api/auth/mfa/enrol'],
    ['post', '/api/auth/mfa/confirm'],
    ['post', '/api/auth/mfa/recovery-codes'],
    ['post', '/api/auth/mfa/disable'],
  ] as const)('%s %s is refused without one', async (method, path) => {
    await request(app.getHttpServer())[method](path).send({}).expect(401);
  });

  it('a shared demo account cannot change MFA', async () => {
    const original = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'true';
    try {
      const { agent } = await signIn(app, 'requester@demo.example');
      await agent.post('/api/auth/mfa/enrol').send({}).expect(403);
    } finally {
      if (original === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = original;
    }
  });
});

describe('enrolment and sign-in with a second step', () => {
  it('enrols, signs in only after the code, and refuses a replayed code', async () => {
    const person = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const { agent } = await signIn(app, person.email, person.password);
      const enrol = (await agent.post('/api/auth/mfa/enrol').send({}).expect(200)).body as {
        secret: string;
        otpauthUri: string;
      };
      expect(enrol.otpauthUri).toContain('otpauth://totp/');
      // A wrong code does not switch it on.
      await agent
        .post('/api/auth/mfa/confirm')
        .send({ code: wrongCode(enrol.secret) })
        .expect(401);
      expect((await agent.get('/api/auth/mfa').expect(200)).body.enabled).toBe(false);

      const first = codeFor(enrol.secret, now());
      const { recoveryCodes } = (await agent.post('/api/auth/mfa/confirm').send({ code: first }).expect(200)).body as {
        recoveryCodes: string[];
      };
      expect(recoveryCodes).toHaveLength(10);
      expect((await agent.get('/api/auth/mfa').expect(200)).body).toEqual({ enabled: true, recoveryCodesLeft: 10 });
      // The secret is stored encrypted.
      const row = await db.accountMfa.findUniqueOrThrow({ where: { accountId: person.account.id } });
      expect(row.secretCipher).not.toContain(enrol.secret);

      // Password alone no longer signs in.
      const login = request.agent(app.getHttpServer());
      const res = await login.post('/api/auth/login').send({ identifier: person.email, password: person.password });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'mfa_required' });
      expect(String(res.headers['set-cookie'])).not.toContain('cafm_session=');
      await login.get('/api/auth/me').expect(401);

      // The step used to confirm can't be used again, so sign in with the next one.
      await login.post('/api/auth/mfa/verify').send({ code: first }).expect(401);
      const next = codeFor(enrol.secret, now() + 1);
      const ok = await login.post('/api/auth/mfa/verify').send({ code: next }).expect(200);
      expect(ok.body.status).toBe('signed_in');
      await login.get('/api/auth/me').expect(200);

      // The same code never works twice, even on a fresh challenge.
      const again = request.agent(app.getHttpServer());
      await again.post('/api/auth/login').send({ identifier: person.email, password: person.password });
      await again.post('/api/auth/mfa/verify').send({ code: next }).expect(401);
    } finally {
      await person.cleanup();
    }
  });

  it('a recovery code works once, five wrong codes end the challenge, and no challenge means no sign-in', async () => {
    const person = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const { agent } = await signIn(app, person.email, person.password);
      const { secret } = (await agent.post('/api/auth/mfa/enrol').send({}).expect(200)).body as { secret: string };
      const { recoveryCodes } = (
        await agent
          .post('/api/auth/mfa/confirm')
          .send({ code: codeFor(secret, now()) })
          .expect(200)
      ).body as { recoveryCodes: string[] };

      await request(app.getHttpServer()).post('/api/auth/mfa/verify').send({ code: '123456' }).expect(401);

      const a = request.agent(app.getHttpServer());
      await a.post('/api/auth/login').send({ identifier: person.email, password: person.password });
      await a.post('/api/auth/mfa/verify').send({ recoveryCode: recoveryCodes[0] }).expect(200);
      expect((await agent.get('/api/auth/mfa').expect(200)).body.recoveryCodesLeft).toBe(9);

      const b = request.agent(app.getHttpServer());
      await b.post('/api/auth/login').send({ identifier: person.email, password: person.password });
      await b.post('/api/auth/mfa/verify').send({ recoveryCode: recoveryCodes[0] }).expect(401);

      const c = request.agent(app.getHttpServer());
      await c.post('/api/auth/login').send({ identifier: person.email, password: person.password });
      for (let i = 0; i < 5; i += 1) {
        await c
          .post('/api/auth/mfa/verify')
          .send({ code: wrongCode(secret) })
          .expect(401);
      }
      // The challenge is gone, so even a right code fails now.
      await c
        .post('/api/auth/mfa/verify')
        .send({ code: codeFor(secret, now() + 1) })
        .expect(401);
    } finally {
      await person.cleanup();
    }
  });

  it('turning it off needs the password, and sign-in is then password only', async () => {
    const person = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const { agent } = await signIn(app, person.email, person.password);
      const { secret } = (await agent.post('/api/auth/mfa/enrol').send({}).expect(200)).body as { secret: string };
      await agent
        .post('/api/auth/mfa/confirm')
        .send({ code: codeFor(secret, now()) })
        .expect(200);
      await agent.post('/api/auth/mfa/enrol').send({}).expect(409);
      await agent.post('/api/auth/mfa/disable').send({ password: 'not-the-password' }).expect(401);
      await agent.post('/api/auth/mfa/disable').send({ password: person.password }).expect(204);
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: person.email, password: person.password });
      expect(res.body.status).toBe('signed_in');
    } finally {
      await person.cleanup();
    }
  });
});

describe('an administrator resets someone’s MFA', () => {
  it('needs people.manage, is audited, and cannot reach another organisation', async () => {
    const person = await createTestAccount(db, [DEMO_TENANT]);
    const other = await createTestTenant(db);
    const outsider = await createTestAccount(db, [other.tenant.id], undefined, 'super_user');
    try {
      const { agent } = await signIn(app, person.email, person.password);
      const { secret } = (await agent.post('/api/auth/mfa/enrol').send({}).expect(200)).body as { secret: string };
      await agent
        .post('/api/auth/mfa/confirm')
        .send({ code: codeFor(secret, now()) })
        .expect(200);
      const target = person.memberships[0];

      await request(app.getHttpServer()).post(`/api/people/${target}/mfa/reset`).send({}).expect(401);
      const requester = await signIn(app, 'requester@demo.example');
      await requester.agent.post(`/api/people/${target}/mfa/reset`).send({}).expect(403);

      // A Super User of another organisation can't see this membership at all.
      const foreign = await signIn(app, outsider.email, outsider.password);
      await foreign.agent.post(`/api/people/${target}/mfa/reset`).send({}).expect(404);
      expect((await db.accountMfa.count({ where: { accountId: person.account.id } })) > 0).toBe(true);

      const admin = await signIn(app, 'superuser@demo.example');
      await admin.agent.post(`/api/people/${target}/mfa/reset`).send({}).expect(200);
      expect(await db.accountMfa.count({ where: { accountId: person.account.id } })).toBe(0);
      expect(await db.mfaRecoveryCode.count({ where: { accountId: person.account.id } })).toBe(0);
      const logged = await owner.auditEvent.findFirst({ where: { action: 'membership.mfa_reset', entityId: target } });
      expect(logged).not.toBeNull();
      await owner.auditEvent.deleteMany({ where: { action: 'membership.mfa_reset', entityId: target } });
    } finally {
      await outsider.cleanup();
      await other.cleanup();
      await person.cleanup();
    }
  });
});
