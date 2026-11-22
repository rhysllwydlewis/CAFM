import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { PrismaClient } from '@cafm/db';
import { notifyExpiringWarranties } from '../src/jobs/warranty-alerts';

const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

afterAll(async () => {
  await owner.$disconnect();
  await db.$disconnect();
});

it('sends one notice per eligible membership and expiry, using the UK date and branch scope', async () => {
  const tenant = await owner.tenant.create({
    data: { slug: 'warranty-test-' + randomUUID(), name: 'Warranty test', plan: 'starter' },
  });
  const where = { tenantId: tenant.id };
  const accountIds: string[] = [];
  try {
    await owner.role.createMany({
      data: [
        { ...where, key: 'fm_manager', name: 'Manager', permissions: ['assets.read', 'assets.manage'], scope: 'all' },
        { ...where, key: 'tech', name: 'Reader', permissions: ['assets.read'], scope: 'all' },
      ],
    });
    async function member(role: string, locationScoped: boolean, status = 'active') {
      const account = await owner.account.create({
        data: { name: 'Member', email: randomUUID() + '@test.example', passwordHash: 'fixture' },
      });
      accountIds.push(account.id);
      return owner.membership.create({
        data: { ...where, role, locationScoped, status, licence: 'full', accountId: account.id },
      });
    }
    const manager = await member('fm_manager', false);
    const inBranch = await member('fm_manager', true);
    const elsewhere = await member('fm_manager', true);
    await member('fm_manager', false, 'inactive');
    await member('tech', false);
    const site = await owner.location.create({ data: { ...where, name: 'Main site', code: 'M', kind: 'site' } });
    const plant = await owner.location.create({
      data: { ...where, name: 'Plant', code: 'P', kind: 'space', parentId: site.id },
    });
    const other = await owner.location.create({ data: { ...where, name: 'Other site', code: 'O', kind: 'site' } });
    await owner.locationPath.createMany({
      data: [
        { ...where, ancestorId: site.id, descendantId: site.id },
        { ...where, ancestorId: plant.id, descendantId: plant.id },
        { ...where, ancestorId: site.id, descendantId: plant.id },
        { ...where, ancestorId: other.id, descendantId: other.id },
      ],
    });
    await owner.membershipSite.createMany({
      data: [
        { ...where, locationId: site.id, membershipId: inBranch.id },
        { ...where, locationId: other.id, membershipId: elsewhere.id },
      ],
    });
    const asset = await owner.asset.create({
      data: { ...where, name: 'Pump', number: 'AST-00001', locationId: plant.id },
    });
    const base = {
      ...where,
      assetId: asset.id,
      provider: 'Pump Co',
      reference: 'WARRANTY-PUMP',
      startsOn: new Date('2026-01-01Z'),
      expiresOn: new Date('2026-06-05Z'),
      noticeDays: 4,
    };
    const due = await owner.assetWarranty.create({ data: base });
    await owner.assetWarranty.createMany({
      data: [
        { ...base, reference: 'NOT-YET', noticeDays: 3 },
        { ...base, reference: 'EXPIRED', expiresOn: new Date('2026-05-30Z') },
        { ...base, reference: 'ARCHIVED', active: false },
      ],
    });
    await notifyExpiringWarranties(db, tenant.id, new Date('2026-05-31T22:59:00Z'));
    expect(await owner.notification.count({ where })).toBe(0);
    const now = new Date('2026-05-31T23:01:00Z');
    await Promise.all([notifyExpiringWarranties(db, tenant.id, now), notifyExpiringWarranties(db, tenant.id, now)]);
    const notices = await owner.notification.findMany({ where });
    expect(notices.map(({ recipientId }) => recipientId).sort()).toEqual([manager.id, inBranch.id].sort());
    expect(notices.every((row) => row.assetId === asset.id && row.body.includes('5 June 2026'))).toBe(true);
    expect(await owner.outboxMessage.count({ where })).toBe(2);
    await owner.assetWarranty.update({
      where: { id: due.id },
      data: { expiresOn: new Date('2026-06-06Z'), noticeDays: 5 },
    });
    await notifyExpiringWarranties(db, tenant.id, now);
    expect(await owner.notification.count({ where })).toBe(4);
  } finally {
    await owner.outboxMessage.deleteMany({ where });
    await owner.notification.deleteMany({ where });
    await owner.asset.deleteMany({ where });
    await owner.location.deleteMany({ where });
    await owner.membership.deleteMany({ where });
    await owner.role.deleteMany({ where });
    await owner.account.deleteMany({ where: { id: { in: accountIds } } });
    await owner.tenant.delete({ where: { id: tenant.id } });
  }
});
