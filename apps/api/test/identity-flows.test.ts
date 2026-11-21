import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@cafm/db';
import { DEMO_PASSWORD } from '@cafm/shared';
import {
  createTestAccount,
  createTestTenant,
  DEMO_TENANT,
  ownerDb,
  sessionCookie,
  signIn,
  startApp,
  testPassword,
} from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const owner = ownerDb();
const http = () => request(app.getHttpServer());
const NEW_PASSWORD = testPassword();
const OTHER_PASSWORD = testPassword();

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
  await owner.$disconnect();
});

/** The newest queued email to an address, as the worker would send it. */
async function latestEmail(to: string) {
  const msg = await owner.outboxMessage.findFirst({
    where: { topic: 'email.send', payload: { path: ['to'], equals: to } },
    orderBy: { createdAt: 'desc' },
  });
  return msg
    ? { ...(msg.payload as { subject: string; text: string; capture?: boolean }), tenantId: msg.tenantId }
    : null;
}

function linkToken(text: string, path: string): string {
  const match = text.match(new RegExp(`/${path}/([A-Za-z0-9_-]+)`));
  if (!match) throw new Error(`No ${path} link in: ${text}`);
  return match[1]!;
}

describe('password reset', () => {
  it('gives the same answer for unknown, demo and real accounts, and only emails the real one', async () => {
    const t = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const answers = await Promise.all(
        ['nobody@test.example', 'manager@demo.example', t.email].map((identifier) =>
          http().post('/api/auth/password-reset').send({ identifier }).expect(202),
        ),
      );
      expect(new Set(answers.map((a) => a.body.message)).size).toBe(1);
      expect(await latestEmail('manager@demo.example')).toBeNull();
      expect((await latestEmail(t.email))?.tenantId).toBeNull();
    } finally {
      await t.cleanup();
    }
  });

  it('resets the password with the emailed link, once, and signs out everywhere', async () => {
    const t = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const { agent: oldSession } = await signIn(app, t.email, t.password);
      await http().post('/api/auth/password-reset').send({ identifier: t.email }).expect(202);
      const token = linkToken((await latestEmail(t.email))!.text, 'reset-password');

      expect((await http().get(`/api/auth/password-reset/${token}`).expect(200)).body).toEqual({ valid: true });
      const weak = await http().post('/api/auth/password-reset/confirm').send({ token, password: 'short' }).expect(422);
      expect(weak.body.message).toBe('Use at least 12 characters');

      await http().post('/api/auth/password-reset/confirm').send({ token, password: NEW_PASSWORD }).expect(204);
      await oldSession.get('/api/auth/me').expect(401);
      await signIn(app, t.email, NEW_PASSWORD);
      await http().post('/api/auth/password-reset/confirm').send({ token, password: OTHER_PASSWORD }).expect(410);
      expect((await http().get(`/api/auth/password-reset/${token}`).expect(200)).body).toEqual({ valid: false });
    } finally {
      await t.cleanup();
    }
  });

  it('refuses an expired link', async () => {
    const t = await createTestAccount(db, [DEMO_TENANT]);
    try {
      await http().post('/api/auth/password-reset').send({ identifier: t.email }).expect(202);
      const token = linkToken((await latestEmail(t.email))!.text, 'reset-password');
      await owner.passwordReset.updateMany({
        where: { accountId: t.account.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http().post('/api/auth/password-reset/confirm').send({ token, password: NEW_PASSWORD }).expect(410);
    } finally {
      await t.cleanup();
    }
  });
});

describe('invites', () => {
  it('a Super User invites a new person, who sets a password, accepts the terms and lands in the organisation', async () => {
    const email = `new-${Date.now()}@test.example`;
    const { agent } = await signIn(app, 'superuser@demo.example');
    const invite = (await agent.post('/api/people/invites').send({ email, role: 'helpdesk' }).expect(201)).body;
    expect(invite.tokenHash).toBeUndefined();
    try {
      const mail = (await latestEmail(email))!;
      expect(mail).toMatchObject({ tenantId: DEMO_TENANT, capture: true }); // demo tenant: captured, never sent
      const token = linkToken(mail.text, 'accept-invite');

      const details = (await http().get(`/api/auth/invites/${token}`).expect(200)).body;
      expect(details).toEqual({
        tenantName: 'Demo Estates Ltd',
        email,
        roleLabel: 'Helpdesk Operator',
        accountExists: false,
        status: 'pending',
      });

      await http().post(`/api/auth/invites/${token}/accept`).send({ acceptTerms: true }).expect(422);
      await http()
        .post(`/api/auth/invites/${token}/accept`)
        .send({ name: 'New Person', password: 'x', acceptTerms: true })
        .expect(422);
      await http()
        .post(`/api/auth/invites/${token}/accept`)
        .send({ name: 'New Person', password: NEW_PASSWORD })
        .expect(400);

      const newcomer = request.agent(app.getHttpServer());
      const accepted = await newcomer
        .post(`/api/auth/invites/${token}/accept`)
        .send({ name: 'New Person', password: NEW_PASSWORD, acceptTerms: true })
        .expect(200);
      expect(accepted.body).toEqual({ status: 'signed_in', landingPage: '/app' });
      expect(sessionCookie(accepted)).toBeTruthy();
      const me = (await newcomer.get('/api/auth/me').expect(200)).body;
      expect(me).toMatchObject({ name: 'New Person', role: 'helpdesk', tenant: { name: 'Demo Estates Ltd' } });

      await http()
        .post(`/api/auth/invites/${token}/accept`)
        .send({ name: 'Again', password: NEW_PASSWORD, acceptTerms: true })
        .expect(410);
      const log = (await agent.get('/api/audit').expect(200)).body as { entityId: string; action: string }[];
      expect(log.filter((e) => e.entityId === invite.id).map((e) => e.action)).toEqual(
        expect.arrayContaining(['invite.created', 'invite.accepted']),
      );
    } finally {
      const account = await owner.account.findUnique({ where: { email } });
      if (account) {
        await owner.session.deleteMany({ where: { accountId: account.id } });
        await owner.authEvent.deleteMany({ where: { accountId: account.id } });
        await owner.membership.deleteMany({ where: { accountId: account.id } });
        await owner.account.delete({ where: { id: account.id } });
      }
    }
  });

  it('someone with an account must sign in as that account to accept', async () => {
    const tt = await createTestTenant(db);
    const boss = await createTestAccount(db, [tt.tenant.id], testPassword(), 'super_user');
    const other = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const { agent } = await signIn(app, boss.email, boss.password);
      await agent.post('/api/people/invites').send({ email: other.email, role: 'requester' }).expect(201);
      const token = linkToken((await latestEmail(other.email))!.text, 'accept-invite');
      expect((await http().get(`/api/auth/invites/${token}`).expect(200)).body.accountExists).toBe(true);

      const anon = await http().post(`/api/auth/invites/${token}/accept`).send({ acceptTerms: true }).expect(401);
      expect(anon.body.code).toBe('sign_in_required');
      const wrong = (await signIn(app, boss.email, boss.password)).agent;
      await wrong.post(`/api/auth/invites/${token}/accept`).send({ acceptTerms: true }).expect(401);

      const { agent: theirs } = await signIn(app, other.email, other.password);
      await theirs.post(`/api/auth/invites/${token}/accept`).send({ acceptTerms: true }).expect(200);
      expect((await theirs.get('/api/auth/me').expect(200)).body.tenant.id).toBe(tt.tenant.id);
    } finally {
      await other.cleanup().catch(() => undefined);
      await tt.cleanup();
    }
  });

  it('follows the same escalation rules as changing a role', async () => {
    const { agent } = await signIn(app, 'admin@demo.example');
    const res = await agent
      .post('/api/people/invites')
      .send({ email: 'boss@test.example', role: 'super_user' })
      .expect(403);
    expect(res.body.code).toBe('privilege_escalation');
  });

  it('refuses someone who is already a member', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.post('/api/people/invites').send({ email: 'helpdesk@demo.example', role: 'requester' }).expect(409);
  });

  it('needs people.invite', async () => {
    const { agent } = await signIn(app, 'manager@demo.example');
    await agent.post('/api/people/invites').send({ email: 'x@test.example', role: 'requester' }).expect(403);
  });

  it('a revoked invite can’t be accepted, and other organisations can’t revoke it', async () => {
    const email = `revoke-${Date.now()}@test.example`;
    const { agent } = await signIn(app, 'superuser@demo.example');
    const invite = (await agent.post('/api/people/invites').send({ email, role: 'requester' }).expect(201)).body;
    const token = linkToken((await latestEmail(email))!.text, 'accept-invite');

    const { agent: outsider } = await signIn(app, 'starter@demo.example');
    await outsider.delete(`/api/people/invites/${invite.id}`).expect(404);

    await agent.delete(`/api/people/invites/${invite.id}`).expect(204);
    expect((await http().get(`/api/auth/invites/${token}`).expect(200)).body.status).toBe('revoked');
    await http()
      .post(`/api/auth/invites/${token}/accept`)
      .send({ name: 'X', password: NEW_PASSWORD, acceptTerms: true })
      .expect(410);
  });

  it('an unknown token is not found', async () => {
    await http().get('/api/auth/invites/not-a-real-token-at-all').expect(404);
  });
});

describe('demo password', () => {
  it('still signs in after the reset tests', async () => {
    await signIn(app, 'manager@demo.example', DEMO_PASSWORD);
  });
});
