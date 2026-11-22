import type { Tx } from '@cafm/db';
import type { RequestStatus } from '@cafm/shared';
import { audit } from '../../core/audit';
import type { AuthContext } from '../../core/session';
import { notifyLinkedRequesters, notifyRequester } from '../helpdesk/request-notifications';
import { lockRequests } from '../helpdesk/request-scope';

/**
 * Keeps the Helpdesk request in step with its jobs. When every job that is still wanted has been
 * completed, the request is completed and the requester told. Reopening a job reopens the request.
 * `actor` is the member who made the change, or null when it came from a contractor's link.
 */
export async function syncRequest(
  tx: Tx,
  tenantId: string,
  requestId: string,
  actor: { auth: AuthContext; ip?: string } | null,
) {
  await lockRequests(tx, tenantId);
  const request = await tx.serviceRequest.findFirst({ where: { id: requestId, tenantId } });
  // Closed, rejected and merged requests are left alone.
  if (!request || ['closed', 'rejected', 'merged'].includes(request.status)) return;
  const jobs = await tx.workOrder.findMany({
    where: { tenantId, requestId, status: { not: 'cancelled' } },
    select: { status: true },
  });
  const done = jobs.length > 0 && jobs.every(({ status }) => ['completed', 'verified', 'closed'].includes(status));
  const next: string | null =
    done && request.status !== 'completed'
      ? 'completed'
      : !done && request.status === 'completed'
        ? 'in_progress'
        : null;
  if (!next) return;
  const updated = await tx.serviceRequest.update({
    where: { id: request.id },
    data: {
      status: next,
      firstResponseAt: request.firstResponseAt ?? new Date(),
      ...(next === 'in_progress' ? { rating: null, feedback: null, ratedAt: null } : {}),
      version: { increment: 1 },
    },
  });
  const label = next === 'completed' ? 'Completed' : 'In progress';
  const note = await tx.requestEntry.create({
    data: {
      tenantId,
      requestId: request.id,
      authorId: actor?.auth.membership!.id,
      kind: 'status',
      body: next === 'completed' ? 'Completed · all work orders finished' : 'In progress · a work order was reopened',
    },
  });
  const event = {
    action: 'request.update',
    entityType: 'request',
    entityId: request.id,
    changes: { before: { status: request.status }, after: { status: next }, via: 'work_order' },
  };
  if (actor) await audit(tx, actor.auth, event, actor.ip);
  else await tx.auditEvent.create({ data: { tenantId, ...event } });
  await notifyRequester(tx, updated, next === 'completed' ? 'request.completed' : 'request.progress', note.id, label);
  await notifyLinkedRequesters(tx, tenantId, request.id, request.status as RequestStatus, next as RequestStatus);
}
