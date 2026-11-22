import webPush from 'web-push';
import { scopedLocations, withTenant } from '@cafm/db';
import { isBrowserPushEndpoint, resolveEntitlements } from '@cafm/shared';
import { register } from '../handlers';
import { sendEmail } from './email';
import { slaAlerts } from './work-order-alerts';

register('notification.deliver', async (raw, ctx) => {
  const { notificationId } = raw as { notificationId: string };
  if (!ctx.tenantId) throw new Error('A notification delivery needs a tenant.');
  const tenantId = ctx.tenantId;
  const data = await withTenant(ctx.db, tenantId, async (tx) => {
    const notice = await tx.notification.findFirst({
      where: { id: notificationId, tenantId },
      include: {
        tenant: { select: { demo: true, plan: true, status: true, entitlements: true } },
        recipient: {
          select: {
            id: true,
            tenantId: true,
            role: true,
            locationScoped: true,
            status: true,
            account: { select: { email: true } },
          },
        },
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
      !resolveEntitlements(notice.tenant.plan, notice.tenant.entitlements).features.includes(
        notice.workOrderId ? 'work_orders' : notice.assetId ? 'assets' : 'helpdesk',
      ) ||
      (notice.recipientId && notice.recipient?.status !== 'active')
    )
      return null;
    if (notice.workOrderId) {
      const member = notice.recipient;
      if (!member) return null;
      const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: member.role } } });
      if (!role?.permissions.includes('work_orders.read')) return null;
      const job = await tx.workOrder.findFirst({
        where: {
          id: notice.workOrderId,
          tenantId,
          location: scopedLocations(member, role.scope),
          ...(role.scope === 'own' ? { assigneeId: member.id } : {}),
        },
        select: {
          status: true,
          createdAt: true,
          slaPausedAt: true,
          firstResponseAt: true,
          responseDueAt: true,
          attendedAt: true,
          attendDueAt: true,
          fixDueAt: true,
        },
      });
      // Send it only while it is still true: the job is unfinished, its clock is running and the target has not moved.
      const [, , target, level, dueMs] = notice.eventKey.split(':');
      const current =
        !!job &&
        slaAlerts(job, new Date()).some(
          (alert) => alert.target === target && alert.level === level && String(alert.due.getTime()) === dueMs,
        );
      if (!current) {
        await tx.notification.deleteMany({
          where: { id: notice.id, tenantId, readAt: null, emailSentAt: null, pushDeliveries: { none: {} } },
        });
        return null;
      }
    }
    if (notice.assetId) {
      const member = notice.recipient;
      if (!member) return null;
      const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: member.role } } });
      if (!role?.permissions.includes('assets.read') || !role.permissions.includes('assets.manage')) return null;
      const visible = await tx.asset.findFirst({
        where: {
          tenantId,
          id: notice.assetId,
          status: { not: 'decommissioned' },
          location: scopedLocations(member, role.scope),
        },
        select: { id: true },
      });
      if (!visible) return null;
      if (notice.eventKey.startsWith('warranty.expiry:')) {
        const [, warrantyId, expiry] = notice.eventKey.split(':');
        if (!warrantyId || !expiry) return null;
        const warranty = await tx.assetWarranty.findFirst({
          where: { id: warrantyId, tenantId, assetId: notice.assetId, active: true },
          select: { expiresOn: true },
        });
        if (!warranty || warranty.expiresOn.toISOString().slice(0, 10) !== expiry) {
          // Preserve seen or delivered notices as history. Otherwise let a future
          // scan reissue the alert if this expiry is tracked again.
          await tx.notification.deleteMany({
            where: {
              id: notice.id,
              tenantId,
              readAt: null,
              emailSentAt: null,
              pushDeliveries: { none: {} },
            },
          });
          return null;
        }
      }
    }
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
  async function deliverEmail() {
    const to = notice.recipientEmail && (notice.recipientId ? notice.recipient?.account.email : notice.recipientEmail);
    if (!to || notice.emailSentAt) return;
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

  async function deliverPush() {
    const { WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT } = process.env;
    if (!WEB_PUSH_PUBLIC_KEY || !WEB_PUSH_PRIVATE_KEY || !WEB_PUSH_SUBJECT) return;

    let failed = false;
    for (const subscription of subscriptions) {
      if (!isBrowserPushEndpoint(subscription.endpoint)) continue;
      try {
        // Keep the message generic on the lock screen. The app checks access on open.
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            id: notice.id,
            path: notice.workOrderId
              ? '/app/work-orders/' + notice.workOrderId
              : notice.assetId
                ? '/app/assets/' + notice.assetId + '/operations#warranties'
                : notice.requestId
                  ? '/portal/requests/' + notice.requestId
                  : '/app',
          }),
          {
            vapidDetails: {
              subject: WEB_PUSH_SUBJECT,
              publicKey: WEB_PUSH_PUBLIC_KEY,
              privateKey: WEB_PUSH_PRIVATE_KEY,
            },
            TTL: 86_400,
            timeout: 10_000,
          },
        );
      } catch (error) {
        const statusCode = error instanceof webPush.WebPushError ? error.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await withTenant(ctx.db, tenantId, (tx) =>
            tx.pushSubscription.deleteMany({ where: { id: subscription.id } }),
          );
        } else {
          failed = true;
        }
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
    if (failed) throw new Error('Browser push provider delivery failed.');
  }

  const [email, push] = await Promise.allSettled([deliverEmail(), deliverPush()]);
  const failed = [email.status === 'rejected' ? 'email' : '', push.status === 'rejected' ? 'browser push' : ''].filter(
    Boolean,
  );
  if (failed.length) throw new Error('Could not deliver notification by ' + failed.join(' and ') + '.');
});
