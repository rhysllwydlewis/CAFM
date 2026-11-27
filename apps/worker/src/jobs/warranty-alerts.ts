import type { Queue } from 'bullmq';
import { hasAllLocationAccess, withTenant, type PrismaClient, type Tx } from '@fmstead/db';
import { resolveEntitlements } from '@fmstead/shared';
import { register } from '../handlers';
import type { JobData } from '../index';

const DATE_IN_UK = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const BATCH = 50;

export const WARRANTY_ALERT_SCHEDULE = { pattern: '0 6 * * *', tz: 'Europe/London' };

const plusDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

async function notifyBatch(tx: Tx, tenantId: string, today: Date, after?: string) {
  const candidates = await tx.assetWarranty.findMany({
    where: {
      tenantId,
      active: true,
      startsOn: { lte: today },
      expiresOn: { gte: today, lte: plusDays(today, 365) },
      asset: { status: { not: 'decommissioned' } },
      ...(after && { id: { gt: after } }),
    },
    orderBy: { id: 'asc' },
    take: BATCH,
    include: { asset: { select: { number: true, locationId: true } } },
  });
  const due = candidates.filter((row) => row.expiresOn <= plusDays(today, row.noticeDays));
  if (!due.length) return candidates;

  const roles = await tx.role.findMany({
    where: { tenantId, permissions: { hasEvery: ['assets.manage', 'assets.read'] } },
    select: { key: true, scope: true },
  });
  if (!roles.length) return candidates;
  const scopes = new Map(roles.map(({ key, scope }) => [key, scope]));
  const locationIds = [...new Set(due.map((row) => row.asset.locationId))];
  const [members, ancestors] = await Promise.all([
    tx.membership.findMany({
      where: { tenantId, status: 'active', role: { in: [...scopes.keys()] } },
      select: {
        id: true,
        tenantId: true,
        role: true,
        locationScoped: true,
        account: { select: { email: true } },
        sites: { select: { locationId: true } },
      },
    }),
    tx.locationPath.findMany({
      where: { tenantId, descendantId: { in: locationIds } },
      select: { ancestorId: true, descendantId: true },
    }),
  ]);
  const ancestry = new Map<string, Set<string>>();
  for (const { descendantId, ancestorId } of ancestors) {
    if (!ancestry.has(descendantId)) ancestry.set(descendantId, new Set());
    ancestry.get(descendantId)!.add(ancestorId);
  }
  for (const warranty of due) {
    const expiry = warranty.expiresOn.toISOString().slice(0, 10);
    const body = `Warranty ${warranty.reference} for asset ${warranty.asset.number} expires on ${warranty.expiresOn.toLocaleDateString('en-GB', { dateStyle: 'long', timeZone: 'UTC' })}.`;
    const grants = ancestry.get(warranty.asset.locationId);
    const rows = members
      .filter(
        (member) =>
          hasAllLocationAccess(member, scopes.get(member.role)) ||
          member.sites.some(({ locationId }) => grants?.has(locationId)),
      )
      .map((member) => ({
        tenantId,
        assetId: warranty.assetId,
        recipientId: member.id,
        recipientEmail: member.account.email,
        eventKey: `warranty.expiry:${warranty.id}:${expiry}:${member.id}`,
        title: 'Asset warranty expiring',
        body,
      }));
    if (!rows.length) continue;
    const created = await tx.notification.createManyAndReturn({
      data: rows,
      skipDuplicates: true,
      select: { id: true },
    });
    if (created.length)
      await tx.outboxMessage.createMany({
        data: created.map(({ id }) => ({ tenantId, topic: 'notification.deliver', payload: { notificationId: id } })),
      });
  }
  return candidates;
}

export async function notifyExpiringWarranties(db: PrismaClient, tenantId: string, now = new Date()) {
  const today = new Date(DATE_IN_UK.format(now) + 'T00:00:00Z');
  let after: string | undefined;
  do {
    const rows = await withTenant(db, tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId, status: 'active' },
        include: { entitlements: true },
      });
      if (!tenant || !resolveEntitlements(tenant.plan, tenant.entitlements).features.includes('assets')) return [];
      return notifyBatch(tx, tenantId, today, after);
    });
    after = rows.length === BATCH ? rows.at(-1)?.id : undefined;
  } while (after);
}

register('warranty.scan', async (_payload, ctx) => {
  const now = new Date();
  let after: string | undefined;
  let failed = 0;
  do {
    const tenants = await ctx.db.tenant.findMany({
      where: { status: 'active', ...(after && { id: { gt: after } }) },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true },
    });
    for (const { id } of tenants) {
      try {
        await notifyExpiringWarranties(ctx.db, id, now);
      } catch (error) {
        failed++;
        ctx.log(`warranty scan failed for tenant ${id}: ${error instanceof Error ? error.name : 'unknown error'}`);
      }
    }
    after = tenants.length === BATCH ? tenants.at(-1)?.id : undefined;
  } while (after);
  if (failed) throw new Error(`Could not finish warranty alerts for ${failed} organisation(s).`);
});

export async function scheduleWarrantyAlerts(queue: Queue<JobData>) {
  await queue.upsertJobScheduler('warranty-alerts', WARRANTY_ALERT_SCHEDULE, {
    name: 'warranty.scan',
    data: { messageId: 'warranty-alerts', tenantId: null, payload: {} },
    opts: { attempts: 5, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 30, removeOnFail: 90 },
  });
}
