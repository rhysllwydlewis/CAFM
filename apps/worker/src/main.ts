import { PrismaClient } from '@fmstead/db';
import { createWorker } from './index';
import { scheduleDemoReset } from './jobs/demo-reset';
import { schedulePpmGeneration } from './jobs/ppm-generate';
import { scheduleWarrantyAlerts } from './jobs/warranty-alerts';
import { scheduleWorkOrderAlerts } from './jobs/work-order-alerts';

const appUrl = process.env.APP_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!appUrl || !redisUrl) {
  console.error('[worker] APP_DATABASE_URL and REDIS_URL are required');
  process.exit(1);
}

const log = (m: string) => console.log(`[worker] ${m}`);
const db = new PrismaClient({ datasourceUrl: appUrl });
const worker = createWorker({ db, redisUrl, log });
worker.start();
console.log('[worker] started');
scheduleWarrantyAlerts(worker.queue).catch((error: unknown) =>
  log(`could not schedule warranty alerts: ${error instanceof Error ? error.message : String(error)}`),
);
scheduleWorkOrderAlerts(worker.queue).catch((error: unknown) =>
  log(`could not schedule work order alerts: ${error instanceof Error ? error.message : String(error)}`),
);

schedulePpmGeneration(worker.queue).catch((error: unknown) =>
  log(`could not schedule PPM generation: ${error instanceof Error ? error.message : String(error)}`),
);

// Demo environments only: the nightly reset needs the owner role (doc 06).
const ownerUrl = process.env.OWNER_DATABASE_URL;
const owner = process.env.DEMO_MODE === 'true' && ownerUrl ? new PrismaClient({ datasourceUrl: ownerUrl }) : null;
if (owner) {
  scheduleDemoReset(worker.queue, owner, log).then(
    () => log('nightly demo reset scheduled for 03:00 UK time'),
    (err: unknown) =>
      log(`could not schedule the nightly demo reset: ${err instanceof Error ? err.message : String(err)}`),
  );
}

async function shutdown(): Promise<void> {
  await worker.close();
  await db.$disconnect();
  await owner?.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
