import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import request from 'supertest';
import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, seedId, withTenant } from '@cafm/db';
import { BUILTIN_ROLES, DEMO_PASSWORD } from '@cafm/shared';
import { createApp } from '../src/app';

export { seedId };
export const DEMO_TENANT = seedId('tenant:demo-estates');
export const STARTER_TENANT = seedId('tenant:starter-demo');

export async function startApp(rootModule?: Type<unknown>): Promise<NestExpressApplication> {
  const app = await createApp(rootModule);
  await app.init();
  return app;
}

/**
 * A fresh password that passes the rules, generated per run so no
 * password-like literals live in the repository (secret scanners flag them).
 */
export function testPassword(): string {
  return `Pw-${randomUUID()}`;
}

/** The session token from a response's Set-Cookie header. */
export function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const header = ([] as string[]).concat((res.headers['set-cookie'] as string[] | string | undefined) ?? []);
  const cookie = header.find((c) => c.startsWith('cafm_session='));
  if (!cookie) throw new Error('No session cookie set');
  return cookie.split(';')[0]!;
}

/**
 * Owner connection, for test clean-up only: audit events are append-only for
 * the app role, so a throwaway tenant can only be removed as the owner.
 */
export function ownerDb(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL (owner) is required for test clean-up');
  return new PrismaClient({ datasourceUrl: url });
}

/** Creates a throwaway tenant with the built-in roles, as the app role. */
export async function createTestTenant(db: PrismaClient, plan = 'starter') {
  const tenant = await db.tenant.create({ data: { slug: `test-${randomUUID()}`, name: 'Test Tenant Ltd', plan } });
  await withTenant(db, tenant.id, async (tx) => {
    for (const r of BUILTIN_ROLES) {
      await tx.role.create({
        data: {
          tenantId: tenant.id,
          key: r.key,
          name: r.name,
          permissions: [...r.permissions],
          scope: r.scope,
          builtin: true,
        },
      });
    }
  });
  const cleanup = async () => {
    const owner = ownerDb();
    try {
      const where = { tenantId: tenant.id };
      await owner.session.deleteMany({ where });
      await owner.auditEvent.deleteMany({ where });
      await owner.outboxMessage.deleteMany({ where });
      await owner.tenantEntitlement.deleteMany({ where });
      await owner.invite.deleteMany({ where });
      await owner.configVersion.deleteMany({ where });
      await owner.fieldDefinition.deleteMany({ where });
      await owner.numberSequence.deleteMany({ where });
      await owner.capturedEmail.deleteMany({ where });
      await owner.notification.deleteMany({ where });
      await owner.notificationTemplate.deleteMany({ where });
      await owner.pushSubscription.deleteMany({ where });
      await owner.labourRate.deleteMany({ where });
      await owner.workOrder.deleteMany({ where });
      await owner.checklistTemplate.deleteMany({ where });
      await owner.ppmSchedule.deleteMany({ where });
      await owner.ppmTaskTemplate.deleteMany({ where });
      await owner.serviceRequest.deleteMany({ where });
      await owner.requestMailbox.deleteMany({ where });
      await owner.requestPriority.deleteMany({ where });
      await owner.requestType.deleteMany({ where });
      await owner.asset.deleteMany({ where });
      await owner.assetClass.deleteMany({ where });
      await owner.location.deleteMany({ where });
      await owner.team.deleteMany({ where });
      const accounts = (await owner.membership.findMany({ where, select: { accountId: true } })).map(
        (m) => m.accountId,
      );
      await owner.membership.deleteMany({ where });
      await owner.role.deleteMany({ where });
      await owner.authEvent.deleteMany({ where: { accountId: { in: accounts } } });
      await owner.session.deleteMany({ where: { accountId: { in: accounts } } });
      await owner.account.deleteMany({ where: { id: { in: accounts }, isDemo: false } });
      await owner.tenant.delete({ where: { id: tenant.id } });
    } finally {
      await owner.$disconnect();
    }
  };
  return { tenant, cleanup };
}

/** Signs in and returns a supertest agent carrying the session cookie. */
export async function signIn(app: NestExpressApplication, identifier: string, password = DEMO_PASSWORD) {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/auth/login').send({ identifier, password });
  if (res.status !== 200) throw new Error(`Sign-in failed for ${identifier}: ${res.status}`);
  return { agent, res };
}

/** Creates a throwaway (non-demo) account with memberships, as the app role. */
export async function createTestAccount(
  db: PrismaClient,
  tenants: string[],
  password = testPassword(),
  role = 'requester',
) {
  const email = `test-${randomUUID()}@test.example`;
  const account = await db.account.create({
    data: { email, name: 'Test Person', passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
  });
  const memberships: string[] = [];
  for (const tenantId of tenants) {
    const m = await withTenant(db, tenantId, (tx) =>
      tx.membership.create({
        data: { tenantId, accountId: account.id, role, licence: role === 'requester' ? 'requester' : 'full' },
      }),
    );
    memberships.push(m.id);
  }
  const cleanup = async () => {
    await db.session.deleteMany({ where: { accountId: account.id } });
    await db.authEvent.deleteMany({ where: { accountId: account.id } });
    for (const tenantId of tenants) {
      await withTenant(db, tenantId, (tx) => tx.membership.deleteMany({ where: { accountId: account.id } }));
    }
    await db.account.delete({ where: { id: account.id } });
  };
  return { email, password, account, memberships, cleanup };
}
