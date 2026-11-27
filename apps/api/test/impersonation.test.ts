import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@fmstead/db';
import { BUILTIN_ROLES } from '@fmstead/shared';
import { newSessionToken, SESSION_COOKIE } from '../src/core/session';
import { createTestAccount, createTestTenant, DEMO_TENANT, ownerDb, signIn, startApp, STARTER_TENANT } from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

const owner = ownerDb();

/** The queued invitation email to an address, as the worker would send it. */
async function inviteToken(to: string): Promise<string> {
  const msg = await owner.outboxMessage.findFirstOrThrow({
    where: { topic: 'email.send', payload: { path: ['to'], equals: to } },
    orderBy: { createdAt: 'desc' },
  });
  const match = (msg.payload as { text: string }).text.match(/\/accept-invite\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error('No invitation link in the email');
  return match[1]!;
}

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
  await owner.$disconnect();
});

async function memberId(email: string, tenantId = DEMO_TENANT): Promise<string> {
  const m = await withTenant(db, tenantId, (tx) =>
    tx.membership.findFirstOrThrow({ where: { tenantId, account: { email } } }),
  );
  return m.id;
}

const requesterPermissions = BUILTIN_ROLES.find((r) => r.key === 'requester')!.permissions;
const reason = 'Checking what the technician sees';

describe('view as user needs a session and the permission', () => {
  it('refuses anonymous callers', async () => {
    const server = (await import('supertest')).default(app.getHttpServer());
    await server.post('/api/admin/impersonation').send({}).expect(401);
    await server.post('/api/admin/impersonation/end').send({}).expect(401);
  });

  it('is only for Super Users: an Administrator and a technician are refused', async () => {
    const tom = await memberId('technician@demo.example');
    for (const email of ['admin@demo.example', 'technician@demo.example']) {
      const { agent } = await signIn(app, email);
      await agent.post('/api/admin/impersonation').send({ membershipId: tom, reason }).expect(403);
    }
  });
});

describe('the organisation setting "Allow view as user"', () => {
  afterEach(async () => {
    await withTenant(db, DEMO_TENANT, (tx) => tx.tenantSecurity.deleteMany({}));
    await withTenant(db, STARTER_TENANT, (tx) => tx.tenantSecurity.deleteMany({}));
  });

  it('is on by default, and refuses a new session with a clear message once it is switched off', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const tom = await memberId('technician@demo.example');
    const security = { passwordMinLength: 12, sessionTimeoutHours: null, mfaRequired: false };
    await agent
      .put('/api/admin/security')
      .send({ ...security, allowViewAsUser: false })
      .expect(200);
    const refused = await agent.post('/api/admin/impersonation').send({ membershipId: tom, reason }).expect(403);
    expect(refused.body.code).toBe('impersonation_disabled');
    expect(refused.body.message).toMatch(/switched off/);
    // Still the Super User, not a viewing session.
    expect((await agent.get('/api/auth/me').expect(200)).body.impersonation).toBeNull();

    await agent
      .put('/api/admin/security')
      .send({ ...security, allowViewAsUser: true })
      .expect(200);
    await agent.post('/api/admin/impersonation').send({ membershipId: tom, reason }).expect(200);
  });

  it('is per organisation: switching it off elsewhere changes nothing here', async () => {
    await withTenant(db, STARTER_TENANT, (tx) =>
      tx.tenantSecurity.create({ data: { tenantId: STARTER_TENANT, allowViewAsUser: false } }),
    );
    const { agent } = await signIn(app, 'superuser@demo.example');
    const tom = await memberId('technician@demo.example');
    await agent.post('/api/admin/impersonation').send({ membershipId: tom, reason }).expect(200);
  });
});

