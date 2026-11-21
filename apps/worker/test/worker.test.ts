import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, seedId, withTenant } from '@cafm/db';
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

describe('outbox worker', () => {
  it('delivers an outbox message to its handler with its tenant, and marks it processed', async () => {
    const msg = await withTenant(db, tenantId, (tx) =>
      tx.outboxMessage.create({ data: { tenantId, topic: 'test.echo', payload: { hello: 'world' } } }),
    );
    expect(await worker.dispatchOnce()).toBeGreaterThanOrEqual(1);
    await waitFor(() => seen.some((s) => (s.payload as { hello?: string }).hello === 'world'));
    expect(seen.find((s) => (s.payload as { hello?: string }).hello === 'world')?.tenantId).toBe(tenantId);
    const row = await withTenant(db, tenantId, (tx) => tx.outboxMessage.findUnique({ where: { id: msg.id } }));
    expect(row?.processedAt).not.toBeNull();
  });

  it('retries a failing job', async () => {
    await withTenant(db, tenantId, (tx) =>
      tx.outboxMessage.create({ data: { tenantId, topic: 'test.flaky', payload: {} } }),
    );
    await worker.dispatchOnce();
    const job = await new Promise<string>((resolve) =>
      worker.worker.on('completed', (j) => j.name === 'test.flaky' && resolve(j.id!)),
    );
    expect((await worker.queue.getJob(job))?.attemptsMade).toBe(2);
  }, 20000);

  it('fails a message with no handler, so it is retried rather than lost', async () => {
    const msg = await withTenant(db, tenantId, (tx) =>
      tx.outboxMessage.create({ data: { tenantId, topic: 'test.unhandled', payload: {} } }),
    );
    await worker.dispatchOnce();
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
    await db.$queryRaw`SELECT enqueue_platform('email.send', ${JSON.stringify({ to, subject: 'Reset', text: 'link' })}::jsonb)`;
    await worker.dispatchOnce();
    await waitFor(async () => (await db.capturedEmail.count({ where: { to } })) === 1);
    expect(await db.capturedEmail.findFirst({ where: { to } })).toMatchObject({
      tenantId: null,
      reason: 'no_mail_server',
    });
  });

  it('always captures demo-tenant email', async () => {
    const to = `invite-${Date.now()}@test.example`;
    await withTenant(db, tenantId, (tx) =>
      tx.outboxMessage.create({
        data: { tenantId, topic: 'email.send', payload: { to, subject: 'Invite', text: 'link', capture: true } },
      }),
    );
    await worker.dispatchOnce();
    await waitFor(async () => (await db.capturedEmail.count({ where: { to } })) === 1);
    expect(await db.capturedEmail.findFirst({ where: { to } })).toMatchObject({ tenantId, reason: 'demo' });
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
