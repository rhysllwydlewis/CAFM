import { z } from 'zod';
import type { ReportAsset, ReportLocation } from './helpdesk';
import type { Checklist } from './work-order-forms';

const uuid = z.string().uuid();
const shortText = (max: number) => z.string().trim().min(1).max(max);
const level = z.number().int().min(1).max(3);
const version = z.number().int().positive();

export const WORK_ORDER_STATUSES = [
  'logged',
  'assigned',
  'accepted',
  'travelling',
  'on_site',
  'paused',
  'completed',
  'verified',
  'closed',
  'cancelled',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  logged: 'Logged',
  assigned: 'Assigned',
  accepted: 'Accepted',
  travelling: 'Travelling',
  on_site: 'On site',
  paused: 'Paused',
  completed: 'Completed',
  verified: 'Verified',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** Where a job can go next. Assigning and unassigning (logged and assigned) is done by assigning, not by status. */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  logged: ['assigned', 'cancelled'],
  assigned: ['logged', 'accepted', 'travelling', 'on_site', 'paused', 'cancelled'],
  accepted: ['assigned', 'travelling', 'on_site', 'paused', 'cancelled'],
  travelling: ['accepted', 'on_site', 'paused', 'cancelled'],
  on_site: ['paused', 'completed', 'cancelled'],
  paused: ['accepted', 'travelling', 'on_site', 'cancelled'],
  completed: ['verified', 'closed', 'on_site'],
  verified: ['closed', 'on_site'],
  closed: [],
  cancelled: [],
};

/**
 * Where this person can move the job now. Doing the job (accepting, travelling, on site, pausing,
 * completing) needs `work_orders.close` or `work_orders.edit`. What follows is the supervisor's: verifying,
 * closing, cancelling and reopening need `work_orders.edit`, so nobody closes their own work unchecked.
 * Assigning and unassigning is a separate action, so it is not listed.
 */
export function workOrderNextStatuses(
  status: WorkOrderStatus,
  permissions: ReadonlySet<string> | readonly string[],
): WorkOrderStatus[] {
  const has = (key: string) =>
    Array.isArray(permissions) ? permissions.includes(key) : (permissions as ReadonlySet<string>).has(key);
  const edit = has('work_orders.edit');
  const field = edit || has('work_orders.close');
  const finished = status === 'completed' || status === 'verified';
  return WORK_ORDER_TRANSITIONS[status].filter((to) => {
    if (to === 'logged' || to === 'assigned') return false;
    if (to === 'verified' || to === 'closed' || to === 'cancelled') return edit;
    // Moving a finished job back to on site reopens it.
    return finished ? edit : field;
  });
}

const FIELD_STATUSES = ['accepted', 'travelling', 'on_site', 'paused', 'completed'] as const;
/** The steps the person doing the job takes, with only the permission to close jobs. */
export const WORK_ORDER_FIELD_STATUSES: readonly WorkOrderStatus[] = FIELD_STATUSES;
/** Jobs that can still change hands: before anyone is on site. */
export const WORK_ORDER_REASSIGNABLE: readonly WorkOrderStatus[] = [
  'logged',
  'assigned',
  'accepted',
  'travelling',
  'paused',
];
/** Jobs that can go back to the queue: assigned, but nobody has started. */
export const WORK_ORDER_UNASSIGNABLE: readonly WorkOrderStatus[] = ['assigned', 'accepted', 'travelling'];
/** Jobs that no longer need work: nothing left to assign or chase. */
export const WORK_ORDER_FINISHED: readonly WorkOrderStatus[] = ['completed', 'verified', 'closed', 'cancelled'];

export const WORK_ORDER_PAUSE_REASONS = [
  'awaiting_parts',
  'awaiting_access',
  'awaiting_approval',
  'awaiting_contractor',
  'other',
] as const;
export type WorkOrderPauseReason = (typeof WORK_ORDER_PAUSE_REASONS)[number];
export const WORK_ORDER_PAUSE_LABELS: Record<WorkOrderPauseReason, string> = {
  awaiting_parts: 'Awaiting parts',
  awaiting_access: 'Awaiting access',
  awaiting_approval: 'Awaiting approval',
  awaiting_contractor: 'Awaiting contractor',
  other: 'Other',
};

/**
 * Pauses that stop the SLA clock, because the delay is outside the provider's control. While one is in
 * force the attendance and fix targets are held, and move out by the business time lost when work resumes.
 * "Awaiting contractor" and "other" do not stop the clock.
 */
