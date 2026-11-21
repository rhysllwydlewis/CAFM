import type { PrismaClient } from '@cafm/db';

/** What a job handler receives: the outbox message and shared services. */
export interface JobContext {
  db: PrismaClient;
  tenantId: string;
  messageId: string;
  log: (message: string) => void;
}

export type Handler = (payload: unknown, ctx: JobContext) => Promise<void>;

/**
 * Topic → handler. Modules register their handlers here (src/jobs/<module>).
 * A message whose topic has no handler fails, so it is retried and visible,
 * not silently dropped.
 */
export const handlers = new Map<string, Handler>();

export function register(topic: string, handler: Handler): void {
  if (handlers.has(topic)) throw new Error(`Handler for ${topic} is already registered`);
  handlers.set(topic, handler);
}

// Health check topic, used by tests and to confirm a deploy end to end.
register('system.ping', async (_payload, ctx) => {
  ctx.log(`system.ping handled for tenant ${ctx.tenantId}`);
});
