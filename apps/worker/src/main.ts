import { PrismaClient } from '@cafm/db';
import { createWorker } from './index';

const appUrl = process.env.APP_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!appUrl || !redisUrl) {
  console.error('[worker] APP_DATABASE_URL and REDIS_URL are required');
  process.exit(1);
}

const db = new PrismaClient({ datasourceUrl: appUrl });
const worker = createWorker({ db, redisUrl, log: (m) => console.log(`[worker] ${m}`) });
worker.start();
console.log('[worker] started');

async function shutdown(): Promise<void> {
  await worker.close();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
