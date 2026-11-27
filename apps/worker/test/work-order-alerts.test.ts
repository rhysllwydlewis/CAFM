import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { PrismaClient } from '@fmstead/db';
import { handlers } from '../src/handlers';
import '../src/jobs/notifications';
import { AT_RISK_MS, notifyWorkOrderSla, slaAlerts, slaEventKey } from '../src/jobs/work-order-alerts';

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('../src/jobs/email', () => ({ sendEmail }));
vi.mock('web-push', () => ({ default: { sendNotification: vi.fn() } }));

const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
afterEach(() => vi.clearAllMocks());
afterAll(async () => {
  await owner.$disconnect();
  await db.$disconnect();
});

const minutes = (from: Date, offset: number) => new Date(from.getTime() + offset * 60_000);

it('decides which targets need an alert, and ignores paused and finished jobs', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const job = {
    status: 'on_site',
    createdAt: minutes(now, -600),
    slaPausedAt: null,
    // Already picked up, so the response target doesn't matter.
    firstResponseAt: now as Date | null,
    responseDueAt: minutes(now, -240) as Date | null,
    attendedAt: null as Date | null,
    attendDueAt: minutes(now, 30) as Date | null,
    fixDueAt: minutes(now, 600) as Date | null,
  };
  expect(slaAlerts(job, now)).toEqual([{ target: 'attend', level: 'risk', due: job.attendDueAt }]);
  // The edge of the window, and a target that has just passed.
  expect(slaAlerts({ ...job, attendDueAt: new Date(now.getTime() + AT_RISK_MS) }, now)).toHaveLength(1);
  expect(slaAlerts({ ...job, attendDueAt: new Date(now.getTime() + AT_RISK_MS + 1) }, now)).toEqual([]);
  expect(slaAlerts({ ...job, attendDueAt: minutes(now, -1) }, now)).toMatchObject([
    { target: 'attend', level: 'breach' },
  ]);
  expect(slaAlerts({ ...job, attendDueAt: now }, now)).toMatchObject([{ level: 'breach' }]);
  // A short target is at risk for a quarter of its length, so a new emergency is not alerted the moment it is raised.
  const quick = { ...job, createdAt: minutes(now, -10), attendDueAt: minutes(now, 20), fixDueAt: null };
  expect(slaAlerts(quick, now)).toEqual([]);
  expect(slaAlerts(quick, minutes(now, 12))).toEqual([]);
  expect(slaAlerts(quick, minutes(now, 13))).toMatchObject([{ target: 'attend', level: 'risk' }]);
  // A job nobody has picked up is judged on its response target, which is the first to be missed.
  expect(slaAlerts({ ...job, firstResponseAt: null, responseDueAt: minutes(now, 20) }, now)).toMatchObject([
    { target: 'respond', level: 'risk' },
    { target: 'attend', level: 'risk' },
  ]);
  expect(slaAlerts({ ...job, firstResponseAt: null, responseDueAt: minutes(now, -1) }, now)).toMatchObject([
    { target: 'respond', level: 'breach' },
    { target: 'attend', level: 'risk' },
  ]);
  // Once someone has been on site the attendance target no longer matters.
  expect(slaAlerts({ ...job, attendedAt: now, attendDueAt: minutes(now, -60) }, now)).toEqual([]);
  // Both targets can be in trouble at once, each at its own level.
  expect(slaAlerts({ ...job, attendDueAt: minutes(now, -5), fixDueAt: minutes(now, 20) }, now)).toMatchObject([
    { target: 'attend', level: 'breach' },
    { target: 'fix', level: 'risk' },
  ]);
  // A stopped clock is not running late, and finished or cancelled jobs need nothing.
  expect(slaAlerts({ ...job, slaPausedAt: now, fixDueAt: minutes(now, -60) }, now)).toEqual([]);
  for (const status of ['completed', 'verified', 'closed', 'cancelled']) {
    expect(slaAlerts({ ...job, status, fixDueAt: minutes(now, -60) }, now)).toEqual([]);
  }
  expect(slaAlerts({ ...job, attendDueAt: null, fixDueAt: null }, now)).toEqual([]);
  // Moving a target gives a different key, so it can alert again.
  const first = { target: 'fix' as const, level: 'breach' as const, due: now };
  expect(slaEventKey('job', first, 'member')).not.toBe(
    slaEventKey('job', { ...first, due: minutes(now, 60) }, 'member'),
  );
});

