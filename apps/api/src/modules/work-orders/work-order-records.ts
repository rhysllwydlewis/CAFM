import { createHash } from 'node:crypto';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { FieldDefinition } from '@cafm/config-engine';
import type { Prisma, Tx } from '@cafm/db';
import {
  SLA_PAUSING_REASONS,
  WORK_ORDER_PAUSE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  workOrderNextStatuses,
  type WorkOrderPauseReason,
  type WorkOrderRecord,
  type WorkOrderStatus,
  type WorkOrderSummary,
} from '@cafm/shared';
import { activeCustomFields, nextNumber, visibleCustom } from '../../core/config';
import type { AuthContext } from '../../core/session';
import { missingWorkOrder, workOrderScope } from './work-order-scope';
import { reportAssetSelect, reportLocationSelect } from '../helpdesk/request-scope';
import { requestTargets, slaSchedule } from '../helpdesk/request-records';
import { elapsedMinutes, requestDeadline } from '../helpdesk/request-sla';

/** Licences that can be given jobs: office staff, and the field and contractor people who do them. */
export const JOB_LICENCES = ['full', 'mobile', 'contractor'] as const;

const memberLabel = { select: { account: { select: { name: true } } } } as const;
export const workOrderRelations = {
  location: { select: reportLocationSelect },
  asset: { select: reportAssetSelect },
  request: { select: { id: true, number: true } },
  assignee: memberLabel,
  createdBy: memberLabel,
  // The contractor the job is with now: the most recent link that has not been withdrawn.
  contractors: { where: { revokedAt: null }, orderBy: [{ createdAt: 'desc' as const }], take: 1 },
} satisfies Prisma.WorkOrderInclude;
export type WorkOrderRow = Prisma.WorkOrderGetPayload<{ include: typeof workOrderRelations }>;

export const PRIORITY_NAMES = ['Emergency', 'Urgent', 'Routine', 'Planned'];
const iso = (date: Date | null) => date?.toISOString() ?? null;

export async function getWorkOrder(tx: Tx, auth: AuthContext, id: string): Promise<WorkOrderRow> {
  const row = await tx.workOrder.findFirst({ where: { ...workOrderScope(auth), id }, include: workOrderRelations });
  if (!row) throw missingWorkOrder();
  return row;
}

export function workOrderSummary(row: WorkOrderRow): WorkOrderSummary {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status as WorkOrderStatus,
    pauseReason: row.pauseReason as WorkOrderPauseReason | null,
    priority: row.priority,
    location: row.location,
    asset: row.asset?.locationId === row.location.id ? row.asset : null,
    request: row.request,
    assigneeId: row.assigneeId,
    assigneeName: row.assignee?.account.name ?? (row.contractors[0] ? row.contractors[0].name + ' (contractor)' : null),
    responseDueAt: iso(row.responseDueAt),
    attendDueAt: iso(row.attendDueAt),
    fixDueAt: iso(row.fixDueAt),
    slaPausedAt: iso(row.slaPausedAt),
    completedAt: iso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Internal notes are for the organisation's own people. A contractor or client with an account never sees them. */
const OUTSIDE_LICENCES = ['contractor', 'client'];

export async function workOrderDetail(
  tx: Tx,
  row: WorkOrderRow,
  auth: AuthContext,
): Promise<WorkOrderRecord<FieldDefinition>> {
  const [entries, fields] = await Promise.all([
    tx.workOrderEntry.findMany({
      where: {
        tenantId: row.tenantId,
        workOrderId: row.id,
        ...(OUTSIDE_LICENCES.includes(auth.membership!.licence) ? { internal: false } : {}),
      },
      include: { author: memberLabel },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    activeCustomFields(tx, row.tenantId, 'work_order'),
  ]);
  const custom = visibleCustom(row.custom, fields);
  return {
    ...workOrderSummary(row),
    version: row.version,
    type: row.type,
    slaPausedMinutes: row.slaPausedMinutes,
    description: row.description,
    impact: row.impact,
    urgency: row.urgency,
    createdByName: row.createdBy?.account.name ?? null,
    firstResponseAt: iso(row.firstResponseAt),
    attendedAt: iso(row.attendedAt),
    verifiedAt: iso(row.verifiedAt),
    closedAt: iso(row.closedAt),
    contractor: row.contractors[0]
      ? {
          name: row.contractors[0].name,
          email: row.contractors[0].email,
          expiresAt: row.contractors[0].expiresAt.toISOString(),
          lastUsedAt: iso(row.contractors[0].lastUsedAt),
        }
      : null,
    customFields: [...fields.values()].flatMap((definition) => {
      const value = custom[definition.key];
      return value == null ? [] : [{ definition, value }];
    }),
    nextStatuses: workOrderNextStatuses(row.status as WorkOrderStatus, auth.access!.permissions),
    entries: entries.map(({ id, kind, body, internal, author, actorName, createdAt }) => ({
      id,
      kind,
      body,
      internal,
      author: author?.account.name ?? actorName,
      createdAt: createdAt.toISOString(),
    })),
  };
}

/**
 * Whether this member can do jobs at the location: an active person with a full, mobile or contractor licence whose role can
 * see and work on jobs, with access to the location (everywhere, or a granted site above it).
 */
export async function eligibleTechnician(tx: Tx, tenantId: string, id: string, locationId: string) {
  const member = await tx.membership.findFirst({
    where: { tenantId, id, status: 'active', licence: { in: [...JOB_LICENCES] } },
    select: { role: true, locationScoped: true },
  });
  if (!member) return false;
  const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: member.role } } });
  if (!role?.permissions.includes('work_orders.read')) return false;
  if (!role.permissions.includes('work_orders.close') && !role.permissions.includes('work_orders.edit')) return false;
  if (role.scope === 'all' && (!member.locationScoped || member.role === 'super_user')) return true;
  return !!(await tx.membershipSite.findFirst({
    where: { tenantId, membershipId: id, location: { descendants: { some: { descendantId: locationId } } } },
    select: { membershipId: true },
  }));
}

