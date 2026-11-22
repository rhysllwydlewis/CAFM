import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  addInterval,
  daysBetween,
  endOfLocalDay,
  firstOccurrenceOnOrAfter,
  nextOccurrenceAfter,
  type ChecklistGate,
  type PpmCalendarUnit,
} from '@cafm/shared';
import type { Tx } from './index';
import { nextNumber } from './numbering';

/** Where the dates of PPM visits are read from the clock: the UK. */
export const PPM_TIME_ZONE = 'Europe/London';
/** A schedule with a long lead and a short interval would raise a great many jobs at once. This caps one run. */
const MAX_PER_ROW_PER_RUN = 12;
const TITLE_LIMIT = 160;

const dayOf = (value: Date) => value.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(value + 'T00:00:00Z');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Serialises PPM work with every other job write for the tenant, which is the lock the API takes. */
async function lock(tx: Tx, tenantId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'work_orders:' + tenantId}))`;
}

/** The latest cumulative reading on an asset's meter, or null when it has none. */
async function currentTotal(tx: Tx, tenantId: string, assetId: string, meterName: string) {
  const reading = await tx.assetMeterReading.findFirst({
    where: { tenantId, meter: { assetId, name: meterName } },
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    select: { total: true },
  });
  return reading?.total ?? null;
}

export interface PpmGenerateResult {
  created: number;
  /** Visits already raised, or not yet due. */
  skipped: number;
  jobs: string[];
}

/**
 * Raises a work order for each visit that falls due within its lead time, and moves the schedule on. Safe to run
 * again and again: a visit already raised (the same asset and due day) is never raised twice. Call it inside a
 * `withTenant` transaction. `today` is a calendar day in the UK.
 */
export async function generatePpm(
  tx: Tx,
  options: { tenantId: string; today: string; scheduleId?: string },
): Promise<PpmGenerateResult> {
  const { tenantId, today } = options;
  await lock(tx, tenantId);
  const rows = await tx.ppmScheduleAsset.findMany({
    where: {
      tenantId,
      active: true,
      schedule: { active: true, ...(options.scheduleId ? { id: options.scheduleId } : {}) },
      asset: { status: { not: 'decommissioned' } },
    },
    include: {
      schedule: {
        include: {
          template: true,
          assignee: { select: { status: true } },
        },
      },
      asset: { select: { id: true, name: true, locationId: true } },
    },
    orderBy: [{ nextDueOn: 'asc' }, { id: 'asc' }],
  });

  const result: PpmGenerateResult = { created: 0, skipped: 0, jobs: [] };
  for (const row of rows) {
    const { schedule } = row;
    const due: string[] = [];
    if (schedule.freqType === 'calendar') {
      let next = row.nextDueOn ? dayOf(row.nextDueOn) : null;
      const unit = schedule.calendarUnit as PpmCalendarUnit;
      while (next && daysBetween(today, next) <= schedule.leadDays && due.length < MAX_PER_ROW_PER_RUN) {
        due.push(next);
        // A floating schedule waits for this visit to be done before the next is worked out.
        next =
          schedule.mode === 'fixed'
            ? nextOccurrenceAfter(dayOf(schedule.startsOn), unit, schedule.interval!, next)
            : null;
      }
    } else if (row.nextDueTotal && schedule.meterName) {
      const total = await currentTotal(tx, tenantId, row.assetId, schedule.meterName);
      if (total && total.gte(row.nextDueTotal)) due.push(today);
    }
    if (!due.length) {
      result.skipped += 1;
      continue;
    }

    const site = await tx.locationPath.findFirst({
      where: { tenantId, descendantId: row.asset.locationId, ancestor: { kind: 'site' } },
      select: { ancestor: { select: { siteCalendar: true } } },
    });
    const zone = (site?.ancestor.siteCalendar as { timeZone?: string } | null)?.timeZone ?? PPM_TIME_ZONE;
    const assigneeUsable = !!schedule.assignee && schedule.assignee.status === 'active';
    for (const dueOn of due) {
      const raised = await tx.workOrder.findFirst({
        where: { tenantId, ppmScheduleAssetId: row.id, scheduledFor: asDate(dueOn) },
        select: { id: true },
      });
      if (raised) {
        result.skipped += 1;
        continue;
      }
      const steps = (schedule.template?.steps ?? []) as {
        label: string;
        kind: string;
        required?: boolean;
        unit?: string;
      }[];
      const notes = [
        schedule.template?.description,
        steps.length ? 'Work through the checklist on this job.' : null,
        schedule.template?.skills ? `Skills: ${schedule.template.skills}` : null,
        schedule.template?.safetyNotes ? `Safety: ${schedule.template.safetyNotes}` : null,
      ].filter(Boolean);
      const job = await tx.workOrder.create({
        data: {
          tenantId,
          number: await nextNumber(tx, tenantId, 'work_order'),
          type: 'ppm',
          title: `${schedule.title} · ${row.asset.name}`.slice(0, TITLE_LIMIT),
          description: notes.length ? notes.join('\n\n') : schedule.title,
          status: assigneeUsable ? 'assigned' : 'logged',
          locationId: row.asset.locationId,
          assetId: row.assetId,
          assigneeId: assigneeUsable ? schedule.assigneeId : null,
          impact: 3,
          urgency: 3,
          priority: schedule.priority,
          fixDueAt: endOfLocalDay(dueOn, zone),
          ppmScheduleAssetId: row.id,
          scheduledFor: asDate(dueOn),
          currency: schedule.currency,
          submissionKey: `ppm:${row.id}:${dueOn}`,
          submissionHash: hash(`ppm:${row.id}:${dueOn}`),
        },
      });
      if (steps.length) {
        const list = await tx.workOrderChecklist.create({
          data: {
            tenantId,
            workOrderId: job.id,
            title: (schedule.template?.name ?? schedule.title).slice(0, 120),
            gate: 'completion' satisfies ChecklistGate,
          },
        });
        await tx.workOrderChecklistItem.createMany({
          data: steps.map((step, position) => ({
            tenantId,
            checklistId: list.id,
            position,
            kind: step.kind,
            label: step.label,
            required: step.required ?? false,
            unit: step.unit ?? null,
          })),
        });
      }
      await tx.workOrderEntry.create({
        data: {
          tenantId,
          workOrderId: job.id,
          kind: 'system',
          body: `Raised from ${schedule.number}, due ${dueOn}`,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          entityType: 'work_order',
          entityId: job.id,
          action: 'ppm.generate',
          changes: { scheduleId: schedule.id, schedule: schedule.number, assetId: row.assetId, dueOn },
        },
      });
      result.created += 1;
      result.jobs.push(job.id);
    }

    // Move the row on: a fixed schedule to its next date, a floating one to waiting for this visit to be done.
    const last = due[due.length - 1]!;
    if (schedule.freqType === 'calendar') {
      const next =
        schedule.mode === 'fixed'
          ? nextOccurrenceAfter(
              dayOf(schedule.startsOn),
              schedule.calendarUnit as PpmCalendarUnit,
              schedule.interval!,
              last,
            )
          : null;
      await tx.ppmScheduleAsset.update({ where: { id: row.id }, data: { nextDueOn: next ? asDate(next) : null } });
    } else {
      await tx.ppmScheduleAsset.update({ where: { id: row.id }, data: { nextDueTotal: null } });
    }
  }
  return result;
}

const loadRow = (tx: Tx, tenantId: string, rowId: string) =>
  tx.ppmScheduleAsset.findFirst({
    where: { id: rowId, tenantId },
    include: { schedule: true },
  });

/** The meter total the next visit is due at, counted on from where the asset's meter is now. */
async function dueTotalFrom(
  tx: Tx,
  tenantId: string,
  row: { assetId: string; schedule: { meterName: string | null; meterInterval: Prisma.Decimal | null } },
) {
  const total = (await currentTotal(tx, tenantId, row.assetId, row.schedule.meterName!)) ?? new Prisma.Decimal(0);
  return total.plus(row.schedule.meterInterval!);
}

/**
 * A visit has been done. A fixed schedule keeps its dates. A floating one is now due a set time after this visit,
 * counted from its date or, for a meter, from the meter's reading now.
 */
export async function recordPpmDone(tx: Tx, tenantId: string, rowId: string, doneOn: string): Promise<void> {
  const row = await loadRow(tx, tenantId, rowId);
  if (!row) return;
  const { schedule } = row;
  // A visit done out of order doesn't move the last visit back.
  const lastDone = row.lastDoneOn && dayOf(row.lastDoneOn) > doneOn ? dayOf(row.lastDoneOn) : doneOn;
  const data: Prisma.PpmScheduleAssetUpdateInput = { lastDoneOn: asDate(lastDone) };
  if (schedule.mode === 'floating') {
    if (schedule.freqType === 'calendar') {
      data.nextDueOn = asDate(addInterval(lastDone, schedule.calendarUnit as PpmCalendarUnit, schedule.interval!));
    } else {
      data.nextDueTotal = await dueTotalFrom(tx, tenantId, row);
    }
  }
  await tx.ppmScheduleAsset.update({ where: { id: row.id }, data });
}

/**
 * A visit has been cancelled. A floating schedule would otherwise wait for it for ever, so it is counted on from the
 * day the visit was due, as though it had been skipped.
 */
export async function recordPpmCancelled(tx: Tx, tenantId: string, rowId: string, scheduledFor: string): Promise<void> {
  const row = await loadRow(tx, tenantId, rowId);
  if (!row || row.schedule.mode !== 'floating') return;
  const { schedule } = row;
  if (schedule.freqType === 'calendar') {
    if (row.nextDueOn) return;
    await tx.ppmScheduleAsset.update({
      where: { id: row.id },
      data: {
        nextDueOn: asDate(addInterval(scheduledFor, schedule.calendarUnit as PpmCalendarUnit, schedule.interval!)),
      },
    });
  } else if (!row.nextDueTotal) {
    await tx.ppmScheduleAsset.update({
      where: { id: row.id },
      data: { nextDueTotal: await dueTotalFrom(tx, tenantId, row) },
    });
  }
}

/** Where a new asset on a schedule starts: its first visit date, or the meter total its first visit is due at. */
export async function startingPoint(
  tx: Tx,
  tenantId: string,
  schedule: {
    freqType: string;
    mode: string;
    calendarUnit: string | null;
    interval: number | null;
    startsOn: Date;
    meterName: string | null;
    meterInterval: Prisma.Decimal | null;
  },
  asset: { id: string },
  today: string,
  lastDoneOn: string | null,
): Promise<{ nextDueOn: Date | null; nextDueTotal: Prisma.Decimal | null }> {
  if (schedule.freqType === 'meter') {
    const total = (await currentTotal(tx, tenantId, asset.id, schedule.meterName!)) ?? new Prisma.Decimal(0);
    return { nextDueOn: null, nextDueTotal: total.plus(schedule.meterInterval!) };
  }
  const unit = schedule.calendarUnit as PpmCalendarUnit;
  const anchor = dayOf(schedule.startsOn);
  if (schedule.mode === 'fixed') {
    // On the anchor's cycle but never before today, so a schedule begun in the past does not raise a backlog.
    return {
      nextDueOn: asDate(firstOccurrenceOnOrAfter(anchor, unit, schedule.interval!, today)),
      nextDueTotal: null,
    };
  }
  // Floating: due a set time after the last visit when there was one, else on the first date given.
  return {
    nextDueOn: asDate(lastDoneOn ? addInterval(lastDoneOn, unit, schedule.interval!) : anchor),
    nextDueTotal: null,
  };
}
