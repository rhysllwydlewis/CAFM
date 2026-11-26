import type { PrismaClient } from '@prisma/client';
import { PLANS } from '@cafm/shared';
import { seedRoles } from './seed';
import { newToken } from './tokens';

/**
 * Platform tenant operations (issue #16). Run as the owner role by the CLI
 * (src/cli.ts), never by the API. Each change is audited with no actor, which
 * marks it as a platform action.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function assertPlan(plan: string): void {
  if (!(PLANS as readonly string[]).includes(plan)) throw new Error(`Plan must be one of: ${PLANS.join(', ')}`);
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  plan: string;
  adminEmail: string;
  demo?: boolean;
  appUrl: string;
}

/** Creates a tenant with the built-in roles and invites its first Super User. Returns the invite link. */
export async function createTenant(
  db: PrismaClient,
  input: CreateTenantInput,
): Promise<{ tenantId: string; inviteUrl: string }> {
  assertPlan(input.plan);
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(input.slug))
    throw new Error('Slug must be lowercase letters, numbers and hyphens');
  const email = input.adminEmail.trim().toLowerCase();
  const { token, tokenHash } = newToken();
  const tenant = await db.tenant.create({
    data: { name: input.name, slug: input.slug, plan: input.plan, demo: input.demo ?? false },
  });
  await seedRoles(db, tenant.id);
  const inviteUrl = `${input.appUrl.replace(/\/$/, '')}/accept-invite/${token}`;
  await db.$transaction([
    db.invite.create({
      data: {
        tenantId: tenant.id,
        email,
        role: 'super_user',
        licence: 'full',
        tokenHash,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    }),
    db.outboxMessage.create({
      data: {
        tenantId: tenant.id,
        topic: 'email.send',
        payload: {
          to: email,
          subject: `Your FM Stead organisation ${input.name} is ready`,
          text: `Hello,\n\n${input.name} has been set up on FM Stead and you are its Super User.\n\nAccept the invitation (the link works for 7 days): ${inviteUrl}`,
          capture: input.demo ?? false,
        },
      },
    }),
    db.auditEvent.create({
      data: {
        tenantId: tenant.id,
        action: 'tenant.created',
        entityType: 'tenant',
        entityId: tenant.id,
        changes: { after: { name: input.name, plan: input.plan, admin: email } },
      },
    }),
  ]);
  return { tenantId: tenant.id, inviteUrl };
}

async function findBySlug(db: PrismaClient, slug: string) {
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`No tenant with slug ${slug}`);
  return tenant;
}

export async function setTenantPlan(db: PrismaClient, slug: string, plan: string): Promise<void> {
  assertPlan(plan);
  const tenant = await findBySlug(db, slug);
  await db.$transaction([
    db.tenant.update({ where: { id: tenant.id }, data: { plan } }),
    db.auditEvent.create({
      data: {
        tenantId: tenant.id,
        action: 'tenant.plan_changed',
        entityType: 'tenant',
        entityId: tenant.id,
        changes: { before: { plan: tenant.plan }, after: { plan } },
      },
    }),
  ]);
}

/** Suspending a tenant stops every session in it straight away (the session guard checks tenant status). */
export async function setTenantStatus(db: PrismaClient, slug: string, status: 'active' | 'suspended'): Promise<void> {
  const tenant = await findBySlug(db, slug);
  await db.$transaction([
    db.tenant.update({ where: { id: tenant.id }, data: { status } }),
    ...(status === 'suspended' ? [db.session.deleteMany({ where: { tenantId: tenant.id } })] : []),
    db.auditEvent.create({
      data: {
        tenantId: tenant.id,
        action: `tenant.${status === 'active' ? 'reactivated' : 'suspended'}`,
        entityType: 'tenant',
        entityId: tenant.id,
      },
    }),
  ]);
}

export async function listTenants(db: PrismaClient) {
  const tenants = await db.tenant.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { memberships: true } } },
  });
  return tenants.map((t) => ({
    slug: t.slug,
    name: t.name,
    plan: t.plan,
    status: t.status,
    demo: t.demo,
    members: t._count.memberships,
  }));
}
