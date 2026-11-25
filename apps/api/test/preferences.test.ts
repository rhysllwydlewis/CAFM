import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { createTestAccount, createTestTenant, DEMO_TENANT, ownerDb, signIn, startApp } from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const owner = ownerDb();

let app: NestExpressApplication;
const cleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await app.close();
  await db.$disconnect();
  await owner.$disconnect();
});

/** A throwaway person in the demo organisation, so no demo account is changed. */
async function newPerson(tenants: string[] = [DEMO_TENANT]) {
  const person = await createTestAccount(db, tenants);
  cleanups.push(person.cleanup);
  return person;
}

async function stored(accountId: string): Promise<unknown> {
  return (await owner.account.findUniqueOrThrow({ where: { id: accountId } })).preferences;
}

describe('saving a person’s own display choices', () => {
  it('needs a session', async () => {
    const server = (await import('supertest')).default(app.getHttpServer());
    await server.patch('/api/auth/preferences').send({ navCollapsed: true }).expect(401);
  });

  it('starts empty, saves a choice, and shows it on a fresh sign-in from another browser', async () => {
    const person = await newPerson();
    const { agent } = await signIn(app, person.email, person.password);
    expect((await agent.get('/api/auth/me').expect(200)).body.preferences).toEqual({});

    const saved = await agent.patch('/api/auth/preferences').send({ navCollapsed: true }).expect(200);
    expect(saved.body).toEqual({ navCollapsed: true });
    expect((await agent.get('/api/auth/me').expect(200)).body.preferences).toEqual({ navCollapsed: true });

    // Another browser: a new session for the same account sees the same choice.
    const other = await signIn(app, person.email, person.password);
    expect((await other.agent.get('/api/auth/me').expect(200)).body.preferences).toEqual({ navCollapsed: true });

    await agent.patch('/api/auth/preferences').send({ navCollapsed: false }).expect(200);
    expect((await other.agent.get('/api/auth/me').expect(200)).body.preferences).toEqual({ navCollapsed: false });
  });

  it('refuses anything that is not a known choice with a valid value', async () => {
    const person = await newPerson();
    const { agent } = await signIn(app, person.email, person.password);
    await agent.patch('/api/auth/preferences').send({}).expect(400);
    await agent.patch('/api/auth/preferences').send({ navCollapsed: 'yes' }).expect(400);
    await agent.patch('/api/auth/preferences').send({ navCollapsed: true, isAdmin: true }).expect(400);
    await agent.patch('/api/auth/preferences').send([]).expect(400);
    expect(await stored(person.account.id)).toEqual({});
  });

  it('changes only the signed-in person: nobody else in the organisation, and nobody in another organisation', async () => {
    const { tenant, cleanup } = await createTestTenant(db);
    cleanups.push(cleanup);
    const me = await newPerson();
    const colleague = await newPerson();
    const elsewhere = await newPerson([tenant.id]);

    const { agent } = await signIn(app, me.email, me.password);
    await agent.patch('/api/auth/preferences').send({ navCollapsed: true }).expect(200);

    expect(await stored(me.account.id)).toEqual({ navCollapsed: true });
    expect(await stored(colleague.account.id)).toEqual({});
    expect(await stored(elsewhere.account.id)).toEqual({});

    // The other organisation's person still sees their own empty choices.
    const them = await signIn(app, elsewhere.email, elsewhere.password);
    expect((await them.agent.get('/api/auth/me').expect(200)).body.preferences).toEqual({});
  });

  it('ignores a stored value it does not understand instead of trusting it', async () => {
    const person = await newPerson();
    await owner.account.update({
      where: { id: person.account.id },
      data: { preferences: { navCollapsed: 'yes', somethingElse: 1 } },
    });
    const { agent } = await signIn(app, person.email, person.password);
    expect((await agent.get('/api/auth/me').expect(200)).body.preferences).toEqual({});

    // A later valid save replaces the bad value, and the unknown key still never reaches the page.
    await agent.patch('/api/auth/preferences').send({ navCollapsed: true }).expect(200);
    expect((await agent.get('/api/auth/me').expect(200)).body.preferences).toEqual({ navCollapsed: true });
  });

  describe('the shared demo personas', () => {
    /** A throwaway account that counts as a demo persona, with a choice already stored on it. */
    async function demoPerson() {
      const person = await newPerson();
      await owner.account.update({
        where: { id: person.account.id },
        data: { isDemo: true, preferences: { navCollapsed: true } },
      });
      return person;
    }
    const withDemoMode = async (value: string | undefined, run: () => Promise<void>) => {
      const original = process.env.DEMO_MODE;
      if (value === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = value;
      try {
        await run();
      } finally {
        if (original === undefined) delete process.env.DEMO_MODE;
        else process.env.DEMO_MODE = original;
      }
    };

    it('save nothing, and show nothing that was stored, so visitors never hand choices on', async () => {
      const person = await demoPerson();
      await withDemoMode('true', async () => {
        const { agent } = await signIn(app, person.email, person.password);
        expect((await agent.get('/api/auth/me').expect(200)).body.preferences).toEqual({});
        const refused = await agent.patch('/api/auth/preferences').send({ navCollapsed: false }).expect(403);
        expect(refused.body.code).toBe('demo_locked');
        // Not changed either: the stored value is left exactly as it was.
        expect(await stored(person.account.id)).toEqual({ navCollapsed: true });
      });
    });

    it('are ordinary accounts when the demo mode is off', async () => {
      const person = await demoPerson();
      await withDemoMode('false', async () => {
        const { agent } = await signIn(app, person.email, person.password);
        expect((await agent.get('/api/auth/me').expect(200)).body.preferences).toEqual({ navCollapsed: true });
        await agent.patch('/api/auth/preferences').send({ navCollapsed: false }).expect(200);
        expect(await stored(person.account.id)).toEqual({ navCollapsed: false });
      });
    });

    it('do not stop a real person in the demo organisation saving theirs', async () => {
      const person = await newPerson();
      await withDemoMode('true', async () => {
        const { agent } = await signIn(app, person.email, person.password);
        await agent.patch('/api/auth/preferences').send({ navCollapsed: true }).expect(200);
        expect((await agent.get('/api/auth/me').expect(200)).body.preferences).toEqual({ navCollapsed: true });
      });
    });
  });

  it('is refused while viewing as someone else, so their choices are not changed', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const tom = await withTenant(db, DEMO_TENANT, (tx) =>
      tx.membership.findFirstOrThrow({
        where: { tenantId: DEMO_TENANT, account: { email: 'technician@demo.example' } },
        include: { account: true },
      }),
    );
    const before = await stored(tom.accountId);
    await agent
      .post('/api/admin/impersonation')
      .send({ membershipId: tom.id, reason: 'Checking the side menu choice is read-only' })
      .expect(200);
    try {
      const refused = await agent.patch('/api/auth/preferences').send({ navCollapsed: true }).expect(403);
      expect(refused.body.code).toBe('impersonation_read_only');
      expect(await stored(tom.accountId)).toEqual(before);
    } finally {
      await agent.post('/api/admin/impersonation/end').send({}).expect(200);
    }
  });
});
