import type { Tx } from '@cafm/db';
import { REQUEST_STATUS_LABELS, type RequestNotificationEvent, type RequestStatus } from '@cafm/shared';

const defaults: Record<RequestNotificationEvent, { title: string; body: string }> = {
  'request.received': { title: 'Request {number} received', body: 'We’ve received your request about {title}.' },
  'request.progress': { title: 'Request {number} updated', body: 'Your request about {title} is now {status}.' },
  'request.completed': {
    title: 'Request {number} completed',
    body: 'Your request about {title} is complete. You can rate it in My requests.',
  },
  'request.reply': {
    title: 'New reply on request {number}',
    body: 'The Helpdesk has responded to your request about {title}.',
  },
};

export function requestNotificationDefault(key: RequestNotificationEvent) {
  return { key, ...defaults[key], email: true, push: true };
}

type NotificationRequest = {
  tenantId: string;
  id: string;
  requesterId: string | null;
  externalEmail: string | null;
  number: string;
  title: string;
};
type RequestNotice = { request: NotificationRequest; entryId: string };

async function notifyRequesters(
  tx: Tx,
  tenantId: string,
  events: RequestNotice[],
  key: RequestNotificationEvent,
  status: string,
  acknowledgement?: string | null,
) {
  if (!events.length) return;
  const memberIds = events.flatMap(({ request }) => (request.requesterId ? [request.requesterId] : []));
  const [template, members] = await Promise.all([
    tx.notificationTemplate.findUnique({ where: { tenantId_key: { tenantId, key } } }),
    memberIds.length
      ? tx.membership.findMany({
          where: { tenantId, id: { in: [...new Set(memberIds)] }, status: 'active' },
          select: { id: true, account: { select: { email: true } } },
        })
      : [],
  ]);
  const emails = new Map(members.map(({ id, account }) => [id, account.email]));
  const { title, body, email, push } = template ?? requestNotificationDefault(key);
  const notices = events.flatMap(({ request, entryId }) => {
    if (request.requesterId && !emails.has(request.requesterId)) return [];
    const recipientEmail = email
      ? request.requesterId
        ? (emails.get(request.requesterId) ?? null)
        : request.externalEmail
      : null;
    if (!request.requesterId && !recipientEmail) return [];
    const tokens = { number: request.number, title: request.title, status };
    const render = (value: string) =>
      value.replace(/\{(number|title|status)\}/g, (_, token: keyof typeof tokens) => tokens[token]);
    return [
      {
        tenantId,
        requestId: request.id,
        recipientId: request.requesterId,
        recipientEmail,
        pushEnabled: push,
        eventKey: entryId,
        title: render(title),
        body: render(key === 'request.received' && acknowledgement ? acknowledgement : body),
      },
    ];
  });
  if (!notices.length) return;
  const created = await tx.notification.createManyAndReturn({
    data: notices,
    select: { id: true, recipientEmail: true, pushEnabled: true, recipientId: true },
  });
  const deliveries = created
    .filter(({ recipientEmail, pushEnabled, recipientId }) => recipientEmail || (pushEnabled && recipientId))
    .map(({ id }) => ({ tenantId, topic: 'notification.deliver', payload: { notificationId: id } }));
  if (deliveries.length) await tx.outboxMessage.createMany({ data: deliveries });
}

export function notifyRequester(
  tx: Tx,
  request: NotificationRequest,
  key: RequestNotificationEvent,
  entryId: string,
  status: string,
  acknowledgement?: string | null,
) {
  return notifyRequesters(tx, request.tenantId, [{ request, entryId }], key, status, acknowledgement);
}

/** Share the outcome with each reporter using only that reporter's own reference and title. */
export async function notifyLinkedRequesters(
  tx: Tx,
  tenantId: string,
  primaryId: string,
  previous: RequestStatus,
  status: RequestStatus,
) {
  const where = { tenantId, mergedIntoId: primaryId };
  await tx.serviceRequest.updateMany({
    where,
    data: {
      updatedAt: new Date(),
      version: { increment: 1 },
      ...(previous === 'completed' && status === 'in_progress' ? { rating: null, feedback: null, ratedAt: null } : {}),
    },
  });
  const linked = await tx.serviceRequest.findMany({
    where,
    select: { id: true, tenantId: true, requesterId: true, externalEmail: true, title: true, number: true },
  });
  if (!linked.length) return;
  const label = REQUEST_STATUS_LABELS[status];
  const entries = await tx.requestEntry.createManyAndReturn({
    data: linked.map(({ id }) => ({ tenantId, requestId: id, kind: 'status', body: 'Linked request · ' + label })),
    select: { id: true, requestId: true },
  });
  const byRequest = new Map(linked.map((request) => [request.id, request]));
  await notifyRequesters(
    tx,
    tenantId,
    entries.map(({ id, requestId }) => ({ request: byRequest.get(requestId)!, entryId: id })),
    status === 'completed' ? 'request.completed' : 'request.progress',
    label,
  );
}
