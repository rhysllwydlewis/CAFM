import { z } from 'zod';

/** The standard reports in the first release. Each one is a fixed query, not a builder. */
export const REPORT_KEYS = ['open_jobs_by_age', 'sla_performance', 'ppm_compliance'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** Age bands for open jobs, in whole days since the job was logged. */
export const AGE_BANDS = [
  { key: '0-1', label: 'Under 2 days', maxDays: 1 },
  { key: '2-7', label: '2 to 7 days', maxDays: 7 },
  { key: '8-30', label: '8 to 30 days', maxDays: 30 },
  { key: '31+', label: 'Over 30 days', maxDays: null },
] as const;

/** True for a calendar day that exists (rejects 2026-02-31). */
const isRealDay = (text: string) => {
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
};

export const reportQuerySchema = z.object({
  /** Limit to a site or any place below it. */
  locationId: z.string().uuid().optional(),
  /** SLA performance: the period, as UK calendar days (inclusive). */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealDay, 'Use a real date as YYYY-MM-DD.')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealDay, 'Use a real date as YYYY-MM-DD.')
    .optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export interface OpenJobsByAgeReport {
  key: 'open_jobs_by_age';
  generatedAt: string;
  total: number;
  bands: { key: string; label: string; count: number }[];
}

export interface SlaPerformanceReport {
  key: 'sla_performance';
  generatedAt: string;
  from: string;
  to: string;
  /** Jobs completed in the period that had a fix target. */
  measured: number;
  met: number;
  breached: number;
  /** Whole percent, or null when nothing was measured. */
  percentMet: number | null;
  byPriority: { priority: number; measured: number; met: number }[];
}

export interface PpmComplianceReport {
  key: 'ppm_compliance';
  generatedAt: string;
  from: string;
  to: string;
  /** Planned visits that fell due in the period. */
  due: number;
  onTime: number;
  late: number;
  /** Not done, and the due day has passed. */
  overdue: number;
  /** Not done yet, and not due yet. */
  upcoming: number;
  /** On time as a whole percent of visits whose due day has passed, or null when none has. */
  percentOnTime: number | null;
}
