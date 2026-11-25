import { z } from 'zod';

/** The standard reports in the first release. Each one is a fixed query, not a builder. */
export const REPORT_KEYS = [
  'open_jobs_by_age',
  'sla_performance',
  'ppm_compliance',
  'work_mix',
  'busiest_sites',
  'satisfaction',
  'cost_analysis',
] as const;
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

/** Jobs raised in the period, split into reactive (faults and requests) and planned (PPM) work. */
export interface WorkMixReport {
  key: 'work_mix';
  generatedAt: string;
  from: string;
  to: string;
  total: number;
  reactive: number;
  planned: number;
  /** Reactive as a whole percent of all jobs raised, or null when there were none. */
  percentReactive: number | null;
}

/** The sites with the most jobs raised in the period. Places not below a site are left out. */
export interface BusiestSitesReport {
  key: 'busiest_sites';
  generatedAt: string;
  from: string;
  to: string;
  sites: { locationId: string; name: string; jobs: number }[];
}

/** Requester ratings (1 to 5) given in the period. Needs the Helpdesk and `requests.manage`. */
export interface SatisfactionReport {
  key: 'satisfaction';
  generatedAt: string;
  from: string;
  to: string;
  rated: number;
  /** Mean rating to one decimal place, or null when nothing was rated. */
  average: number | null;
  /** How many requests got each rating, from 1 to 5. */
  byRating: { rating: number; count: number }[];
}

/** Cost entered on jobs in the period (by the day it was incurred), per currency. Needs `costs.read`. */
export interface CostAnalysisReport {
  key: 'cost_analysis';
  generatedAt: string;
  from: string;
  to: string;
  /** Whole minor units. Currencies are never added together. */
  currencies: {
    currency: string;
    totalMinor: number;
    byKind: { kind: string; amountMinor: number }[];
  }[];
}

/** One money total on the home page: whole minor units plus the currency they are in. */
export interface HomeSpend {
  currency: string;
  amountMinor: number;
}

/**
 * The fixed key figures on the home page. Each block is present only when the person's role and plan allow it,
 * so the page shows what suits the role: own work for a technician or contractor, the queue for the helpdesk,
 * spend for finance. Every count is over the sites and jobs the person may already see.
 */
export interface HomeSummary {
  generatedAt: string;
  /** Jobs: `own` when only the person's own jobs are counted; open, past their fix target, and due to be fixed today (UK day). */
  jobs: { own: boolean; open: number; overdue: number; dueToday: number; unassigned: number } | null;
  /** Requests still to triage, and those past their response target. */
  requests: { new: number; responseOverdue: number } | null;
  /** Cost entered in the last 30 days, per currency, and jobs that have gone over their limit. */
  spend: { from: string; to: string; totals: HomeSpend[]; overLimitJobs: number } | null;
}
