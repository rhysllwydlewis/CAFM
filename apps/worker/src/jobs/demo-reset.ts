import type { Queue } from 'bullmq';
import { type PrismaClient, resetDemo } from '@cafm/db';
import { register } from '../handlers';
import type { JobData } from '../index';

export const DEMO_RESET_SCHEDULE = { pattern: '0 3 * * *', tz: 'Europe/London' };

/**
 * Nightly demo reset at 03:00 UK time (doc 06). Only scheduled when
 * DEMO_MODE=true; it runs as the owner role, which the worker is given only
 * in demo environments.
 */
export async function scheduleDemoReset(
  queue: Queue<JobData>,
  owner: PrismaClient,
  log: (m: string) => void,
): Promise<void> {
  register('demo.reset', async () => {
    const result = await resetDemo(owner);
    log(`demo reset: ${result.tenants} tenants restored, ${result.removedAccounts} visitor accounts removed`);
  });
  await queue.upsertJobScheduler('demo-reset', DEMO_RESET_SCHEDULE, {
    name: 'demo.reset',
    data: { messageId: 'demo-reset', tenantId: null, payload: {} },
  });
}