it('tells the assignee when a job is at risk, adds supervisors for a breach, and sends each alert once', async () => {
  const tenant = await owner.tenant.create({
    data: { slug: 'sla-alerts-' + randomUUID(), name: 'SLA alert test', plan: 'starter' },
  });
  const where = { tenantId: tenant.id };
  const accountIds: string[] = [];
  try {
    await owner.role.createMany({
      data: [
        {
          ...where,
          key: 'technician',
          name: 'Technician',
          permissions: ['work_orders.read', 'work_orders.close'],
          scope: 'own',
        },
        {
          ...where,
          key: 'supervisor',
          name: 'Supervisor',
          permissions: ['work_orders.read', 'work_orders.assign', 'work_orders.edit'],
          scope: 'all',
        },
        { ...where, key: 'reader', name: 'Reader', permissions: ['work_orders.read'], scope: 'all' },
      ],
    });
    async function member(role: string, locationScoped: boolean, status = 'active') {
      const account = await owner.account.create({
        data: { name: role, email: randomUUID() + '@test.example', passwordHash: 'fixture' },
      });
      accountIds.push(account.id);
      return owner.membership.create({
        data: { ...where, role, locationScoped, status, licence: 'full', accountId: account.id },
      });
    }
    const tech = await member('technician', true);
    const supervisor = await member('supervisor', false);
    const branchSupervisor = await member('supervisor', true);
    const otherSupervisor = await member('supervisor', true);
    await member('supervisor', false, 'inactive');
    await member('reader', false);
    const site = await owner.location.create({ data: { ...where, name: 'Main site', code: 'M', kind: 'site' } });
    const other = await owner.location.create({ data: { ...where, name: 'Other site', code: 'O', kind: 'site' } });
    await owner.locationPath.createMany({
      data: [
        { ...where, ancestorId: site.id, descendantId: site.id },
        { ...where, ancestorId: other.id, descendantId: other.id },
      ],
    });
    await owner.membershipSite.createMany({
      data: [
        { ...where, locationId: site.id, membershipId: tech.id },
        { ...where, locationId: site.id, membershipId: branchSupervisor.id },
        { ...where, locationId: other.id, membershipId: otherSupervisor.id },
      ],
    });

    const now = new Date('2026-11-23T12:00:00Z');
    let count = 0;
    const job = (data: Record<string, unknown>) =>
      owner.workOrder.create({
        data: {
          ...where,
          number: 'WO-' + ++count,
          title: 'Job ' + count,
          description: 'Test',
          locationId: site.id,
          impact: 2,
          urgency: 2,
          priority: 3,
          submissionKey: randomUUID(),
          submissionHash: 'test',
          createdAt: minutes(now, -600),
          fixDueAt: minutes(now, 600),
          ...data,
        } as never,
      });
    const atRisk = await job({ status: 'on_site', assigneeId: tech.id, attendedAt: now, fixDueAt: minutes(now, 30) });
    const nobody = await job({ status: 'logged', fixDueAt: minutes(now, 20) });
    const missed = await job({ status: 'on_site', assigneeId: tech.id, attendedAt: now, fixDueAt: minutes(now, -15) });
    await job({
      status: 'paused',
      pauseReason: 'awaiting_parts',
      slaPausedAt: minutes(now, -120),
      assigneeId: tech.id,
      fixDueAt: minutes(now, -300),
    });
    await job({
      status: 'completed',
      assigneeId: tech.id,
      fixDueAt: minutes(now, -300),
      completedAt: minutes(now, -400),
    });
    await job({ status: 'logged', fixDueAt: minutes(now, 3000) });
    // Nobody has picked this one up and its response target has passed.
    const unanswered = await job({ status: 'logged', responseDueAt: minutes(now, -10), fixDueAt: minutes(now, 3000) });

    await Promise.all([notifyWorkOrderSla(db, tenant.id, now), notifyWorkOrderSla(db, tenant.id, now)]);
    const notices = await owner.notification.findMany({ where, orderBy: { eventKey: 'asc' } });
    const who = (jobId: string) =>
      notices
        .filter((notice) => notice.workOrderId === jobId)
        .map(({ recipientId }) => recipientId)
        .sort();
    // At risk with an assignee goes to the assignee alone.
    expect(who(atRisk.id)).toEqual([tech.id]);
    // At risk with nobody on it goes to the supervisors who can see the site, and nobody else.
    expect(who(nobody.id)).toEqual([supervisor.id, branchSupervisor.id].sort());
    // A breach goes to the assignee and the supervisors, once each.
    expect(who(missed.id)).toEqual([tech.id, supervisor.id, branchSupervisor.id].sort());
    expect(who(unanswered.id)).toEqual([supervisor.id, branchSupervisor.id].sort());
    expect(notices.find((notice) => notice.workOrderId === unanswered.id)!.title).toBe(
      'Work order WO-7 has missed its response target',
    );
    expect(notices).toHaveLength(8);
    expect(notices.find((notice) => notice.workOrderId === missed.id)).toMatchObject({
      title: 'Work order WO-3 has missed its fix target',
      assetId: null,
      requestId: null,
    });
    expect(notices.find((notice) => notice.workOrderId === atRisk.id)!.title).toBe(
      'Work order WO-1 is close to its fix target',
    );
    expect(await owner.outboxMessage.count({ where: { ...where, topic: 'notification.deliver' } })).toBe(8);

    // Running the scan again later sends nothing new, but moving a target allows a fresh alert.
    await notifyWorkOrderSla(db, tenant.id, minutes(now, 2));
    expect(await owner.notification.count({ where })).toBe(8);
    await owner.workOrder.update({ where: { id: missed.id }, data: { fixDueAt: minutes(now, -5) } });
    await notifyWorkOrderSla(db, tenant.id, minutes(now, 2));
    expect(await owner.notification.count({ where })).toBe(11);
    // The risk alert becomes a breach once the time passes, which is a separate alert.
    await notifyWorkOrderSla(db, tenant.id, minutes(now, 45));
    expect(await owner.notification.count({ where: { ...where, workOrderId: atRisk.id } })).toBe(4);
  } finally {
    await owner.outboxMessage.deleteMany({ where });
    await owner.notification.deleteMany({ where });
    await owner.workOrder.deleteMany({ where });
    await owner.membershipSite.deleteMany({ where });
    await owner.location.deleteMany({ where });
    await owner.membership.deleteMany({ where });
    await owner.role.deleteMany({ where });
    await owner.account.deleteMany({ where: { id: { in: accountIds } } });
    await owner.tenant.delete({ where: { id: tenant.id } });
  }
});

