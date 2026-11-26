/** Platform tenant operations (CLI). Run as the owner role, like the CLI. */
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createTenant, listTenants, setTenantPlan, setTenantStatus } from '../src';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (owner) is required for the tenant CLI tests');
const db = new PrismaClient({ datasourceUrl: url });
const slug = `cli-test-${Date.now()}`;

afterAll(async () => {
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (tenant) {
    const where = { tenantId: tenant.id };
    await db.session.deleteMany({ where });
    await db.auditEvent.deleteMany({ where });
    await db.outboxMessage.deleteMany({ where });
    await db.invite.deleteMany({ where });
    await db.role.deleteMany({ where });
    await db.tenant.delete({ where: { id: tenant.id } });
  }
  await db.$disconnect();
});

describe('tenant CLI operations', () => {
  it('creates a tenant with the built-in roles and a Super User invite', async () => {
    const { tenantId, inviteUrl } = await createTenant(db, {
      name: 'CLI Test Trust',
      slug,
      plan: 'professional',
      adminEmail: 'Head@CLI-test.example',
      appUrl: 'https://fmstead.example/',
    });
    expect(inviteUrl).toMatch(/^https:\/\/fmstead\.example\/accept-invite\/[A-Za-z0-9_-]+$/);
    expect(await db.role.count({ where: { tenantId } })).toBe(15);
    expect(await db.invite.findFirst({ where: { tenantId } })).toMatchObject({
      email: 'head@cli-test.example',
      role: 'super_user',
    });
    expect(await db.outboxMessage.count({ where: { tenantId, topic: 'email.send' } })).toBe(1);
    expect((await listTenants(db)).find((t) => t.slug === slug)).toMatchObject({
      plan: 'professional',
      status: 'active',
    });
  });

  it('changes the plan and records it', async () => {
    await setTenantPlan(db, slug, 'enterprise');
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug } });
    expect(tenant.plan).toBe('enterprise');
    expect(await db.auditEvent.count({ where: { tenantId: tenant.id, action: 'tenant.plan_changed' } })).toBe(1);
    await expect(setTenantPlan(db, slug, 'platinum')).rejects.toThrow(/Plan must be one of/);
  });

  it('suspends and reactivates', async () => {
    await setTenantStatus(db, slug, 'suspended');
    expect((await db.tenant.findUniqueOrThrow({ where: { slug } })).status).toBe('suspended');
    await setTenantStatus(db, slug, 'active');
    expect((await db.tenant.findUniqueOrThrow({ where: { slug } })).status).toBe('active');
  });

  it('rejects a bad slug', async () => {
    await expect(
      createTenant(db, { name: 'X', slug: 'Bad Slug', plan: 'free', adminEmail: 'a@b.example', appUrl: 'x' }),
    ).rejects.toThrow(/Slug/);
  });
});
