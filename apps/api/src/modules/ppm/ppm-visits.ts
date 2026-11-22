import type { Tx } from '@cafm/db';
import {
  addInterval,
  nextOccurrenceAfter,
  WORK_ORDER_FINISHED,
  type PpmCalendarUnit,
  type PpmCompliance,
  type PpmVisitState,
} from '@cafm/shared';
import type { AuthContext } from '../../core/session';
import { assetScope } from '../assets/asset-scope';

/** The parts of a schedule that decide where its visits fall. */
export interface VisitSchedule {
  id: string;
  freqType: string;
  calendarUnit: string | null;
  interval: number | null;
  startsOn: Date;
  mode: string;
  assigneeId: string | null;
}

/** One visit to one asset: raised as a job, or still to come. */
export interface Visit {
  scheduleId: string;
  date: string;
  state: PpmVisitState;
  /** Whether someone has been, or will be, given the visit. */
  assigned: boolean;
  jobId: string | null;
}

const dayOf = (value: Date) => value.toISOString().slice(0, 10);
/**
 * The most visits projected for one asset in a view. A daily schedule over the longest window the planner and forecast
 * allow (36 months) is about 1,100; more than this would be a mistake in the schedule, not a plan.
 */
const MAX_PROJECTED = 1100;
const DONE = ['completed', 'verified', 'closed'];

/**
 * The dates a calendar schedule will fall due after the one next due, up to a date. A fixed schedule keeps to its
 * anchor. A floating one is counted on from each visit, which assumes each is done on its day.
 */
export function projectDates(nextDueOn: string, schedule: VisitSchedule, to: string): string[] {
  if (schedule.freqType !== 'calendar') return [];
  const unit = schedule.calendarUnit as PpmCalendarUnit;
  const interval = schedule.interval!;
  const anchor = dayOf(schedule.startsOn);
  const dates: string[] = [];
  let date = nextDueOn;
  while (date <= to && dates.length < MAX_PROJECTED) {
    dates.push(date);
    date =
      schedule.mode === 'fixed' ? nextOccurrenceAfter(anchor, unit, interval, date) : addInterval(date, unit, interval);
  }
  return dates;
}

/**
 * Every visit between two dates for the given schedules, as this person can see them: the jobs raised, and the visits
 * still to come from each asset's next date. A job open and late from before the window is included, so it isn't lost
 * off the left edge. Meter schedules have no dates to project and show only as raised jobs.
 */
export async function loadVisits(
  tx: Tx,
  auth: AuthContext,
  schedules: VisitSchedule[],
  from: string,
  to: string,
  today: string,
): Promise<Visit[]> {
  const tenantId = auth.membership!.tenantId;
  if (!schedules.length) return [];
  const ids = schedules.map((schedule) => schedule.id);
  const byId = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const [rows, jobs] = await Promise.all([
    tx.ppmScheduleAsset.findMany({
      where: {
        tenantId,
        active: true,
        scheduleId: { in: ids },
        // A decommissioned asset is never raised, so it isn't planned either.
        asset: { ...assetScope(auth), status: { not: 'decommissioned' } },
      },
      select: { id: true, scheduleId: true, nextDueOn: true },
    }),
    tx.workOrder.findMany({
      where: {
        tenantId,
        type: 'ppm',
        status: { not: 'cancelled' },
        ppmScheduleAsset: { scheduleId: { in: ids } },
        asset: assetScope(auth),
        OR: [
          { scheduledFor: { gte: new Date(from + 'T00:00:00Z'), lte: new Date(to + 'T00:00:00Z') } },
          { scheduledFor: { lt: new Date(from + 'T00:00:00Z') }, status: { notIn: [...WORK_ORDER_FINISHED] } },
        ],
      },
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        assigneeId: true,
        ppmScheduleAsset: { select: { scheduleId: true } },
      },
    }),
  ]);
  const visits: Visit[] = [];
  for (const job of jobs) {
    const date = dayOf(job.scheduledFor!);
    const open = !DONE.includes(job.status);
    visits.push({
      scheduleId: job.ppmScheduleAsset!.scheduleId,
      date,
      state: open ? (date < today ? 'overdue' : 'due') : 'completed',
      assigned: !!job.assigneeId,
      jobId: job.id,
    });
  }
  // A floating calendar schedule has no next date while its visit is waiting to be done. It is counted on from that
  // visit, on the same assumption that it is done on its day.
  const waiting = rows.filter(
    (row) =>
      !row.nextDueOn &&
      byId.get(row.scheduleId)!.freqType === 'calendar' &&
      byId.get(row.scheduleId)!.mode === 'floating',
  );
  const outstanding = new Map<string, string>();
  if (waiting.length) {
    const open = await tx.workOrder.findMany({
      where: {
        tenantId,
        ppmScheduleAssetId: { in: waiting.map((row) => row.id) },
        status: { notIn: [...WORK_ORDER_FINISHED] },
      },
      select: { ppmScheduleAssetId: true, scheduledFor: true },
    });
    for (const job of open) {
      const key = job.ppmScheduleAssetId!;
      const date = dayOf(job.scheduledFor!);
      if (!outstanding.has(key) || date > outstanding.get(key)!) outstanding.set(key, date);
    }
  }
  for (const row of rows) {
    const schedule = byId.get(row.scheduleId)!;
    let first = row.nextDueOn ? dayOf(row.nextDueOn) : null;
    if (!first) {
      const raised = outstanding.get(row.id);
      if (!raised) continue;
      first = addInterval(raised, schedule.calendarUnit as PpmCalendarUnit, schedule.interval!);
    }
    for (const date of projectDates(first, schedule, to)) {
      visits.push({
        scheduleId: schedule.id,
        date,
        state: date < today ? 'overdue' : 'scheduled',
        assigned: !!schedule.assigneeId,
        jobId: null,
      });
    }
  }
  return visits.sort((a, b) => a.date.localeCompare(b.date) || a.scheduleId.localeCompare(b.scheduleId));
}

/**
 * On-time compliance for visits that fell due in a window. A visit done on or before its due day was on time; one done
 * after was late; one not done whose day has passed is overdue. Visits not yet due, and cancelled ones, don't count.
 */
export function compliance(
  jobs: { status: string; scheduledFor: Date; completedAt: Date | null }[],
  today: string,
  toLocalDay: (instant: Date) => string,
): PpmCompliance {
  let onTime = 0;
  let late = 0;
  let overdue = 0;
  for (const job of jobs) {
    const due = dayOf(job.scheduledFor);
    if (job.status === 'cancelled') continue;
    if (DONE.includes(job.status)) {
      if (job.completedAt && toLocalDay(job.completedAt) <= due) onTime += 1;
      else late += 1;
    } else if (due < today) {
      overdue += 1;
    }
  }
  const total = onTime + late + overdue;
  return { percent: total ? Math.round((onTime / total) * 1000) / 10 : null, onTime, late, overdue };
}