/** A stable fingerprint of what was submitted, so a retry of the same call returns the same jobs. */
export const submissionHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export interface NewWorkOrder {
  submissionKey: string;
  submissionHash: string;
  title: string;
  description: string;
  locationId: string;
  assetId: string | null;
  requestId: string | null;
  assigneeId: string | null;
  impact: number;
  urgency: number;
  custom: Prisma.InputJsonObject;
  /** Request targets carry over, so the clock keeps running from when the problem was reported. */
  from?: {
    createdAt: Date;
    targets?: Awaited<ReturnType<typeof requestTargets>>;
    /** When the requester was first answered. Work raised from a request has already had its response. */
    respondedAt?: Date;
  };
}

/** Creates the job and its first timeline entry. Checks that location, asset and assignee belong together. */
export async function insertWorkOrder(tx: Tx, auth: AuthContext, input: NewWorkOrder) {
  const tenantId = auth.membership!.tenantId;
  const location = await tx.location.findFirst({
    where: { tenantId, id: input.locationId, kind: { notIn: ['portfolio', 'region'] }, status: 'open' },
    select: { id: true },
  });
  if (!location) throw new NotFoundException('Open location not found.');
  if (input.assetId) {
    const asset = await tx.asset.findFirst({
      where: { tenantId, id: input.assetId, locationId: location.id, status: { not: 'decommissioned' } },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('Asset not found at this location.');
  }
  if (input.assigneeId && !(await eligibleTechnician(tx, tenantId, input.assigneeId, location.id))) {
    throw new NotFoundException('Available assignee not found.');
  }
  const site = await tx.locationPath.findFirst({
    where: { tenantId, descendantId: location.id, ancestor: { kind: 'site', status: 'open' } },
    select: { ancestor: { select: { code: true, siteCalendar: true } } },
  });
  if (!site) throw new UnprocessableEntityException('Choose a location within an open site.');
  const start = input.from?.createdAt ?? new Date();
  const targets =
    input.from?.targets ??
    (await requestTargets(tx, tenantId, input.impact, input.urgency, start, site.ancestor.siteCalendar));
  const status: WorkOrderStatus = input.assigneeId ? 'assigned' : 'logged';
  const row = await tx.workOrder.create({
    data: {
      tenantId,
      number: await nextNumber(tx, tenantId, 'work_order', { SITE: site.ancestor.code }),
      title: input.title,
      description: input.description,
      status,
      // Giving the job to someone is the response. So is raising it from a request, which has been answered.
      firstResponseAt: input.from?.respondedAt ?? (input.assigneeId ? start : null),
      locationId: location.id,
      assetId: input.assetId,
      requestId: input.requestId,
      assigneeId: input.assigneeId,
      createdById: auth.membership!.id,
      impact: input.impact,
      urgency: input.urgency,
      custom: input.custom,
      submissionKey: input.submissionKey,
      submissionHash: input.submissionHash,
      ...targets,
    },
    include: workOrderRelations,
  });
  await tx.workOrderEntry.create({
    data: {
      tenantId,
      workOrderId: row.id,
      authorId: auth.membership!.id,
      kind: 'status',
      body: input.requestId ? 'Raised from a Helpdesk request' : 'Work order raised',
    },
  });
  return row;
}

const minutesText = (minutes: number) =>
  minutes < 60 ? minutes + ' min' : Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';

/** The timeline line for a status step, saying when the step also stopped or restarted the SLA clock. */
export function statusEntryBody(
  to: WorkOrderStatus,
  pauseReason: WorkOrderPauseReason | undefined,
  note: string | undefined,
  clockNote: string | null,
) {
  return [WORK_ORDER_STATUS_LABELS[to], pauseReason ? WORK_ORDER_PAUSE_LABELS[pauseReason] : null, note, clockNote]
    .filter(Boolean)
    .join(' · ');
}

/** What the clock-and-status change needs to know about the job before the step. */
export interface StatusChangeJob {
  tenantId: string;
  locationId: string;
  impact: number;
  urgency: number;
  firstResponseAt: Date | null;
  attendedAt: Date | null;
  completedAt: Date | null;
  attendDueAt: Date | null;
  fixDueAt: Date | null;
  slaPausedAt: Date | null;
  slaPausedMinutes: number;
}

/**
 * The change a status step makes to the job, shared by staff and by contractors on a link: the times
 * the targets are measured against, whether the step reopens a finished job, and the SLA clock.
 *
 * Pausing for a reason that stops the clock records when. Leaving the pause moves the attendance and fix
 * targets out by the business time that was lost, so the people doing the work are not held to time spent
 * waiting on something outside their control.
 */
export async function statusChange(
  tx: Tx,
  before: StatusChangeJob,
  current: WorkOrderStatus,
  to: WorkOrderStatus,
  pauseReason: WorkOrderPauseReason | undefined,
  now: Date,
) {
  const reopened = to === 'on_site' && (current === 'completed' || current === 'verified');
  const stopsClock = to === 'paused' && !!pauseReason && SLA_PAUSING_REASONS.includes(pauseReason);
  const clock: Prisma.WorkOrderUpdateInput = {};
  let clockNote: string | null = null;
  if (stopsClock) {
    clock.slaPausedAt = now;
    clockNote = 'SLA clock stopped';
  } else if (before.slaPausedAt) {
    const site = await tx.locationPath.findFirst({
      where: { tenantId: before.tenantId, descendantId: before.locationId, ancestor: { kind: 'site' } },
      select: { ancestor: { select: { siteCalendar: true } } },
    });
    const { schedule } = await slaSchedule(
      tx,
      before.tenantId,
      before.impact,
      before.urgency,
      site?.ancestor.siteCalendar,
    );
    const lost = elapsedMinutes(before.slaPausedAt, now, schedule);
    clock.slaPausedAt = null;
    clock.slaPausedMinutes = before.slaPausedMinutes + Math.ceil(lost);
    clockNote =
      Math.ceil(lost) > 0
        ? `SLA clock restarted, ${minutesText(Math.ceil(lost))} added to the targets`
        : 'SLA clock restarted';
    // A target that has already been met doesn't move.
    if (before.attendDueAt && !before.attendedAt)
      clock.attendDueAt = requestDeadline(before.attendDueAt, lost, schedule);
    if (before.fixDueAt && !before.completedAt) clock.fixDueAt = requestDeadline(before.fixDueAt, lost, schedule);
  }
  const data = {
    status: to,
    pauseReason: to === 'paused' ? (pauseReason ?? null) : null,
    firstResponseAt: before.firstResponseAt ?? now,
    ...(to === 'on_site' && !before.attendedAt ? { attendedAt: now } : {}),
    ...(to === 'completed' ? { completedAt: now } : {}),
    ...(to === 'verified' ? { verifiedAt: now } : {}),
    ...(to === 'closed' ? { closedAt: now } : {}),
    ...(reopened ? { completedAt: null, verifiedAt: null } : {}),
    ...clock,
  };
  return { reopened, data, clockNote };
}
