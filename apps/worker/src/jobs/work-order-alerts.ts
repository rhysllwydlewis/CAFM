import type { Queue } from 'bullmq';
import { hasAllLocationAccess, withTenant, type PrismaClient, type Tx } from '@fmstead/db';
import { resolveEntitlements, WORK_ORDER_FINISHED, type WorkOrderStatus } from '@fmstead/shared';
import { register } from '../handlers';
import type { JobData } from '../index';

/** At most this long before a target, an alert says the job is at risk. */
export const AT_RISK_MS = 60 * 60_000;
/** A target of a few minutes, such as an emergency's, is at risk for a quarter of its length, not for an hour. */
const AT_RISK_SHARE = 0.25;
const BATCH = 100;
export const WORK_ORDER_SLA_SCHEDULE = { every: 5 * 60_000 };

export type SlaTarget = 'respond' | 'attend' | 'fix';
export type SlaLevel = 'risk' | 'breach';
export interface SlaAlert {
  target: SlaTarget;
  level: SlaLevel;
  due: Date;
}

const TARGET_LABELS: Record<SlaTarget, string> = { respond: 'response', attend: 'attendance', fix: 'fix' };
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/London',
});

/**
 * Which targets a job needs an alert for right now. A job whose clock is stopped by a pause, or which is
 * finished, is not running late.
 */
export function slaAlerts(
  job: {
    status: string;
    createdAt: Date;
    slaPausedAt: Date | null;
    firstResponseAt: Date | null;
    responseDueAt: Date | null;
    attendedAt: Date | null;
    attendDueAt: Date | null;
    fixDueAt: Date | null;
  },
  now: Date,
): SlaAlert[] {
  if (job.slaPausedAt || WORK_ORDER_FINISHED.includes(job.status as WorkOrderStatus)) return [];
  const alerts: SlaAlert[] = [];
  const check = (target: SlaTarget, due: Date | null) => {
    if (!due) return;
    const left = due.getTime() - now.getTime();
    const window = Math.min(AT_RISK_MS, Math.max(0, due.getTime() - job.createdAt.getTime()) * AT_RISK_SHARE);
    if (left <= 0) alerts.push({ target, level: 'breach', due });
    else if (left <= window) alerts.push({ target, level: 'risk', due });
  };
  // Response stops mattering once someone has picked the job up, and attendance once someone has been on site.
  if (!job.firstResponseAt) check('respond', job.responseDueAt);
  if (!job.attendedAt) check('attend', job.attendDueAt);
  check('fix', job.fixDueAt);
  return alerts;
}

/** The stable key that stops the same alert being sent twice. It carries the target time, so moving a target re-arms it. */
export const slaEventKey = (jobId: string, alert: SlaAlert, memberId: string) =>
  `work_order.sla:${jobId}:${alert.target}:${alert.level}:${alert.due.getTime()}:${memberId}`;

