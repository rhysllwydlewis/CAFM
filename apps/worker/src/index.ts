import { type Job, Queue, Worker } from 'bullmq';
import type { PrismaClient } from '@cafm/db';
import { handlers, type JobContext } from './handlers';
import { redisConnection } from './redis';

export { register, handlers } from './handlers';
// Job handlers register themselves on import.
import './jobs/email';
export type { Handler, JobContext } from './handlers';

export const QUEUE = 'cafm';

interface OutboxRow {
  id: string;
  tenant_id: string | null;
  topic: string;
  payload: unknown;
}

export interface JobData {
  messageId: string;
  tenantId: string | null;
  payload: unknown;
}

export interface WorkerOptions {
  /** App-role connection (APP_DATABASE_URL). The worker never uses the owner role. */
  db: PrismaClient;
  redisUrl: string;
  pollMs?: number;
  log?: (message: string) => void;
}

/**
 * The outbox dispatcher and job worker (doc 04: transactional outbox, BullMQ).
 * The dispatcher claims outbox rows across tenants through claim_outbox(),
 * which runs as the owner so the app role never bypasses row-level security,
 * and queues one job per message. The worker runs the topic's handler.
 */
export function createWorker({ db, redisUrl, pollMs = 1000, log = console.log }: WorkerOptions) {
  const connection = redisConnection(redisUrl);
  const queue = new Queue<JobData>(QUEUE, { connection });
  const worker = new Worker<JobData>(
    QUEUE,
    async (job: Job<JobData>) => {
      const handler = handlers.get(job.name);
      if (!handler) throw new Error(`No handler for topic ${job.name}`);
      const ctx: JobContext = { db, tenantId: job.data.tenantId, messageId: job.data.messageId, log };
      await handler(job.data.payload, ctx);
    },
    { connection, concurrency: 5 },
  );
  worker.on('failed', (job, err) => log(`job ${job?.name} (${job?.id}) failed: ${err.message}`));

  /** Claims due outbox messages and queues them. Returns how many were queued. */
  async function dispatchOnce(batchSize = 50): Promise<number> {
    const rows = await db.$queryRaw<
      OutboxRow[]
    >`SELECT id, tenant_id, topic, payload FROM claim_outbox(${batchSize}::int)`;
    for (const row of rows) {
      try {
        await queue.add(
          row.topic,
          { messageId: row.id, tenantId: row.tenant_id, payload: row.payload },
          {
            jobId: row.id,
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        );
        await db.$executeRaw`SELECT complete_outbox(${row.id}::uuid, NULL)`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.$executeRaw`SELECT complete_outbox(${row.id}::uuid, ${message})`;
      }
    }
    return rows.length;
  }

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  function start(): void {
    const tick = async () => {
      if (stopped) return;
      try {
        await dispatchOnce();
      } catch (err) {
        log(`outbox dispatch failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (!stopped) timer = setTimeout(tick, pollMs);
    };
    void tick();
  }

  async function close(): Promise<void> {
    stopped = true;
    if (timer) clearTimeout(timer);
    await worker.close();
    await queue.close();
  }

  return { queue, worker, dispatchOnce, start, close };
}
