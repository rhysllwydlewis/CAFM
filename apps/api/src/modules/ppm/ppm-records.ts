import { hasAllLocationAccess, PPM_TIME_ZONE, type Prisma, type Tx } from '@cafm/db';
import {
  localDate,
  WORK_ORDER_FINISHED,
  type ChecklistItemInput,
  type PpmCalendarUnit,
  type PpmCriticality,
  type PpmFrequency,
  type PpmMode,
  type PpmScheduleAssetRow,
  type PpmScheduleRecord,
  type PpmSort,
  type PpmScheduleSummary,
  type PpmTaskTemplate,
  type PpmVisitState,
} from '@cafm/shared';
import type { AuthContext } from '../../core/session';
import { assetScope } from '../assets/asset-scope';
import { missingSchedule } from './ppm-scope';

const memberLabel = { select: { account: { select: { name: true } } } } as const;
const dayOf = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export const today = () => localDate(new Date(), PPM_TIME_ZONE);

export function toTemplate(row: Prisma.PpmTaskTemplateGetPayload<object>, schedules: number): PpmTaskTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    discipline: row.discipline,
    criticality: row.criticality as PpmCriticality,
    durationMinutes: row.durationMinutes,
    skills: row.skills,
    safetyNotes: row.safetyNotes,
    steps: row.steps as ChecklistItemInput[],
    active: row.active,
    version: row.version,
    schedules,
  };
}

type ScheduleRow = Prisma.PpmScheduleGetPayload<{ include: { assignee: typeof memberLabel; template: true } }>;

export const scheduleInclude = { assignee: memberLabel, template: true } satisfies Prisma.PpmScheduleInclude;

function frequencyOf(row: ScheduleRow): PpmFrequency {
  return row.freqType === 'meter'
    ? { type: 'meter', meterName: row.meterName!, interval: row.meterInterval!.toString() }
    : { type: 'calendar', unit: row.calendarUnit as PpmCalendarUnit, interval: row.interval! };
}

/** The rows of a schedule that this person can see, with the jobs they have open. */
async function visibleRows(tx: Tx, auth: AuthContext, scheduleIds: string[]) {
  const tenantId = auth.membership!.tenantId;
  return tx.ppmScheduleAsset.findMany({
    where: { tenantId, scheduleId: { in: scheduleIds }, active: true, asset: assetScope(auth) },
    include: {
      asset: { select: { id: true, number: true, name: true, location: { select: { id: true, name: true } } } },
      workOrders: {
        where: { status: { notIn: [...WORK_ORDER_FINISHED] } },
        orderBy: [{ scheduledFor: 'asc' }],
        select: { id: true, number: true, status: true, scheduledFor: true },
      },
    },
    orderBy: [{ asset: { number: 'asc' } }],
  });
}

type VisibleRow = Awaited<ReturnType<typeof visibleRows>>[number];

/** Where a row is: a job open and late, a job open, a visit to come, or nothing waiting. */
function stateOf(row: VisibleRow, now: string): PpmVisitState | null {
  const job = row.workOrders[0];
  if (job?.scheduledFor) return dayOf(job.scheduledFor)! < now ? 'overdue' : 'due';
  if (row.nextDueOn || row.nextDueTotal) return 'scheduled';
  return row.lastDoneOn ? 'completed' : null;
}

function summarise(row: ScheduleRow, rows: VisibleRow[], now: string): PpmScheduleSummary {
  const dates = rows
    .map((r) => dayOf(r.nextDueOn))
    .filter((d): d is string => !!d)
    .sort();
  return {
    id: row.id,
    version: row.version,
    number: row.number,
    title: row.title,
    discipline: row.discipline,
    criticality: row.criticality as PpmCriticality,
    frequency: frequencyOf(row),
    mode: row.mode as PpmMode,
    active: row.active,
    assets: rows.length,
    nextDueOn: dates[0] ?? null,
    overdue: rows.filter((r) => stateOf(r, now) === 'overdue').length,
    assigneeName: row.assignee?.account.name ?? null,
  };
}

export interface ScheduleFilters {
  q?: string;
  criticality?: string;
  active?: boolean;
  discipline?: string;
}

/**
 * The schedules this person can see. A schedule is shown when any of its assets is in a branch they can see, and
 * only those assets count in it.
 */
