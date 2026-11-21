import type { PrismaClient, Tx } from '@cafm/db';
import { enqueue } from './audit';

/** An email for the worker to send (topic email.send, apps/worker/src/jobs/email.ts). */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Capture instead of sending: always for demo tenants (doc 06). */
  capture?: boolean;
}

/**
 * Base URL for links in emails. Always from configuration, never from the
 * request's Host header, so links can't be pointed at another site.
 */
export function appUrl(): string {
  const { APP_URL, RAILWAY_PUBLIC_DOMAIN, WEB_ORIGIN } = process.env;
  // On Railway, a PR preview environment has its own domain; links must point there, not at production.
  const railway = RAILWAY_PUBLIC_DOMAIN ? `https://${RAILWAY_PUBLIC_DOMAIN}` : undefined;
  return (APP_URL || railway || WEB_ORIGIN?.split(',')[0] || 'http://localhost:3000').replace(/\/$/, '');
}

/** Queues a tenant email in the current transaction. */
export function queueTenantEmail(tx: Tx, tenantId: string, message: EmailMessage): Promise<void> {
  return enqueue(tx, tenantId, 'email.send', { ...message });
}

/** Queues an account-level email that belongs to no tenant (e.g. password reset). */
export async function queuePlatformEmail(db: PrismaClient | Tx, message: EmailMessage): Promise<void> {
  await db.$queryRaw`SELECT enqueue_platform('email.send', ${JSON.stringify(message)}::jsonb)`;
}
