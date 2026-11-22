import { z } from 'zod';
import { checklistItemInputSchema, type ChecklistItemInput } from './work-order-forms';

const uuid = z.string().uuid();
const shortText = (max: number) => z.string().trim().min(1).max(max);
const version = z.number().int().positive();

/* Words ----------------------------------------------------------------------------------------------------- */

/** How much the law or the insurer cares that the task is done (doc 02 §4). */
export const PPM_CRITICALITIES = ['statutory', 'mandatory', 'optimal', 'discretionary'] as const;
export type PpmCriticality = (typeof PPM_CRITICALITIES)[number];
export const PPM_CRITICALITY_LABELS: Record<PpmCriticality, string> = {
  statutory: 'Statutory',
  mandatory: 'Mandatory',
  optimal: 'Optimal',
  discretionary: 'Discretionary',
};

export const PPM_CALENDAR_UNITS = ['day', 'week', 'month', 'year'] as const;
export type PpmCalendarUnit = (typeof PPM_CALENDAR_UNITS)[number];
export const PPM_UNIT_LABELS: Record<PpmCalendarUnit, { one: string; many: string }> = {
  day: { one: 'day', many: 'days' },
  week: { one: 'week', many: 'weeks' },
  month: { one: 'month', many: 'months' },
  year: { one: 'year', many: 'years' },
};

/** Fixed visits keep their dates whatever happens; floating ones are due a set time after the last visit. */
export const PPM_MODES = ['fixed', 'floating'] as const;
export type PpmMode = (typeof PPM_MODES)[number];
export const PPM_MODE_LABELS: Record<PpmMode, string> = { fixed: 'Fixed dates', floating: 'From the last visit' };

export const PPM_PRIORITY_NAMES = ['Emergency', 'Urgent', 'Routine', 'Planned'] as const;

/** A schedule that is due, and what has become of it. */
export type PpmVisitState = 'scheduled' | 'due' | 'overdue' | 'completed';

/* Dates ----------------------------------------------------------------------------------------------------- */