export const SLA_PAUSING_REASONS: readonly WorkOrderPauseReason[] = [
  'awaiting_parts',
  'awaiting_access',
  'awaiting_approval',
];

export const WORK_ORDER_VIEWS = ['open', 'mine', 'unassigned', 'overdue', 'all'] as const;
export type WorkOrderView = (typeof WORK_ORDER_VIEWS)[number];

/** Rows in a convert-request call: one request can become several jobs (for example, one per trade). */
export const MAX_JOBS_PER_REQUEST = 10;

export const createWorkOrderSchema = z
  .object({
    submissionId: uuid,
    title: shortText(160),
    description: shortText(6000),
    locationId: uuid,
    assetId: uuid.nullable().default(null),
    impact: level,
    urgency: level,
    assigneeId: uuid.nullable().default(null),
    custom: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type CreateWorkOrder = z.infer<typeof createWorkOrderSchema>;

export const convertRequestSchema = z
  .object({
    submissionId: uuid,
    requestVersion: version,
    jobs: z
      .array(
        z
          .object({
            title: shortText(160).optional(),
            description: shortText(6000).optional(),
            assetId: uuid.nullable().optional(),
            assigneeId: uuid.nullable().default(null),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_JOBS_PER_REQUEST),
  })
  .strict();
export type ConvertRequest = z.infer<typeof convertRequestSchema>;

export const WORK_ORDER_SORTS = ['created', 'priority', 'number', 'title'] as const;
export type WorkOrderSort = (typeof WORK_ORDER_SORTS)[number];

const ukDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const date = new Date(day + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day);
  }, 'Not a real date');

export const listWorkOrdersSchema = z.object({
  view: z.enum(WORK_ORDER_VIEWS).default('open'),
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  q: z.string().trim().max(160).optional(),
  locationId: uuid.optional(),
  assetId: uuid.optional(),
  requestId: uuid.optional(),
  priority: z.coerce.number().int().min(1).max(4).optional(),
  /** Jobs whose fix is due from this day to that day inclusive (UK dates, `YYYY-MM-DD`). Used by the calendar. */
  dueFrom: ukDate.optional(),
  dueTo: ukDate.optional(),
  sort: z.enum(WORK_ORDER_SORTS).default('created'),
  dir: z.enum(['asc', 'desc']).optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const changeWorkOrderSchema = z
  .object({
    version,
    title: shortText(160).optional(),
    description: shortText(6000).optional(),
    assetId: uuid.nullable().optional(),
    impact: level.optional(),
    urgency: level.optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine(
    (change) =>
      change.title !== undefined ||
      change.description !== undefined ||
      change.assetId !== undefined ||
      change.impact !== undefined ||
      change.urgency !== undefined ||
      change.custom !== undefined,
    'Change at least one detail.',
  )
  // Impact and urgency decide the priority and the SLA targets, so they are changed together.
  .refine(
    (change) => (change.impact === undefined) === (change.urgency === undefined),
    'Set impact and urgency together.',
  );

export const changeWorkOrderStatusSchema = z
  .object({
    version,
    status: z.enum(WORK_ORDER_STATUSES),
    pauseReason: z.enum(WORK_ORDER_PAUSE_REASONS).optional(),
    note: shortText(1200).optional(),
  })
  .strict()
  .refine((change) => (change.status === 'paused') === (change.pauseReason !== undefined), {
    message: 'Choose why the job is paused.',
    path: ['pauseReason'],
  });

export const assignWorkOrderSchema = z.object({ version, assigneeId: uuid.nullable() }).strict();

/** The most jobs one bulk action can change, so one request stays quick and its result readable. */
export const BULK_WORK_ORDER_LIMIT = 50;

const bulkItems = z
  .array(z.object({ id: uuid, version }).strict())
  .min(1)
  .max(BULK_WORK_ORDER_LIMIT)
  .refine((items) => new Set(items.map(({ id }) => id)).size === items.length, {
    message: 'Each work order can appear once.',
  });

/** Each job is changed on its own, with the version the person saw, so one that has moved on is reported, not overwritten. */
export const bulkWorkOrderSchema = z
  .discriminatedUnion('action', [
    z
      .object({
        action: z.literal('status'),
        items: bulkItems,
        status: z.enum(WORK_ORDER_STATUSES),
        pauseReason: z.enum(WORK_ORDER_PAUSE_REASONS).optional(),
      })
      .strict(),
    z.object({ action: z.literal('assign'), items: bulkItems, assigneeId: uuid.nullable() }).strict(),
    z.object({ action: z.literal('priority'), items: bulkItems, impact: level, urgency: level }).strict(),
  ])
  .refine(
    (change) => change.action !== 'status' || (change.status === 'paused') === (change.pauseReason !== undefined),
    {
      message: 'Choose why the jobs are paused.',
      path: ['pauseReason'],
    },
  );
export type BulkWorkOrderInput = z.infer<typeof bulkWorkOrderSchema>;

export interface BulkWorkOrderResult {
  id: string;
  ok: boolean;
  /** The HTTP status the single-job call would have given, for a row that failed. */
  status?: number;
  message?: string;
  /** The job's new version, for a row that worked. */
  version?: number;
}
export interface BulkWorkOrderResponse {
  succeeded: number;
  failed: number;
  results: BulkWorkOrderResult[];
}
export const workOrderCommentSchema = z
  .object({ body: shortText(6000), internal: z.boolean().default(false) })
  .strict();

/** How long a link sent to a contractor works. Sending it again starts the time afresh. */
export const CONTRACTOR_LINK_DAYS = 30;

export const assignContractorSchema = z
  .object({ version, name: shortText(120), email: z.string().trim().email().max(254).toLowerCase() })
  .strict();
export const withdrawContractorSchema = z.object({ version }).strict();
export const contractorStatusSchema = z
  .object({
    status: z.enum(FIELD_STATUSES),
    pauseReason: z.enum(WORK_ORDER_PAUSE_REASONS).optional(),
    note: shortText(1200).optional(),
  })
  .strict()
  .refine((change) => (change.status === 'paused') === (change.pauseReason !== undefined), {
    message: 'Choose why the job is paused.',
    path: ['pauseReason'],
  });
export const contractorNoteSchema = z.object({ body: shortText(6000) }).strict();

export type WorkOrderContractorInfo = { name: string; email: string; expiresAt: string; lastUsedAt: string | null };

/** What a contractor sees on their link: the job, and only the notes meant for them. */
export type ContractorJob = {
  contractorName: string;
  number: string;
  title: string;
  description: string;
  status: WorkOrderStatus;
  pauseReason: WorkOrderPauseReason | null;
  priority: number;
  location: { name: string; code: string; address: string | null };
  asset: { name: string; number: string } | null;
  attendDueAt: string | null;
  fixDueAt: string | null;
  expiresAt: string;
  nextStatuses: WorkOrderStatus[];
  notes: { id: string; author: string; body: string; createdAt: string }[];
  checklists: Checklist[];
};

export type WorkOrderSummary = {
  id: string;
  /** Changes with every edit. A bulk action sends the one the person saw. */
  version: number;
  number: string;
  title: string;
  status: WorkOrderStatus;
  pauseReason: WorkOrderPauseReason | null;
  priority: number;
  location: ReportLocation;
  asset: ReportAsset | null;
  request: { id: string; number: string } | null;
  assigneeId: string | null;
  assigneeName: string | null;
  responseDueAt: string | null;
  attendDueAt: string | null;
  fixDueAt: string | null;
  /** Set while the SLA clock is stopped by a pause. */
  slaPausedAt: string | null;
  /** The cost so far in minor units. Only sent to people who may see costs. */
  costTotalMinor?: number | null;
  currency: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type WorkOrderRecord<CustomField = unknown> = WorkOrderSummary & {
  type: string;
  /** For a visit raised from a PPM schedule: which, and the day it is due. */
  ppm: { scheduleId: string; scheduleNumber: string; dueOn: string } | null;
  /** The business minutes the clock has been stopped for. The targets already include them. */
  slaPausedMinutes: number;
  description: string;
  impact: number;
  urgency: number;
  createdByName: string | null;
  firstResponseAt: string | null;
  attendedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  customFields: { definition: CustomField; value: unknown }[];
  contractor: WorkOrderContractorInfo | null;
  /** The statuses this person can move the job to now, given its state and their permissions. */
  nextStatuses: WorkOrderStatus[];
  entries: { id: string; kind: string; body: string; internal: boolean; author: string | null; createdAt: string }[];
};
export type WorkOrderPage = {
  items: WorkOrderSummary[];
  nextCursor: string | null;
  cursorReset?: boolean;
  counts?: { open: number; unassigned: number; overdue: number; completedToday: number };
};
