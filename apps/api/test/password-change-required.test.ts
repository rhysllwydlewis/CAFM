import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@fmstead/db';
import { createTestAccount, createTestTenant, ownerDb, signIn, startApp } from './helpers';

// Issue #120: a person whose password an administrator generated or reset is held on a change-password step until they
// choose their own.

const owner = ownerDb();
const appDb = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
let app: NestExpressApplication;
const made: string[] = [];
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  const accounts = await owner.account.findMany({
    where: { username: { in: made.map((u) => `${u}@demo-estates`) }, isDemo: false },
    select: { id: true },
  });
  const ids = accounts.map((a) => a.id);
  await owner.session.deleteMany({ where: { accountId: { in: ids } } });
  await owner.membership.deleteMany({ where: { accountId: { in: ids } } });
  await owner.account.deleteMany({ where: { id: { in: ids } } });
  await app.close();
  await owner.$disconnect();
  await appDb.$disconnect();
});

const unique = () => {
  const name = `pc${Math.random().toString(36).slice(2, 8)}`;
  made.push(name);
  return name;
};
const CHOSEN = 'Quiet-Harbour-Lamp-4821';

async function newPerson() {
  const admin = await signIn(app, 'superuser@demo.example');
  const username = unique();
  const body = (
    await admin.agent
      .post('/api/admin/username-accounts')
      .send({ name: 'Held Person', username, role: 'technician' })
      .expect(201)
  ).body as { membershipId: string; temporaryPassword: string };
  const login = async (password: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ identifier: username, password, organisation: 'demo-estates' })
      .expect(200);
    return agent;
  };
  return { admin: admin.agent, username, login, ...body };
}

describe('a password an administrator generated', () => {
  it('holds the person on the change-password step, and nothing else', async () => {
    const person = await newPerson();
    const agent = await person.login(person.temporaryPassword);
    expect((await agent.get('/api/auth/me').expect(200)).body.passwordChangeRequired).toBe(true);
    // What the step itself needs is open.
    await agent.get('/api/auth/password-policy').expect(200);
    // Everything else is refused, with a reason the app can act on.
    const refused = await agent.get('/api/display').expect(403);
    expect(refused.body.code).toBe('password_change_required');
    await agent.get('/api/locations').expect(403);
    // Signing out is always possible.
    await agent.post('/api/auth/logout').send({}).expect(204);
  });

  it('is released by choosing their own password, and a wrong current password does not release it', async () => {
    const person = await newPerson();
    const agent = await person.login(person.temporaryPassword);
    await agent
      .post('/api/auth/password')
      .send({ currentPassword: 'not-the-password-at-all', newPassword: CHOSEN })
      .expect(422);
    expect((await agent.get('/api/auth/me').expect(200)).body.passwordChangeRequired).toBe(true);

    await agent
      .post('/api/auth/password')
      .send({ currentPassword: person.temporaryPassword, newPassword: CHOSEN })
      .expect(204);
    expect((await agent.get('/api/auth/me').expect(200)).body.passwordChangeRequired).toBe(false);
    await agent.get('/api/display').expect(200);
    // The new password signs in, and is not held again.
    const again = await person.login(CHOSEN);
    expect((await again.get('/api/auth/me').expect(200)).body.passwordChangeRequired).toBe(false);
  });

  it('holds the person again when an administrator resets the password', async () => {
    const person = await newPerson();
    const first = await person.login(person.temporaryPassword);
    await first
      .post('/api/auth/password')
      .send({ currentPassword: person.temporaryPassword, newPassword: CHOSEN })
      .expect(204);

    const reset = (
      await person.admin.post(`/api/admin/username-accounts/${person.membershipId}/reset-password`).send({}).expect(200)
    ).body as { temporaryPassword: string };
    const agent = await person.login(reset.temporaryPassword);
    expect((await agent.get('/api/auth/me').expect(200)).body.passwordChangeRequired).toBe(true);
    await agent.get('/api/display').expect(403);
  });

  it('never holds a person who chose their own password, such as the demo accounts', async () => {
    for (const email of ['superuser@demo.example', 'technician@demo.example', 'requester@demo.example']) {
      const { agent } = await signIn(app, email);
      expect((await agent.get('/api/auth/me').expect(200)).body.passwordChangeRequired).toBe(false);
      await agent.get('/api/display').expect(200);
    }
  });

  it('cross-tenant: another organisation cannot release or reset the person', async () => {
    const person = await newPerson();
    const starter = await signIn(app, 'starter@demo.example');
    await starter.agent.post(`/api/admin/username-accounts/${person.membershipId}/reset-password`).send({}).expect(404);
    // Their own flag is still set: nothing the other organisation did cleared it.
    const agent = await person.login(person.temporaryPassword);
    expect((await agent.get('/api/auth/me').expect(200)).body.passwordChangeRequired).toBe(true);
  });
});

describe('when the organisation also asks for two-step verification', () => {
  it('lets the person change the password first and then set up the second step, so neither blocks the other', async () => {
    const { tenant, cleanup } = await createTestTenant(appDb);
    try {
      await withTenant(appDb, tenant.id, (tx) =>
        tx.tenantSecurity.create({ data: { tenantId: tenant.id, mfaRequired: true } }),
      );
      const person = await createTestAccount(appDb, [tenant.id], undefined, 'technician');
      await owner.account.update({ where: { id: person.account.id }, data: { mustChangePassword: true } });
      const { agent } = await signIn(app, person.email, person.password);
      const me = (await agent.get('/api/auth/me').expect(200)).body;
      expect([me.passwordChangeRequired, me.mfaSetupRequired]).toEqual([true, true]);
      // The password step is open and the second step's routes are not yet.
      await agent.get('/api/auth/password-policy').expect(200);
      expect((await agent.get('/api/auth/mfa').expect(403)).body.code).toBe('password_change_required');
      await agent
        .post('/api/auth/password')
        .send({ currentPassword: person.password, newPassword: CHOSEN })
        .expect(204);
      // With the password chosen, the second step's set-up opens, and nothing else does until it is done.
      await agent.get('/api/auth/mfa').expect(200);
      expect((await agent.get('/api/display').expect(403)).body.code).toBe('mfa_setup_required');
    } finally {
      await owner.tenantSecurity.deleteMany({ where: { tenantId: tenant.id } });
      await cleanup();
    }
  });
});