it('delivers an alert only while it is still true', async () => {
  const tenant = await owner.tenant.create({
    data: { slug: 'sla-deliver-' + randomUUID(), name: 'SLA delivery test', plan: 'starter' },
  });
  const where = { tenantId: tenant.id };
  const account = await owner.account.create({
    data: { name: 'Supervisor', email: randomUUID() + '@test.example', passwordHash: 'fixture' },
  });
  try {
    await owner.role.create({
      data: {
        ...where,
        key: 'supervisor',
        name: 'Supervisor',
        permissions: ['work_orders.read', 'work_orders.assign'],
        scope: 'all',
      },
    });
    const supervisor = await owner.membership.create({
      data: { ...where, role: 'supervisor', licence: 'full', accountId: account.id },
    });
    const site = await owner.location.create({ data: { ...where, name: 'Main site', code: 'M', kind: 'site' } });
    const now = new Date();
    const due = new Date(now.getTime() - 10 * 60_000);
    const job = await owner.workOrder.create({
      data: {
        ...where,
        number: 'WO-1',
        title: 'Job',
        description: 'Test',
        status: 'on_site',
        attendedAt: now,
        locationId: site.id,
        impact: 2,
        urgency: 2,
        priority: 3,
        fixDueAt: due,
        submissionKey: randomUUID(),
        submissionHash: 'test',
      },
    });
    const deliver = (notificationId: string) =>
      handlers.get('notification.deliver')!(
        { notificationId },
        { db, ...where, messageId: randomUUID(), log: () => {} },
      );
    const queue = () =>
      owner.notification.create({
        data: {
          ...where,
          workOrderId: job.id,
          recipientId: supervisor.id,
          recipientEmail: account.email,
          pushEnabled: false,
          eventKey: slaEventKey(job.id, { target: 'fix', level: 'breach', due }, supervisor.id),
          title: 'Work order WO-1 has missed its fix target',
          body: 'Job at Main site.',
        },
      });

    const live = await queue();
    await deliver(live.id);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({ to: account.email, subject: live.title });
    expect((await owner.notification.findUniqueOrThrow({ where: { id: live.id } })).emailSentAt).not.toBeNull();

    // Paused, finished or moved on by the time it is delivered: nothing is sent and the unsent alert is dropped.
    for (const change of [
      { status: 'paused', pauseReason: 'awaiting_parts', slaPausedAt: now },
      { status: 'completed', pauseReason: null, slaPausedAt: null },
      { status: 'on_site', pauseReason: null, slaPausedAt: null, fixDueAt: new Date(now.getTime() + 3 * 3_600_000) },
    ]) {
      await owner.workOrder.update({ where: { id: job.id }, data: change });
      const stale = await owner.notification.create({
        data: {
          ...where,
          workOrderId: job.id,
          recipientId: supervisor.id,
          recipientEmail: account.email,
          pushEnabled: false,
          eventKey: slaEventKey(job.id, { target: 'fix', level: 'breach', due }, supervisor.id) + ':' + randomUUID(),
          title: 'Stale',
          body: 'Stale',
        },
      });
      vi.clearAllMocks();
      await deliver(stale.id);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(await owner.notification.findUnique({ where: { id: stale.id } })).toBeNull();
    }
  } finally {
    await owner.notification.deleteMany({ where });
    await owner.workOrder.deleteMany({ where });
    await owner.location.deleteMany({ where });
    await owner.membership.deleteMany({ where });
    await owner.role.deleteMany({ where });
    await owner.account.delete({ where: { id: account.id } });
    await owner.tenant.delete({ where: { id: tenant.id } });
  }
});

