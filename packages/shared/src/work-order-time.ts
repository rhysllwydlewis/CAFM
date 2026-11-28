import { z } from 'zod';
import { LABOUR_TYPES, MAX_HOURLY_RATE_MINOR, MAX_JOB_COST_MINOR } from './work-order-costs';

/** One entry is at most a day, so a slip of the keyboard (900 for 90) is caught. */
export const MAX_TIME_MINUTES = 1440;
/** A job holds at most this many time entries. */
export const MAX_TIME_PER_JOB = 200;

export const recordTimeSchema = z
  .object({
    labourType: z.enum(LABOUR_TYPES),
    minutes: z.number().int().min(1).max(MAX_TIME_MINUTES),
    workedOn: z.string().date(),
    note: z.string().trim().max(200).nullish(),
    /** Made by the screen or the phone, so a retry records the time once. */
    submission: z.string().uuid(),
  })
  .strict();
export type RecordTime = z.infer<typeof recordTimeSchema>;

/** A rate is held in minor units (pence) for an hour. Everyone has the rate for their role, or else the one for all. */
export const setLabourRateSchema = z
  .object({
    labourType: z.enum(LABOUR_TYPES),
    /** A role key, or empty for everyone without a rate of their own. */
    roleKey: z
      .string()
      .trim()
      .max(60)
      .regex(/^[a-z0-9_]*$/)
      .default(''),
    rateMinor: z.number().int().min(0).max(MAX_HOURLY_RATE_MINOR),
  })
  .strict();

/** Minutes at an hourly rate in whole minor units, rounded half up. */
export function timeCostMinor(minutes: number, hourlyRateMinor: number): number {
  return Math.floor((minutes * hourlyRateMinor + 30) / 60);
}

/**
 * True when a rate can't be used for this time: it is above today's ceiling (a rate saved before the ceiling was
 * lowered, which the database would refuse to copy onto a new entry), or the cost is more than one job can hold.
 */
export function timeCostTooLarge(minutes: number, hourlyRateMinor: number): boolean {
  return hourlyRateMinor > MAX_HOURLY_RATE_MINOR || timeCostMinor(minutes, hourlyRateMinor) > MAX_JOB_COST_MINOR;
}

/** "1 h 30 min", "45 min". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : null, rest || !hours ? `${rest} min` : null].filter(Boolean).join(' ');
}

export type TimeEntry = {
  id: string;
  labourType: (typeof LABOUR_TYPES)[number];
  minutes: number;
  workedOn: string;
  note: string | null;
  recordedByName: string | null;
  createdAt: string;
  /** Only sent to people who can see costs. */
  rateMinor?: number | null;
  amountMinor?: number | null;
};
