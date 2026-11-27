import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, seedId, withTenant } from '@fmstead/db';
import { createWorker, register } from '../src';

const appUrl = process.env.APP_DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
if (!appUrl) throw new Error('APP_DATABASE_URL is required for the worker tests');

const db = new PrismaClient({ datasourceUrl: appUrl });
const tenantId = seedId('tenant:starter-demo');
const seen: { payload: unknown; tenantId: string | null }[] = [];
let failNext = true;

register('test.echo', async (payload, ctx) => {
  seen.push({ payload, tenantId: ctx.tenantId });
});
register('test.flaky', async () => {
  if (failNext) {
    failNext = false;
    throw new Error('first attempt fails');
  }
});

const worker = createWorker({ db, redisUrl, log: () => {} });
beforeAll(async () => {
  await worker.queue.obliterate({ force: true });
});
afterAll(async () => {
  await worker.close();
  await db.$disconnect();
});

async function waitFor(check: () => boolean | Promise<boolean>, ms = 10000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Dispatches until this message is queued. Other tests leave unsent messages in
 * the outbox, and one dispatch takes at most 50, so a single call can miss it.
 */
async function dispatchUntilQueued(id: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    await worker.dispatchOnce();
    if (await worker.queue.getJob(id)) return;
  }
  // Say why, so a failure on CI can be diagnosed: a failed queue.add leaves the message waiting out a backoff.
  const row = await withTenant(db, tenantId, (tx) => tx.outboxMessage.findUnique({ where: { id } }));
  throw new Error(
    `Outbox message ${id} was never queued: ` +
      (row
        ? `attempts ${row.attempts}, processed ${row.processedAt?.toISOString() ?? 'no'}, ` +
          `last error ${row.lastError ?? 'none'}, next try ${row.availableAt.toISOString()}`
        : 'it is not visible in the starter-demo tenant'),
  );
}

describe('outbox worker', () => {
  it('delivers an outbox message to its handler with its tenant, and marks it processed', async () => {
    const msg = await withTenant(db, tenantId, (tx) =>
      tx.outboxMessage.create({ data: { tenantId, topic: 'test.echo', payload: { hello: 'world' } } }),
    );
    await dispatchUntilQueued(msg.id);
    await waitFor(() => seen.some((s) => (s.payload as { hello?: string }).hello === 'world'));
    expect(seen.find((s) => (s.payload as { hello?: string }).hello === 'world')?.tenantId).toBe(tenantId);
    const row = await withTenant(db, tenantId, (tx) => tx.outboxMessage.findUnique({ where: { id: msg.id } }));
    expect(row?.processedAt).not.toBeNull();
  });

  it('retries a failing job', async () => {
    const msg = await withTenant(db, tenantId, (tx) =>
      tx.outboxMessage.create({ data: { tenantId, topic: 'test.flaky', payload: {} } }),
    );
    // Listen before dispatching, so the completion can't be missed.
    const completed = new Promise<string>((resolve) =>
      worker.worker.on('completed', (j) => j.name === 'test.flaky' && resolve(j.id!)),
    );
    await dispatchUntilQueued(msg.id);
    expect((await worker.queue.getJob(await completed))?.attemptsMade).toBe(2);
  }, 30000);

  it('fails a message with no handler, so it is retried rather than lost', async () => {
    const msg = await withTenant(db, tenantId, (tx) =>
      tx.outboxMessage.create({ data: { tenantId, topic: 'test.unhandled', payload: {} } }),
    );
    await dispatchUntilQueued(msg.id);
    // The job ID is the outbox message ID. After a failed attempt it waits (delayed) for its retry.
    await waitFor(async () => ((await worker.queue.getJob(msg.id))?.attemptsMade ?? 0) >= 1);
    const job = await worker.queue.getJob(msg.id);
    expect(job?.failedReason).toBe('No handler for topic test.unhandled');
    expect(await job?.getState()).toBe('delayed');
  });
});

