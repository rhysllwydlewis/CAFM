import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { type PrismaClient, seedId, withTenant } from '@cafm/db';
import { DEMO_PASSWORD } from '@cafm/shared';
import { createApp } from '../src/app';

export { seedId };
export const DEMO_TENANT = seedId('tenant:demo-estates');
export const STARTER_TENANT = seedId('tenant:starter-demo');

export async function startApp(): Promise<NestExpressApplication> {
  const app = await createApp();
  await app.init();
  return app;
}

/** Signs in and returns a supertest agent carrying the session cookie. */
export async function signIn(app: NestExpressApplication, identifier: string, password = DEMO_PASSWORD) {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/auth/login').send({ identifier, password });
  if (res.status !== 200) throw new Error(`Sign-in failed for ${identifier}: ${res.status}`);
  return { agent, res };
}

/** Creates a throwaway (non-demo) account with memberships, as the app role. */
export async function createTestAccount(db: PrismaClient, tenants: string[], password = 'Correct-Horse-9') {
  const email = `test-${randomUUID()}@test.example`;
  const account = await db.account.create({
    data: { email, name: 'Test Person', passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
  });
  const memberships: string[] = [];
  for (const tenantId of tenants) {
    const m = await withTenant(db, tenantId, (tx) =>
      tx.membership.create({ data: { tenantId, accountId: account.id, role: 'requester', licence: 'requester' } }),
    );
    memberships.push(m.id);
  }
  const cleanup = async () => {
    for (const tenantId of tenants) {
      await withTenant(db, tenantId, (tx) => tx.membership.deleteMany({ where: { accountId: account.id } }));
    }
    await db.account.delete({ where: { id: account.id } });
  };
  return { email, password, account, memberships, cleanup };
}
