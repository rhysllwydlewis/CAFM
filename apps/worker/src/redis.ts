import type { ConnectionOptions } from 'bullmq';

/** BullMQ connection options from a redis:// or rediss:// URL. */
export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    // BullMQ workers need blocking commands without a retry limit.
    maxRetriesPerRequest: null,
    family: 0,
  };
}
