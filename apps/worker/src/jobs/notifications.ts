import webPush from 'web-push';
import { withTenant } from '@cafm/db';
import { isBrowserPushEndpoint, resolveEntitlements } from '@cafm/shared';
import { register } from '../handlers';
import { sendEmail } from './email';

register('notification.deliver', async (raw, ctx) => {
  const { notificationId } = raw as { notificationId: string };
  const tenantId = ctx.tenantId;
  if (!tenantId) throw new Error('A notification delivery needs a tenant.');
  const data = await withTenant(ctx.db, tenantId, async (tx) => {
    const notice = await tx.notification.findFirst({
      where: { id: notificationId, tenantId },
      include: {
        tenant: { select: { demo: true, plan: true, status: true, entitlements: true } },
        recipient: { select: { status: true, account: { select: { email: true } } } },
        request: {
          select: {
            receivedMessages: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { mailbox: { select: { address: true, active: true } } },
            },
          },
        },
      },
    });
    if (
      !notice ||
      notice.tenant.status !== 'active' ||
      !resolveEntitlements(notice.tenant.plan, notice.tenant.entitlements).features.includes('helpdesk') ||
      (notice.recipientId && notice.recipient?.status !== 'active')
    )
      return null;
    const subscriptions =
      notice.pushEnabled && notice.recipientId && !notice.tenant.demo
        ? await tx.pushSubscription.findMany({
            where: { tenantId, membershipId: notice.recipientId, deliveries: { none: { notificationId } } },
          })
        : [];
    return { notice, subscriptions };
  });
  if (!data) return;
  const { notice, subscriptions } = data;
  const to = notice.recipientEmail && (notice.recipientId ? notice.recipient?.account.email : notice.recipientEmail);
  if (to && !notice.emailSentAt) {
    const mailbox = notice.request?.receivedMessages[0]?.mailbox;
    await sendEmail(
      {
        to,
        subject: notice.title,
        text: notice.body,
        capture: notice.tenant.demo,
        replyTo: mailbox?.active ? mailbox.address : undefined,
        messageId: `<cafm-${notice.id}@cafm.invalid>`,
      },
      ctx,
    );
    await withTenant(ctx.db, tenantId, (tx) =>
      tx.notification.updateMany({ where: { id: notice.id }, data: { emailSentAt: new Date() } }),
    );
  }

  const { WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT } = process.env;
  if (!WEB_PUSH_PUBLIC_KEY || !WEB_PUSH_PRIVATE_KEY || !WEB_PUSH_SUBJECT) return;

  for (const subscription of subscriptions) {
    if (!isBrowserPushEndpoint(subscription.endpoint)) continue;
    try {
      // Keep the message generic on the lock screen. The app checks access on open.
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({ id: notice.id, path: notice.requestId ? '/portal/requests/' + notice.requestId : '/app' }),
        {
          vapidDetails: { subject: WEB_PUSH_SUBJECT, publicKey: WEB_PUSH_PUBLIC_KEY, privateKey: WEB_PUSH_PRIVATE_KEY },
          TTL: 86_400,
          timeout: 10_000,
        },
      );
    } catch (error) {
      const statusCode = error instanceof webPush.WebPushError ? error.statusCode : undefined;
      if (statusCode !== 404 && statusCode !== 410) throw new Error('Browser push provider delivery failed.');
      await withTenant(ctx.db, tenantId, (tx) => tx.pushSubscription.deleteMany({ where: { id: subscription.id } }));
      continue;
    }
    await withTenant(ctx.db, tenantId, (tx) =>
      tx.notificationPushDelivery.upsert({
        where: {
          tenantId_notificationId_subscriptionId: { tenantId, notificationId, subscriptionId: subscription.id },
        },
        create: { tenantId, notificationId, subscriptionId: subscription.id },
        update: {},
      }),
    );
  }
});
