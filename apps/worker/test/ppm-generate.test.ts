import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { PrismaClient, withTenant } from '@cafm/db';
import { addDays } from '@cafm/shared';
import { generatePpmForTenant } from '../src/jobs/ppm-generate';

const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
afterAll(async () => {
  await owner.$disconnect();
  await db.$disconnect();
});

/** An organisation with one pump on a monthly schedule starting soon. */
async function organisation(plan: string) {
  const tenant = await owner.tenant.create({
    data: { slug: `ppm-${randomUUID()}`, name: 'PPM Test Ltd', plan },
  });
  const location = await owner.location.create({
    data: { tenantId: tenant.id, code: 'MAIN', name: 'Main site', kind: 'site' },
  });
  await owner.locationPath.create({
    data: { tenantId: tenant.id, ancestorId: location.id, descendantId: location.id },
  });
  const asset = await owner.asset.create({
    data: { tenantId: tenant.id, locationId: location.id, number: 'AST-1', name: 'Pump 1' },
  });
  const startsOn = new Date(addDays(new Date().toISOString().slice(0, 10), 7) + 'T00:00:00Z');
  const schedule = await owner.ppmSchedule.create({
    data: {
      tenantId: tenant.id,
      number: 'PPM-0001',
      title: 'Pump service',
      freqType: 'calendar',
      calendarUnit: 'month',
      interval: 1,
      startsOn,
      durationMinutes: 60,
    },
  });
  await owner.ppmScheduleAsset.create({
    data: { tenantId: tenant.id, scheduleId: schedule.id, assetId: asset.id, nextDueOn: startsOn },
  });
  const cleanup = async () => {
    const where = { tenantId: tenant.id };
    await owner.auditEvent.deleteMany({ where });
    await owner.workOrder.deleteMany({ where });
    await owner.ppmSchedule.deleteMany({ where });
    await owner.asset.deleteMany({ where });
    await owner.location.deleteMany({ where });
    await owner.numberSequence.deleteMany({ where });
    await owner.tenant.delete({ where: { id: tenant.id } });
  };
  return { tenant, cleanup };
}

const jobs = (tenantId: string) => withTenant(db, tenantId, (tx) => tx.workOrder.count({ where: { type: 'ppm' } }));

it('raises the visits that are due for an organisation with planned maintenance, once, and leaves others alone', async () => {
  const withPpm = await organisation('starter');
  const without = await organisation('free');
  try {
    const now = new Date();
    expect(await generatePpmForTenant(db, withPpm.tenant.id, now)).toMatchObject({ created: 1, skipped: 0 });
    expect(await jobs(withPpm.tenant.id)).toBe(1);
    // The hourly run goes over the same ground, and raises nothing new.
    expect(await generatePpmForTenant(db, withPpm.tenant.id, now)).toMatchObject({ created: 0 });
    expect(await jobs(withPpm.tenant.id)).toBe(1);
    // The Free plan has no planned maintenance, so nothing is raised, whatever is in its tables.
    expect(await generatePpmForTenant(db, without.tenant.id, now)).toBeNull();
    expect(await jobs(without.tenant.id)).toBe(0);
    // A suspended organisation is skipped.
    await owner.tenant.update({ where: { id: withPpm.tenant.id }, data: { status: 'suspended' } });
    expect(await generatePpmForTenant(db, withPpm.tenant.id, now)).toBeNull();
  } finally {
    await withPpm.cleanup();
    await without.cleanup();
  }
});