export async function listSchedules(
  tx: Tx,
  auth: AuthContext,
  filters: ScheduleFilters,
  limit: number,
  offset: number,
  order: { sort: PpmSort; dir: 'asc' | 'desc' } = { sort: 'number', dir: 'asc' },
) {
  const tenantId = auth.membership!.tenantId;
  const scope = assetScope(auth);
  // A schedule is shown to someone limited to sites only when one of its assets is on their sites.
  const unrestricted = hasAllLocationAccess(auth.membership!, auth.access?.scope);
  const where: Prisma.PpmScheduleWhereInput = {
    tenantId,
    ...(filters.active === undefined ? {} : { active: filters.active }),
    ...(filters.criticality ? { criticality: filters.criticality } : {}),
    ...(filters.discipline ? { discipline: filters.discipline } : {}),
    AND: [
      ...(filters.q
        ? [
            {
              OR: [
                { title: { contains: filters.q, mode: 'insensitive' as const } },
                { number: { contains: filters.q, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
      ...(unrestricted ? [] : [{ rows: { some: { active: true, asset: scope } } }]),
    ],
  };
  const [total, schedules] = await Promise.all([
    tx.ppmSchedule.count({ where }),
    tx.ppmSchedule.findMany({
      where,
      include: scheduleInclude,
      orderBy: [{ [order.sort]: order.dir }, { id: order.dir }],
      take: limit,
      skip: offset,
    }),
  ]);
  const rows = await visibleRows(
    tx,
    auth,
    schedules.map((s) => s.id),
  );
  const now = today();
  return {
    total,
    items: schedules.map((s) =>
      summarise(
        s,
        rows.filter((r) => r.scheduleId === s.id),
        now,
      ),
    ),
  };
}

export async function getScheduleRecord(tx: Tx, auth: AuthContext, id: string): Promise<PpmScheduleRecord> {
  const tenantId = auth.membership!.tenantId;
  const schedule = await tx.ppmSchedule.findFirst({ where: { tenantId, id }, include: scheduleInclude });
  if (!schedule) throw missingSchedule();
  const rows = await visibleRows(tx, auth, [id]);
  if (!hasAllLocationAccess(auth.membership!, auth.access?.scope) && rows.length === 0) throw missingSchedule();
  const now = today();
  const meterTotals = new Map<string, string>();
  if (schedule.freqType === 'meter' && rows.length) {
    const readings = await tx.assetMeterReading.findMany({
      where: { tenantId, meter: { name: schedule.meterName!, assetId: { in: rows.map((r) => r.assetId) } } },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      select: { total: true, meter: { select: { assetId: true } } },
    });
    for (const reading of readings) {
      if (!meterTotals.has(reading.meter.assetId)) meterTotals.set(reading.meter.assetId, reading.total.toString());
    }
  }
  const summary = summarise(schedule, rows, now);
  const template = schedule.template;
  return {
    ...summary,
    description: template?.description ?? null,
    templateId: schedule.templateId,
    templateName: template?.name ?? null,
    startsOn: dayOf(schedule.startsOn)!,
    leadDays: schedule.leadDays,
    durationMinutes: schedule.durationMinutes,
    priority: schedule.priority,
    assigneeId: schedule.assigneeId,
    // Money is for people who can see costs, as everywhere else.
    estimatedCostMinor: auth.access?.permissions.has('costs.read') ? schedule.estimatedCostMinor : null,
    currency: schedule.currency,
    safetyNotes: template?.safetyNotes ?? null,
    skills: template?.skills ?? null,
    steps: (template?.steps ?? []) as ChecklistItemInput[],
    rows: rows.map((row): PpmScheduleAssetRow => ({
      id: row.id,
      asset: { id: row.asset.id, number: row.asset.number, name: row.asset.name },
      location: row.asset.location,
      lastDoneOn: dayOf(row.lastDoneOn),
      nextDueOn: dayOf(row.nextDueOn),
      nextDueTotal: row.nextDueTotal?.toString() ?? null,
      currentTotal: meterTotals.get(row.assetId) ?? null,
      openJob: row.workOrders[0]
        ? {
            id: row.workOrders[0].id,
            number: row.workOrders[0].number,
            status: row.workOrders[0].status,
            scheduledFor: dayOf(row.workOrders[0].scheduledFor)!,
          }
        : null,
      state: stateOf(row, now),
    })),
  };
}