it('sends no alerts for an organisation whose plan does not include work orders', async () => {
  const tenant = await owner.tenant.create({
    data: { slug: 'sla-plan-' + randomUUID(), name: 'SLA plan test', plan: 'starter' },
  });
  const where = { tenantId: tenant.id };
  try {
    await owner.role.create({
      data: {
        ...where,
        key: 'supervisor',
        name: 'Supervisor',
        permissions: ['work_orders.read', 'work_orders.assign'],
        scope: 'all',
      },
    });
    const account = await owner.account.create({
      data: { name: 'Supervisor', email: randomUUID() + '@test.example', passwordHash: 'fixture' },
    });
    await owner.membership.create({ data: { ...where, role: 'supervisor', licence: 'full', accountId: account.id } });
    const site = await owner.location.create({ data: { ...where, name: 'Main site', code: 'M', kind: 'site' } });
    await owner.locationPath.create({ data: { ...where, ancestorId: site.id, descendantId: site.id } });
    await owner.workOrder.create({
      data: {
        ...where,
        number: 'WO-1',
        title: 'Late job',
        description: 'Test',
        locationId: site.id,
        impact: 2,
        urgency: 2,
        priority: 3,
        fixDueAt: new Date(Date.now() - 3_600_000),
        submissionKey: randomUUID(),
        submissionHash: 'test',
      },
    });
    await notifyWorkOrderSla(db, tenant.id);
    expect(await owner.notification.count({ where })).toBe(1);
    await owner.notification.deleteMany({ where });
    await owner.tenantEntitlement.create({ data: { ...where, feature: 'work_orders', enabled: false } });
    await notifyWorkOrderSla(db, tenant.id);
    expect(await owner.notification.count({ where })).toBe(0);
    await owner.membership.deleteMany({ where });
    await owner.account.delete({ where: { id: account.id } });
  } finally {
    await owner.outboxMessage.deleteMany({ where });
    await owner.notification.deleteMany({ where });
    await owner.workOrder.deleteMany({ where });
    await owner.location.deleteMany({ where });
    await owner.membership.deleteMany({ where });
    await owner.tenantEntitlement.deleteMany({ where });
    await owner.role.deleteMany({ where });
    await owner.tenant.delete({ where: { id: tenant.id } });
  }
});
