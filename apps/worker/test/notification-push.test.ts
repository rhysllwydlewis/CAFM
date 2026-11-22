import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { PrismaClient } from '@cafm/db';
import { handlers } from '../src/handlers';
import '../src/jobs/notifications';

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock('web-push', () => ({ default: { sendNotification } }));

const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await owner.$disconnect();
  await db.$disconnect();
});

it('sends generic browser updates once and records delivery by subscription', async () => {
  const suffix = randomUUID();
  const tenant = await owner.tenant.create({ data: { slug: 'push-' + suffix, name: 'Push test', plan: 'free' } });
  const account = await owner.account.create({
    data: { email: suffix + '@test.example', name: 'Recipient', passwordHash: 'fixture' },
  });
  const where = { tenantId: tenant.id };
  try {
    const membership = await owner.membership.create({
      data: { ...where, accountId: account.id, role: 'requester', licence: 'requester' },
    });
    const subscription = await owner.pushSubscription.create({
      data: {
        ...where,
        membershipId: membership.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/testing',
        p256dh: 'test',
        auth: 'test',
      },
    });
    const notice = await owner.notification.create({
      data: {
        ...where,
        recipientId: membership.id,
        eventKey: 'push-test',
        title: 'Sensitive request title',
        body: 'Sensitive report',
      },
    });
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'test-public');
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'test-private');
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:push@test.example');
    const handler = handlers.get('notification.deliver')!;
    const context = { db, ...where, messageId: randomUUID(), log: () => {} };
    await handler({ notificationId: notice.id }, context);
    await handler({ notificationId: notice.id }, context);
    expect(sendNotification.mock.calls).toHaveLength(1);
    expect(sendNotification.mock.calls[0]?.[1]).toEqual(JSON.stringify({ id: notice.id, path: '/app' }));
    expect(
      await owner.notificationPushDelivery.count({
        where: { ...where, notificationId: notice.id, subscriptionId: subscription.id },
      }),
    ).toBe(1);
  } finally {
    await owner.notification.deleteMany({ where });
    await owner.pushSubscription.deleteMany({ where });
    await owner.membership.deleteMany({ where });
    await owner.account.delete({ where: { id: account.id } });
    await owner.tenant.delete({ where: { id: tenant.id } });
  }
});
