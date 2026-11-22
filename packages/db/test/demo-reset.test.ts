/** Nightly demo reset, on a throwaway demo tenant so the shared demo personas are untouched. */
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { resetDemo, seedRoles } from '../src/index';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (owner) is required for the demo reset tests');
const db = new PrismaClient({ datasourceUrl: url });
afterAll(() => db.$disconnect());

describe('demo reset', () => {
  it('removes what visitors added and restores the built-in roles', async () => {
    const tenant = await db.tenant.create({
      data: { slug: `reset-test-${Date.now()}`, name: 'Reset Test', plan: 'starter', demo: true },
    });
    try {
      await seedRoles(db, tenant.id);
      const visitor = await db.account.create({
        data: { email: `visitor-${Date.now()}@test.example`, name: 'Visitor', passwordHash: 'x' },
      });
      const member = await db.membership.create({
        data: { tenantId: tenant.id, accountId: visitor.id, role: 'helpdesk', licence: 'full' },
      });
      const site = await db.location.create({
        data: { tenantId: tenant.id, name: 'Site', kind: 'site', code: 'SITE' },
      });
      const floor = await db.location.create({
        data: { tenantId: tenant.id, name: 'Floor', kind: 'floor', code: 'FLOOR', parentId: site.id },
      });
      await db.locationPath.create({ data: { tenantId: tenant.id, ancestorId: site.id, descendantId: floor.id } });
      await db.membershipSite.create({ data: { tenantId: tenant.id, membershipId: member.id, locationId: site.id } });
      const assetClass = await db.assetClass.create({
        data: { tenantId: tenant.id, scheme: 'custom', code: 'X', name: 'Class', group: 'Group' },
      });
      const parentAsset = await db.asset.create({
        data: { tenantId: tenant.id, locationId: floor.id, classId: assetClass.id, number: 'AST-1', name: 'System' },
      });
      await db.asset.create({
        data: { tenantId: tenant.id, locationId: floor.id, parentId: parentAsset.id, number: 'AST-2', name: 'Part' },
      });
      await db.role.create({ data: { tenantId: tenant.id, key: 'custom_x', name: 'X', permissions: [] } });
      await db.role.update({
        where: { tenantId_key: { tenantId: tenant.id, key: 'helpdesk' } },
        data: { permissions: [] },
      });
      await db.invite.create({
        data: {
          tenantId: tenant.id,
          email: 'a@test.example',
          role: 'requester',
          licence: 'requester',
          tokenHash: `h-${Date.now()}`,
          expiresAt: new Date(),
        },
      });
      await db.auditEvent.create({ data: { tenantId: tenant.id, action: 'x', entityType: 'x' } });
      await db.checklistTemplate.create({
        data: {
          tenantId: tenant.id,
          name: 'Visitor checklist',
          items: [{ label: 'Step', kind: 'tick', required: false }],
        },
      });

      const result = await resetDemo(db, { tenantIds: [tenant.id], reseed: false });

      expect(result).toEqual({ tenants: 1, removedAccounts: 1 });
      expect(await db.account.findUnique({ where: { id: visitor.id } })).toBeNull();
      expect(await db.role.count({ where: { tenantId: tenant.id, builtin: false } })).toBe(0);
      expect(
        (await db.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId: tenant.id, key: 'helpdesk' } } }))
          .permissions,
      ).toContain('people.read');
      expect(await db.invite.count({ where: { tenantId: tenant.id } })).toBe(0);
      expect(await db.checklistTemplate.count({ where: { tenantId: tenant.id } })).toBe(0);
      expect(await db.auditEvent.count({ where: { tenantId: tenant.id } })).toBe(0);
      expect(await db.asset.count({ where: { tenantId: tenant.id } })).toBe(0);
      expect(await db.assetClass.count({ where: { tenantId: tenant.id } })).toBe(0);
      expect(await db.location.count({ where: { tenantId: tenant.id } })).toBe(0);
      expect(await db.locationPath.count({ where: { tenantId: tenant.id } })).toBe(0);
      expect(await db.membershipSite.count({ where: { tenantId: tenant.id } })).toBe(0);
    } finally {
      await db.asset.deleteMany({ where: { tenantId: tenant.id } });
      await db.assetClass.deleteMany({ where: { tenantId: tenant.id } });
      await db.location.deleteMany({ where: { tenantId: tenant.id } });
      await db.role.deleteMany({ where: { tenantId: tenant.id } });
      await db.tenant.delete({ where: { id: tenant.id } });
    }
  });

  it('never touches a tenant that isn’t a demo', async () => {
    const tenant = await db.tenant.create({
      data: { slug: `real-${Date.now()}`, name: 'Real Customer', plan: 'starter' },
    });
    try {
      await db.auditEvent.create({ data: { tenantId: tenant.id, action: 'x', entityType: 'x' } });
      expect(await resetDemo(db, { tenantIds: [tenant.id], reseed: false })).toEqual({
        tenants: 0,
        removedAccounts: 0,
      });
      expect(await db.auditEvent.count({ where: { tenantId: tenant.id } })).toBe(1);
    } finally {
      await db.auditEvent.deleteMany({ where: { tenantId: tenant.id } });
      await db.tenant.delete({ where: { id: tenant.id } });
    }
  });
});
