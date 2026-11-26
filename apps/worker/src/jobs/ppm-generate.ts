import type { Queue } from 'bullmq';
import { generatePpm, PPM_TIME_ZONE, withTenant, type PrismaClient } from '@fmstead/db';
import { localDate, resolveEntitlements } from '@fmstead/shared';
import { register } from '../handlers';
import type { JobData } from '../index';

const BATCH = 100;
/** Hourly: a new schedule, or a meter reading that makes a visit due, is picked up within the hour. Safe to repeat. */
export const PPM_GENERATE_SCHEDULE = { every: 60 * 60_000 };

/** Raises the PPM jobs that are due for one organisation, if it has planned maintenance. */
export async function generatePpmForTenant(db: PrismaClient, tenantId: string, now = new Date()) {
  return withTenant(db, tenantId, async (tx) => {
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId, status: 'active' },
      include: { entitlements: true },
    });
    if (!tenant || !resolveEntitlements(tenant.plan, tenant.entitlements).features.includes('ppm')) return null;
    if (!resolveEntitlements(tenant.plan, tenant.entitlements).features.includes('work_orders')) return null;
    return generatePpm(tx, { tenantId, today: localDate(now, PPM_TIME_ZONE) });
  });
}

register('ppm.generate-scan', async (_payload, ctx) => {
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
        const result = await generatePpmForTenant(ctx.db, id, now);
        if (result?.created) ctx.log(`PPM: ${result.created} job(s) raised for tenant ${id}`);
      } catch (error) {
        failed++;
        ctx.log(`PPM generation failed for tenant ${id}: ${error instanceof Error ? error.name : 'unknown error'}`);
      }
    }
    after = tenants.length === BATCH ? tenants.at(-1)?.id : undefined;
  } while (after);
  if (failed) throw new Error(`Could not finish PPM generation for ${failed} organisation(s).`);
});

export async function schedulePpmGeneration(queue: Queue<JobData>) {
  await queue.upsertJobScheduler('ppm-generate', PPM_GENERATE_SCHEDULE, {
    name: 'ppm.generate-scan',
    data: { messageId: 'ppm-generate', tenantId: null, payload: {} },
    opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 30, removeOnFail: 90 },
  });
}