/**
 * PPM dates are calendar days ("2026-12-01"), not moments, so the arithmetic is done on year, month and day and never
 * goes through a local time zone. 31 January plus one month is the last day of February, and a visit repeated every
 * month keeps the day it was anchored to (31 Jan, 28 Feb, 31 Mar), because each date is worked out from the anchor.
 */
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(value: string): { year: number; month: number; day: number } {
  const match = DATE.exec(value);
  if (!match) throw new Error(`Not a calendar date: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
export const formatDate = (year: number, month: number, day: number) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function addDays(value: string, days: number): string {
  const { year, month, day } = parseDate(value);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return formatDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

export function addMonths(value: string, months: number): string {
  const { year, month, day } = parseDate(value);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return formatDate(targetYear, targetMonth, Math.min(day, daysIn(targetYear, targetMonth)));
}

/** `anchor` moved on by `count` of a unit. */
export function addInterval(anchor: string, unit: PpmCalendarUnit, count: number): string {
  if (unit === 'day') return addDays(anchor, count);
  if (unit === 'week') return addDays(anchor, count * 7);
  return addMonths(anchor, unit === 'month' ? count : count * 12);
}

/** Whole days from `from` to `to`, negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** The visit dates of a fixed schedule: the anchor, then every `interval` units from it. The `index`th, counting from 0. */
export const occurrence = (anchor: string, unit: PpmCalendarUnit, interval: number, index: number) =>
  addInterval(anchor, unit, interval * index);

/** The first visit date on or after `from`. The anchor itself is the first visit, so nothing is earlier than it. */
export function firstOccurrenceOnOrAfter(
  anchor: string,
  unit: PpmCalendarUnit,
  interval: number,
  from: string,
): string {
  if (from <= anchor) return anchor;
  let index: number;
  if (unit === 'day' || unit === 'week') {
    index = Math.ceil(daysBetween(anchor, from) / (interval * (unit === 'week' ? 7 : 1)));
  } else {
    const a = parseDate(anchor);
    const f = parseDate(from);
    const months = (f.year - a.year) * 12 + (f.month - a.month);
    index = Math.max(0, Math.floor(months / (interval * (unit === 'year' ? 12 : 1))));
  }
  // The estimate can be a step out either way, because months differ in length, so settle it.
  while (occurrence(anchor, unit, interval, index) < from) index += 1;
  while (index > 0 && occurrence(anchor, unit, interval, index - 1) >= from) index -= 1;
  return occurrence(anchor, unit, interval, index);
}

/** The visit date after one already given, for a fixed schedule. */
export function nextOccurrenceAfter(anchor: string, unit: PpmCalendarUnit, interval: number, after: string): string {
  return firstOccurrenceOnOrAfter(anchor, unit, interval, addDays(after, 1));
}

/** The Monday of the week a date falls in. */
export function weekStart(value: string): string {
  const { year, month, day } = parseDate(value);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return addDays(value, -weekday);
}

/** The last moment of a calendar day in a time zone, so a visit due on a date is on time until that day ends there. */
export function endOfLocalDay(value: string, timeZone: string): Date {
  const { year, month, day } = parseDate(value);
  const wall = Date.UTC(year, month - 1, day, 23, 59, 59);
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const shown = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return shown - instant;
  };
  // Twice, because the offset at the guess can differ from the offset at the answer around a clock change.
  let instant = wall - offsetAt(wall);
  instant = wall - offsetAt(instant);
  return new Date(instant);
}

/** The calendar day an instant falls on in a time zone. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** "every 12 months", "every week", "every 250 on the Run hours meter". */
export function frequencyText(frequency: PpmFrequency): string {
  if (frequency.type === 'meter') return `every ${frequency.interval} on the ${frequency.meterName} meter`;
  const label = PPM_UNIT_LABELS[frequency.unit];
  return frequency.interval === 1 ? `every ${label.one}` : `every ${frequency.interval} ${label.many}`;
}

/* Schemas --------------------------------------------------------------------------------------------------- */

export const MAX_PPM_STEPS = 50;
export const MAX_SCHEDULE_ASSETS = 500;

const criticality = z.enum(PPM_CRITICALITIES);
const duration = z.number().int().min(5).max(10_080);
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date.')
  .refine((value) => {
    const parsed = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Enter a date.');
/** A reading interval such as 250 or 1000.5: up to three decimal places, above nothing. */
const meterInterval = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Enter a number, for example 250.')
  .refine((value) => Number(value) > 0, 'Enter a number above zero.');

export const ppmTaskTemplateSchema = z
  .object({
    name: shortText(120),
    description: shortText(1000).optional(),
    discipline: shortText(60).optional(),
    criticality: criticality.default('optimal'),
    durationMinutes: duration,
    skills: shortText(200).optional(),
    safetyNotes: shortText(1000).optional(),
    steps: z.array(checklistItemInputSchema).max(MAX_PPM_STEPS),
  })
  .strict();
export type PpmTaskTemplateInput = z.infer<typeof ppmTaskTemplateSchema>;
export const updatePpmTaskTemplateSchema = ppmTaskTemplateSchema.extend({ version }).strict();

export type PpmFrequency =
  | { type: 'calendar'; unit: PpmCalendarUnit; interval: number }
  | { type: 'meter'; meterName: string; interval: string };

const frequency = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('calendar'),
      unit: z.enum(PPM_CALENDAR_UNITS),
      interval: z.number().int().min(1).max(120),
    })
    .strict(),
  z.object({ type: z.literal('meter'), meterName: shortText(80), interval: meterInterval }).strict(),
]);

const scheduleAsset = z.object({ assetId: uuid, lastDoneOn: calendarDate.optional() }).strict();

const scheduleBody = {
  title: shortText(150),
  templateId: uuid.optional(),
  discipline: shortText(60).optional(),
  criticality: criticality.default('optimal'),
  frequency,
  /** Fixed by default, and from the last visit for a meter, which can be nothing else. */
  mode: z.enum(PPM_MODES).optional(),
  /** The first visit date for fixed schedules (and the anchor every later date is counted from). */
  startsOn: calendarDate,
  leadDays: z.number().int().min(0).max(365).default(28),
  durationMinutes: duration,
  priority: z.number().int().min(1).max(4).default(3),
  assigneeId: uuid.nullable().optional(),
  estimatedCostMinor: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  active: z.boolean().default(true),
};

const resolveMode = <T extends { frequency: { type: string }; mode?: PpmMode }>(input: T): T & { mode: PpmMode } => ({
  ...input,
  mode: input.mode ?? (input.frequency.type === 'meter' ? 'floating' : 'fixed'),
});
const meterIsFloating = {
  check: (input: { frequency: { type: string }; mode: PpmMode }) =>
    input.frequency.type === 'calendar' || input.mode === 'floating',
  options: { message: 'A schedule based on a meter is due from the last visit.', path: ['mode'] },
};

export const createPpmScheduleSchema = z
  .object({ ...scheduleBody, assets: z.array(scheduleAsset).max(MAX_SCHEDULE_ASSETS).default([]) })
  .strict()
  .transform(resolveMode)
  .refine(meterIsFloating.check, meterIsFloating.options);
export type CreatePpmSchedule = z.infer<typeof createPpmScheduleSchema>;

export const updatePpmScheduleSchema = z
  .object({ ...scheduleBody, version })
  .strict()
  .transform(resolveMode)
  .refine(meterIsFloating.check, meterIsFloating.options);

export const setScheduleAssetsSchema = z
  .object({ version, assets: z.array(scheduleAsset).max(MAX_SCHEDULE_ASSETS) })
  .strict();

/* Records ---------------------------------------------------------------------------------------------------- */

export type PpmTaskTemplate = {
  id: string;
  name: string;
  description: string | null;
  discipline: string | null;
  criticality: PpmCriticality;
  durationMinutes: number;
  skills: string | null;
  safetyNotes: string | null;
  steps: ChecklistItemInput[];
  active: boolean;
  version: number;
  schedules: number;
};

export type PpmScheduleSummary = {
  id: string;
  number: string;
  title: string;
  discipline: string | null;
  criticality: PpmCriticality;
  frequency: PpmFrequency;
  mode: PpmMode;
  active: boolean;
  assets: number;
  nextDueOn: string | null;
  overdue: number;
  assigneeName: string | null;
};

export type PpmScheduleAssetRow = {
  id: string;
  asset: { id: string; number: string; name: string };
  location: { id: string; name: string };
  lastDoneOn: string | null;
  nextDueOn: string | null;
  /** The reading the next visit is due at, for a meter-based schedule. */
  nextDueTotal: string | null;
  currentTotal: string | null;
  openJob: { id: string; number: string; status: string; scheduledFor: string } | null;
  state: PpmVisitState | null;
};

export type PpmScheduleRecord = PpmScheduleSummary & {
  description: string | null;
  templateId: string | null;
  templateName: string | null;
  startsOn: string;
  leadDays: number;
  durationMinutes: number;
  priority: number;
  assigneeId: string | null;
  estimatedCostMinor: number | null;
  currency: string;
  safetyNotes: string | null;
  skills: string | null;
  steps: ChecklistItemInput[];
  version: number;
  rows: PpmScheduleAssetRow[];
};

export type PpmGenerateResult = { created: number; skipped: number };

/* Planner, forecast and compliance ------------------------------------------------------------------------------ */

export type PpmCompliance = {
  /** Visits done on time as a share of the visits that fell due, to a tenth of a percent. Null when none fell due. */
  percent: number | null;
  onTime: number;
  late: number;
  /** Visits that fell due, are not done and are now late. */
  overdue: number;
};
export type PpmComplianceGroup = PpmCompliance & { key: string; label: string };

export type PpmSummary = {
  schedules: number;
  /** Visits due in the current week (Monday to Sunday), and how many of them nobody has been given. */
  dueThisWeek: number;
  dueThisWeekUnassigned: number;
  overdue: number;
  overdueStatutory: number;
  /** The last 12 months, and the 12 before them for comparison. */
  compliance: PpmCompliance;
  previousCompliance: PpmCompliance;
  byCriticality: PpmComplianceGroup[];
  byDiscipline: PpmComplianceGroup[];
  disciplines: string[];
};

/** Counts for one schedule in one week: still to come, raised and open, late, and done. */
export type PpmWeekCounts = { scheduled: number; due: number; overdue: number; completed: number };

export type PpmPlannerRow = {
  id: string;
  number: string;
  title: string;
  criticality: PpmCriticality;
  discipline: string | null;
  assets: number;
  assigneeName: string | null;
  frequency: PpmFrequency;
  /** By week index. A week with nothing in it has no entry. */
  weeks: Record<string, PpmWeekCounts>;
};

export type PpmPlanner = {
  today: string;
  /** The Monday each column starts on. */
  weekStarts: string[];
  rows: PpmPlannerRow[];
  totals: PpmWeekCounts[];
  /** Meter-based schedules can't be placed on a calendar, so they aren't in the grid. */
  meterSchedules: number;
};

export type PpmForecastMonth = {
  month: string;
  visits: number;
  labourMinutes: number;
  /** Null unless the person can see costs. */
  costMinor: number | null;
  /** Visits whose schedule has no estimated cost. */
  uncosted: number;
};
export type PpmForecast = {
  months: PpmForecastMonth[];
  currency: string;
  meterSchedules: number;
};

export type PpmOverdueItem = {
  jobId: string;
  number: string;
  title: string;
  status: string;
  scheduleId: string;
  scheduleNumber: string;
  criticality: PpmCriticality;
  asset: { id: string; number: string; name: string } | null;
  location: string;
  dueOn: string;
  daysLate: number;
  assigneeName: string | null;
};

export type PpmAssigneeOption = { id: string; name: string; role: string };

/** The ISO week number (1 to 53) of a calendar day, which is how planners number their weeks. */
export function isoWeek(value: string): number {
  const { year, month, day } = parseDate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  // The week belongs to the year of its Thursday.
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}