describe('viewing as another person', () => {
  it('starts, is read-only, can not be nested, and ends back as the Super User, all audited', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const tom = await memberId('technician@demo.example');
    await agent.post('/api/admin/impersonation').send({ membershipId: tom, reason }).expect(200);

    const me = (await agent.get('/api/auth/me').expect(200)).body;
    expect(me).toMatchObject({ name: 'Tom Price', impersonation: { by: 'Sam Sutton' } });
    expect(me.permissions).not.toContain('people.impersonate');

    // They see what Tom can see, and nothing more.
    await agent.get('/api/teams').expect(403);
    // Read-only: nothing that could change data goes through.
    const blocked = await agent.post('/api/teams').send({ name: 'Nope' }).expect(403);
    expect(blocked.body.code).toBe('impersonation_read_only');
    await agent.post('/api/admin/impersonation').send({ membershipId: tom, reason }).expect(403);
    await agent.post('/api/auth/select-organisation').send({ membershipId: tom }).expect(403);

    await agent.post('/api/admin/impersonation/end').send({}).expect(200);
    const back = (await agent.get('/api/auth/me').expect(200)).body;
    expect(back).toMatchObject({ name: 'Sam Sutton', impersonation: null });
    // Ending twice is refused: the session is no longer a viewing one.
    await agent.post('/api/admin/impersonation/end').send({}).expect(403);

    const sam = await withTenant(db, DEMO_TENANT, (tx) =>
      tx.membership.findFirstOrThrow({
        where: { tenantId: DEMO_TENANT, account: { email: 'superuser@demo.example' } },
      }),
    );
    const events = await withTenant(db, DEMO_TENANT, (tx) =>
      tx.auditEvent.findMany({
        where: { action: { startsWith: 'impersonation.' }, entityId: tom },
        orderBy: { createdAt: 'desc' },
        take: 2,
      }),
    );
    expect(events.map((e) => e.action).sort()).toEqual(['impersonation.ended', 'impersonation.started']);
    // Both events name the Super User, not Tom, as the person acting.
    expect(events.every((e) => e.actorMembershipId === sam.id && e.actorAccountId === sam.accountId)).toBe(true);
    const started = events.find((e) => e.action === 'impersonation.started')!;
    expect(started.changes).toMatchObject({ target: 'Tom Price', reason });
  });

  it('is signed out, not restored, if the Super User has lost the permission by the time it ends', async () => {
    const tenant = await createTestTenant(db);
    const owner = await createTestAccount(db, [tenant.tenant.id], undefined, 'administrator');
    try {
      await withTenant(db, tenant.tenant.id, async (tx) => {
        await tx.role.update({
          where: { tenantId_key: { tenantId: tenant.tenant.id, key: 'administrator' } },
          data: { permissions: ['people.impersonate', ...requesterPermissions] },
        });
      });
      const target = await createTestAccount(db, [tenant.tenant.id], undefined, 'requester');
      try {
        const { agent } = await signIn(app, owner.email, owner.password);
        await agent.post('/api/admin/impersonation').send({ membershipId: target.memberships[0], reason }).expect(200);
        await withTenant(db, tenant.tenant.id, (tx) =>
          tx.role.update({
            where: { tenantId_key: { tenantId: tenant.tenant.id, key: 'administrator' } },
            data: { permissions: ['people.read'] },
          }),
        );
        await agent.post('/api/admin/impersonation/end').send({}).expect(401);
        await agent.get('/api/auth/me').expect(401);
      } finally {
        await target.cleanup();
      }
    } finally {
      await owner.cleanup();
      await tenant.cleanup();
    }
  });

  it('refuses yourself, a Super User and a missing reason', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const sam = await memberId('superuser@demo.example');
    await agent.post('/api/admin/impersonation').send({ membershipId: sam, reason }).expect(403);
    const alex = await memberId('admin@demo.example');
    await agent.post('/api/admin/impersonation').send({ membershipId: alex, reason: '  ' }).expect(400);
    await agent.post('/api/admin/impersonation').send({ membershipId: 'nope', reason }).expect(400);
  });

  it('can not be used to reach someone in another organisation', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const other = await withTenant(db, STARTER_TENANT, (tx) =>
      tx.membership.findFirstOrThrow({ where: { tenantId: STARTER_TENANT, status: 'active' } }),
    );
    await agent.post('/api/admin/impersonation').send({ membershipId: other.id, reason }).expect(404);
  });

  it('can not see more than you could yourself', async () => {
    const tenant = await createTestTenant(db);
    const owner = await createTestAccount(db, [tenant.tenant.id], undefined, 'administrator');
    const target = await createTestAccount(db, [tenant.tenant.id], undefined, 'fm_manager');
    try {
      await withTenant(db, tenant.tenant.id, (tx) =>
        tx.role.update({
          where: { tenantId_key: { tenantId: tenant.tenant.id, key: 'administrator' } },
          data: { permissions: ['people.impersonate'] },
        }),
      );
      const { agent } = await signIn(app, owner.email, owner.password);
      const res = await agent
        .post('/api/admin/impersonation')
        .send({ membershipId: target.memberships[0], reason })
        .expect(403);
      expect(res.body.code).toBe('impersonation_denied');
    } finally {
      await target.cleanup();
      await owner.cleanup();
      await tenant.cleanup();
    }
  });
});

describe('a viewing session ends when the real person loses access or is not proof of identity', () => {
  it('stops working at once when the Super User is deactivated or loses the permission', async () => {
    const tenant = await createTestTenant(db);
    const owner = await createTestAccount(db, [tenant.tenant.id], undefined, 'administrator');
    const target = await createTestAccount(db, [tenant.tenant.id], undefined, 'requester');
    try {
      await withTenant(db, tenant.tenant.id, (tx) =>
        tx.role.update({
          where: { tenantId_key: { tenantId: tenant.tenant.id, key: 'administrator' } },
          data: { permissions: ['people.impersonate', ...requesterPermissions] },
        }),
      );
      const { agent } = await signIn(app, owner.email, owner.password);
      await agent.post('/api/admin/impersonation').send({ membershipId: target.memberships[0], reason }).expect(200);
      await agent.get('/api/auth/me').expect(200);
      await withTenant(db, tenant.tenant.id, (tx) =>
        tx.membership.update({ where: { id: owner.memberships[0] }, data: { status: 'deactivated' } }),
      );
      await agent.get('/api/auth/me').expect(401);
    } finally {
      await target.cleanup();
      await owner.cleanup();
      await tenant.cleanup();
    }
  });

  it('does not count as signing in to accept an invitation', async () => {
    const tenant = await createTestTenant(db);
    const boss = await createTestAccount(db, [tenant.tenant.id], undefined, 'super_user');
    const other = await createTestAccount(db, [DEMO_TENANT]);
    try {
      const { agent } = await signIn(app, boss.email, boss.password);
      await agent.post('/api/people/invites').send({ email: other.email, role: 'requester' }).expect(201);
      const token = await inviteToken(other.email);
      // A viewing session as the invited person, as the impersonation endpoint would create it.
      const session = newSessionToken();
      await db.session.create({
        data: {
          tokenHash: session.tokenHash,
          accountId: other.account.id,
          expiresAt: new Date(Date.now() + 60_000),
          impersonatorAccountId: boss.account.id,
          impersonatorMembershipId: boss.memberships[0],
        },
      });
      const server = (await import('supertest')).default(app.getHttpServer());
      await server
        .post(`/api/auth/invites/${token}/accept`)
        .set('Cookie', `${SESSION_COOKIE}=${session.token}`)
        .send({ acceptTerms: true })
        .expect(401);
    } finally {
      await other.cleanup().catch(() => undefined);
      await boss.cleanup();
      await tenant.cleanup();
    }
  });
});