async function alertBatch(tx: Tx, tenantId: string, now: Date, after?: string) {
  const soon = new Date(now.getTime() + AT_RISK_MS);
  const jobs = await tx.workOrder.findMany({
    where: {
      tenantId,
      status: { notIn: [...WORK_ORDER_FINISHED] },
      slaPausedAt: null,
      OR: [
        { firstResponseAt: null, responseDueAt: { lte: soon } },
        { attendedAt: null, attendDueAt: { lte: soon } },
        { fixDueAt: { lte: soon } },
      ],
      ...(after && { id: { gt: after } }),
    },
    orderBy: { id: 'asc' },
    take: BATCH,
    include: { location: { select: { name: true } } },
  });
  const due = jobs.flatMap((job) => {
    const alerts = slaAlerts(job, now);
    return alerts.length ? [{ job, alerts }] : [];
  });
  if (!due.length) return jobs;

  // Supervisors are the people who can assign work, within the part of the estate each can see.
  const roles = await tx.role.findMany({
    where: { tenantId, permissions: { hasEvery: ['work_orders.assign', 'work_orders.read'] } },
    select: { key: true, scope: true },
  });
  const scopes = new Map(roles.map(({ key, scope }) => [key, scope]));
  const assigneeIds = [...new Set(due.flatMap(({ job }) => (job.assigneeId ? [job.assigneeId] : [])))];
  const members = await tx.membership.findMany({
    where: {
      tenantId,
      status: 'active',
      OR: [{ role: { in: [...scopes.keys()] } }, { id: { in: assigneeIds } }],
    },
    select: {
      id: true,
      tenantId: true,
      role: true,
      locationScoped: true,
      account: { select: { email: true } },
      sites: { select: { locationId: true } },
    },
  });
  const ancestors = await tx.locationPath.findMany({
    where: { tenantId, descendantId: { in: [...new Set(due.map(({ job }) => job.locationId))] } },
    select: { ancestorId: true, descendantId: true },
  });
  const ancestry = new Map<string, Set<string>>();
  for (const { descendantId, ancestorId } of ancestors) {
    if (!ancestry.has(descendantId)) ancestry.set(descendantId, new Set());
    ancestry.get(descendantId)!.add(ancestorId);
  }
  const byId = new Map(members.map((member) => [member.id, member]));

  for (const { job, alerts } of due) {
    const grants = ancestry.get(job.locationId);
    const supervisors = members.filter(
      (member) =>
        scopes.has(member.role) &&
        (hasAllLocationAccess(member, scopes.get(member.role)) ||
          member.sites.some(({ locationId }) => grants?.has(locationId))),
    );
    const assignee = job.assigneeId ? byId.get(job.assigneeId) : undefined;
    for (const alert of alerts) {
      // At risk is for whoever has the job, or for supervisors when nobody does. A breach goes to both.
      const audience =
        alert.level === 'risk'
          ? assignee
            ? [assignee]
            : supervisors
          : [
              ...new Map(
                [...(assignee ? [assignee] : []), ...supervisors].map((member) => [member.id, member]),
              ).values(),
            ];
      if (!audience.length) continue;
      const label = TARGET_LABELS[alert.target];
      const when = DATE_TIME.format(alert.due);
      const rows = audience.map((member) => ({
        tenantId,
        workOrderId: job.id,
        recipientId: member.id,
        recipientEmail: member.account.email,
        eventKey: slaEventKey(job.id, alert, member.id),
        title:
          alert.level === 'breach'
            ? `Work order ${job.number} has missed its ${label} target`
            : `Work order ${job.number} is close to its ${label} target`,
        body: `${job.title} at ${job.location.name}. The ${label} target ${alert.level === 'breach' ? 'was' : 'is'} ${when}.`,
      }));
      const created = await tx.notification.createManyAndReturn({
        data: rows,
        skipDuplicates: true,
        select: { id: true },
      });
      if (created.length)
        await tx.outboxMessage.createMany({
          data: created.map(({ id }) => ({ tenantId, topic: 'notification.deliver', payload: { notificationId: id } })),
        });
    }
  }
  return jobs;
}

export async function notifyWorkOrderSla(db: PrismaClient, tenantId: string, now = new Date()) {
  let after: string | undefined;
  do {
    const rows = await withTenant(db, tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId, status: 'active' },
        include: { entitlements: true },
      });
      if (!tenant || !resolveEntitlements(tenant.plan, tenant.entitlements).features.includes('work_orders')) return [];
      return alertBatch(tx, tenantId, now, after);
    });
    after = rows.length === BATCH ? rows.at(-1)?.id : undefined;
  } while (after);
}

register('work-order.sla-scan', async (_payload, ctx) => {
  const now = new Date();
  let after: string | undefined;
  let failed = 0;
  do {
    const tenants = await ctx.db.tenant.findMany({
      where: { status: 'active', ...(after && { id: { gt: after } }) },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true },
    });
    for (const { id } of tenants) {
      try {
        await notifyWorkOrderSla(ctx.db, id, now);
      } catch (error) {
        failed++;
        ctx.log(
          `work order SLA scan failed for tenant ${id}: ${error instanceof Error ? error.name : 'unknown error'}`,
        );
      }
    }
    after = tenants.length === BATCH ? tenants.at(-1)?.id : undefined;
  } while (after);
  if (failed) throw new Error(`Could not finish work order alerts for ${failed} organisation(s).`);
});

export async function scheduleWorkOrderAlerts(queue: Queue<JobData>) {
  await queue.upsertJobScheduler('work-order-sla', WORK_ORDER_SLA_SCHEDULE, {
    name: 'work-order.sla-scan',
    data: { messageId: 'work-order-sla', tenantId: null, payload: {} },
    opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 30, removeOnFail: 90 },
  });
}
