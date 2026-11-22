import type { Tx } from '@cafm/db';
import type { RequestNotificationEvent } from '@cafm/shared';
import { enqueue } from '../../core/audit';

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

export async function notifyRequester(
  tx: Tx,
  request: {
    tenantId: string;
    id: string;
    requesterId: string | null;
    externalEmail: string | null;
    number: string;
    title: string;
  },
  key: RequestNotificationEvent,
  entryId: string,
  status: string,
  acknowledgement?: string | null,
) {
  if (!request.requesterId && !request.externalEmail) return;
  const tenantId = request.tenantId;
  const [template, membership] = await Promise.all([
    tx.notificationTemplate.findUnique({ where: { tenantId_key: { tenantId, key } } }),
    request.requesterId
      ? tx.membership.findFirst({
          where: { id: request.requesterId, status: 'active' },
          select: { account: { select: { email: true } } },
        })
      : null,
  ]);
  if (request.requesterId && !membership) return;
  const { title, body, email, push } = template ?? requestNotificationDefault(key);
  const tokens = { number: request.number, title: request.title, status };
  const render = (value: string) =>
    value.replace(/\{(number|title|status)\}/g, (_, token: keyof typeof tokens) => tokens[token]);
  const notification = await tx.notification.create({
    data: {
      tenantId,
      requestId: request.id,
      recipientId: request.requesterId,
      recipientEmail: email ? (membership?.account.email ?? request.externalEmail) : null,
      pushEnabled: push,
      eventKey: entryId,
      title: render(title),
      body: render(key === 'request.received' && acknowledgement ? acknowledgement : body),
    },
  });
  if (notification.recipientEmail || (notification.pushEnabled && request.requesterId)) {
    await enqueue(tx, tenantId, 'notification.deliver', { notificationId: notification.id });
  }
}
