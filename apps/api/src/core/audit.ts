import type { Prisma, Tx } from '@fmstead/db';
import type { AuthContext } from './session';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  /** Before/after values. Never include secrets: callers pass only safe fields. */
  changes?: Prisma.InputJsonValue;
}

/**
 * Records an audit event in the current transaction, so it is written if and
 * only if the change is (doc 09). Call inside withTenant.
 */
export async function audit(tx: Tx, auth: AuthContext, entry: AuditEntry, ip?: string): Promise<void> {
  const membership = auth.membership;
  if (!membership) throw new Error('audit() needs a tenant');
  await tx.auditEvent.create({
    data: {
      tenantId: membership.tenantId,
      // While someone is viewing as another person, the record names the person really acting.
      actorAccountId: auth.impersonator?.accountId ?? auth.account.id,
      actorMembershipId: auth.impersonator?.membershipId ?? membership.id,
      ip,
      ...entry,
    },
  });
}

/** Queues a message for the worker in the current transaction (transactional outbox). */
export async function enqueue(tx: Tx, tenantId: string, topic: string, payload: Prisma.InputJsonValue): Promise<void> {
  await tx.outboxMessage.create({ data: { tenantId, topic, payload } });
}