describe('email.send', () => {
  it('captures a platform email when no mail server is configured', async () => {
    const to = `reset-${Date.now()}@test.example`;
    const rows = await db.$queryRaw<
      { enqueue_platform: string }[]
    >`SELECT enqueue_platform('email.send', ${JSON.stringify({ to, subject: 'Reset', text: 'link' })}::jsonb)`;
    const id = rows[0]!.enqueue_platform;
    await dispatchUntilQueued(id);
    await waitFor(async () => (await db.capturedEmail.count({ where: { to } })) === 1);
    expect(await db.capturedEmail.findFirst({ where: { to } })).toMatchObject({
      tenantId: null,
      reason: 'no_mail_server',
    });
  });

  it('always captures demo-tenant email', async () => {
    const to = `invite-${Date.now()}@test.example`;
    const msg = await withTenant(db, tenantId, (tx) =>
      tx.outboxMessage.create({
        data: { tenantId, topic: 'email.send', payload: { to, subject: 'Invite', text: 'link', capture: true } },
      }),
    );
    await dispatchUntilQueued(msg.id);
    await waitFor(async () => (await db.capturedEmail.count({ where: { to } })) === 1);
    expect(await db.capturedEmail.findFirst({ where: { to } })).toMatchObject({ tenantId, reason: 'demo' });
  });
});

describe('email attachments', () => {
  it('names the attached files in a captured email, and never stores their contents', async () => {
    const to = `sheet-${Date.now()}@test.example`;
    const contentBase64 = Buffer.from('%PDF-1.3 not really a document').toString('base64');
    const msg = await withTenant(db, tenantId, (tx) =>
      tx.outboxMessage.create({
        data: {
          tenantId,
          topic: 'email.send',
          payload: {
            to,
            subject: 'Job sheet',
            text: 'The job sheet is attached.',
            capture: true,
            attachments: [{ filename: 'job-sheet-WO-1.pdf', contentType: 'application/pdf', contentBase64 }],
          },
        },
      }),
    );
    await dispatchUntilQueued(msg.id);
    await waitFor(async () => (await db.capturedEmail.count({ where: { to } })) === 1);
    const captured = await db.capturedEmail.findFirstOrThrow({ where: { to } });
    expect(captured.text).toBe('The job sheet is attached.\n\n[Attached: job-sheet-WO-1.pdf]');
    expect(captured.text).not.toContain(contentBase64);
  });
});

describe('demo reset schedule', () => {
  it('schedules the reset for 03:00 UK time', async () => {
    const { scheduleDemoReset, DEMO_RESET_SCHEDULE } = await import('../src/jobs/demo-reset');
    const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL ?? appUrl });
    try {
      const { handlers } = await import('../src/handlers');
      handlers.delete('demo.reset');
      await scheduleDemoReset(worker.queue, owner, () => {});
      const scheduler = await worker.queue.getJobScheduler('demo-reset');
      expect(scheduler).toMatchObject({ pattern: DEMO_RESET_SCHEDULE.pattern, tz: 'Europe/London' });
      await worker.queue.removeJobScheduler('demo-reset');
    } finally {
      await owner.$disconnect();
    }
  });
});

it('captures a demo request notification once when its job is replayed', async () => {
  const demo = seedId('tenant:demo-estates');
  const notice = await withTenant(db, demo, (tx) =>
    tx.notification.create({
      data: {
        tenantId: demo,
        eventKey: 'worker-notice-replay',
        recipientEmail: 'notifications-test@example.test',
        title: 'Demo Helpdesk notification',
        body: 'The request has been received.',
      },
    }),
  );
  try {
    const handler = (await import('../src')).handlers.get('notification.deliver')!;
    const context = { db, tenantId: demo, messageId: notice.id, log: () => {} };
    await handler({ notificationId: notice.id }, context);
    await handler({ notificationId: notice.id }, context);
    const captured = await db.capturedEmail.findMany({
      where: { tenantId: demo, to: 'notifications-test@example.test' },
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ reason: 'demo', subject: notice.title });
  } finally {
    await withTenant(db, demo, (tx) => tx.notification.delete({ where: { id: notice.id } }));
    await db.capturedEmail.deleteMany({ where: { tenantId: demo, to: 'notifications-test@example.test' } });
  }
});
