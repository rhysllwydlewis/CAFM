import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { scopedUsername, shortUsername } from '@cafm/shared';
import { ownerDb, signIn, startApp } from './helpers';
import { temporaryPassword } from '../src/modules/admin/username-accounts.controller';

const owner = ownerDb();
let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  const accounts = await owner.account.findMany({
    where: { username: { endsWith: '@demo-estates' }, isDemo: false },
    select: { id: true },
  });
  const ids = accounts.map((a) => a.id);
  await owner.session.deleteMany({ where: { accountId: { in: ids } } });
  await owner.membership.deleteMany({ where: { accountId: { in: ids } } });
  await owner.account.deleteMany({ where: { id: { in: ids } } });
  await app.close();
  await owner.$disconnect();
});

const unique = () => `rd${Math.random().toString(36).slice(2, 8)}`;

describe('username helpers', () => {
  it('stores a username with its organisation and shows the short form', () => {
    expect(scopedUsername('RDavies', 'Demo-Estates')).toBe('rdavies@demo-estates');
    expect(shortUsername('rdavies@demo-estates')).toBe('rdavies');
    expect(shortUsername(null)).toBeNull();
  });
  it('generates passwords that meet the policy', () => {
    for (const min of [12, 20]) expect(temporaryPassword(min).length).toBeGreaterThanOrEqual(min);
  });
});

describe('username-only accounts', () => {
  it('needs a session', async () => {
    await request(app.getHttpServer()).post('/api/admin/username-accounts').send({}).expect(401);
    await request(app.getHttpServer())
      .post('/api/admin/username-accounts/00000000-0000-4000-8000-000000000000/reset-password')
      .send({})
      .expect(401);
  });

  it('is refused to someone without people.manage', async () => {
    const { agent } = await signIn(app, 'requester@demo.example');
    await agent
      .post('/api/admin/username-accounts')
      .send({ name: 'A', username: unique(), role: 'technician' })
      .expect(403);
  });

  it('creates an account that signs in with the organisation address only, and an admin can reset it', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const username = unique();
    const made = (
      await agent
        .post('/api/admin/username-accounts')
        .send({ name: 'Rhian Test', username, role: 'technician' })
        .expect(201)
    ).body;
    expect(made.signInPath).toBe('/t/demo-estates/login');
    expect(made.temporaryPassword.length).toBeGreaterThanOrEqual(16);

    // A duplicate in the same organisation is refused.
    await agent.post('/api/admin/username-accounts').send({ name: 'Again', username, role: 'technician' }).expect(409);

    // Signing in on the organisation page works; on the general page the short name does not.
    const ok = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: made.temporaryPassword, organisation: 'demo-estates' })
      .expect(200);
    expect(ok.body.status).toBe('signed_in');
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: made.temporaryPassword })
      .expect(401);
    // Another organisation's page does not find it.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: made.temporaryPassword, organisation: 'starter-demo' })
      .expect(401);

    const reset = (
      await agent.post(`/api/admin/username-accounts/${made.membershipId}/reset-password`).send({}).expect(200)
    ).body;
    expect(reset.temporaryPassword).not.toBe(made.temporaryPassword);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: made.temporaryPassword, organisation: 'demo-estates' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: username, password: reset.temporaryPassword, organisation: 'demo-estates' })
      .expect(200);

    const users = (await agent.get('/api/admin/users').expect(200)).body as { username: string | null; name: string }[];
    expect(users.some((u) => u.username === username)).toBe(true);
  });

  it('cross-tenant: another organisation cannot reset the password', async () => {
    const demo = await signIn(app, 'superuser@demo.example');
    const made = (
      await demo.agent
        .post('/api/admin/username-accounts')
        .send({ name: 'Other', username: unique(), role: 'technician' })
        .expect(201)
    ).body;
    const starter = await signIn(app, 'starter@demo.example');
    await starter.agent.post(`/api/admin/username-accounts/${made.membershipId}/reset-password`).send({}).expect(404);
  });

  it('will not reset the password of someone who has an email address', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const users = (await agent.get('/api/admin/users').expect(200)).body as {
      membershipId: string;
      email: string | null;
    }[];
    const withEmail = users.find((u) => u.email && u.email !== 'superuser@demo.example')!;
    await agent.post(`/api/admin/username-accounts/${withEmail.membershipId}/reset-password`).send({}).expect(409);
  });
});
