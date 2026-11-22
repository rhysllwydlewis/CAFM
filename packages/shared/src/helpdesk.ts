import { z } from 'zod';

const uuid = z.string().uuid();
const shortText = (max: number) => z.string().trim().min(1).max(max);
const level = z.number().int().min(1).max(3);
const target = z.number().int().min(1).max(43_200);
const version = z.number().int().positive();

export const REQUEST_STATUSES = [
  'new',
  'assigned',
  'in_progress',
  'completed',
  'closed',
  'rejected',
  'merged',
] as const;
export function acceptsRequestComments(status: string): boolean {
  return status !== 'closed' && status !== 'rejected' && status !== 'merged';
}

export const REQUEST_CHANNELS = ['portal', 'qr', 'phone', 'email'] as const;
export const REQUEST_VIEWS = ['open', 'mine', 'unassigned', 'at_risk', 'all'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RequestChannel = (typeof REQUEST_CHANNELS)[number];
export type RequestView = (typeof REQUEST_VIEWS)[number];

export const REQUEST_TRANSITIONS: Partial<Record<RequestStatus, RequestStatus[]>> = {
  new: ['assigned', 'in_progress', 'completed', 'rejected'],
  assigned: ['new', 'in_progress', 'completed', 'rejected'],
  in_progress: ['assigned', 'completed', 'rejected'],
  completed: ['closed', 'in_progress'],
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  closed: 'Closed',
  rejected: 'Rejected',
  merged: 'Merged',
};

export const REQUEST_CHANNEL_LABELS: Record<RequestChannel, string> = {
  portal: 'Portal',
  qr: 'QR code',
  phone: 'Phone',
  email: 'Email',
};

export const requestQuestionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: shortText(120),
  required: z.boolean().default(false),
  yesImpact: level.optional(),
  yesUrgency: level.optional(),
});

export const requestTypeSchema = z.object({
  name: shortText(80),
  category: shortText(60),
  problemCode: shortText(60),
  questions: z
    .array(requestQuestionSchema)
    .max(20)
    .default([])
    .refine(
      (questions) => new Set(questions.map(({ key }) => key)).size === questions.length,
      'Use a different key for each triage question.',
    ),
  defaultImpact: level.default(2),
  defaultUrgency: level.default(2),
  duplicateWindowHours: z.number().int().min(1).max(720).default(48),
  acknowledgement: shortText(1200).nullable().default(null),
  assigneeId: uuid.nullable().default(null),
  active: z.boolean().default(true),
});
export const updateRequestTypeSchema = requestTypeSchema.extend({ version });
export type RequestTypeInput = z.infer<typeof requestTypeSchema>;

export const requestPrioritySchema = z
  .object({
    impact: level,
    urgency: level,
    priority: z.number().int().min(1).max(4),
    responseMinutes: target,
    attendMinutes: target,
    fixMinutes: target,
    businessHours: z.boolean(),
  })
  .refine(
    (row) => row.responseMinutes <= row.attendMinutes && row.attendMinutes <= row.fixMinutes,
    'Response, attendance and fix targets must be in order.',
  );
export type RequestPriorityInput = z.infer<typeof requestPrioritySchema>;

export function defaultRequestPriority(impact: number, urgency: number): RequestPriorityInput {
  const priority = Math.max(1, Math.min(4, impact + urgency - 1));
  const [responseMinutes, attendMinutes, fixMinutes] = [
    [15, 60, 240],
    [60, 240, 480],
    [240, 480, 1440],
    [480, 1440, 2400],
  ][priority - 1]!;
  return {
    impact,
    urgency,
    priority,
    responseMinutes: responseMinutes!,
    attendMinutes: attendMinutes!,
    fixMinutes: fixMinutes!,
    businessHours: priority !== 1,
  };
}

export const createRequestSchema = z
  .object({
    submissionId: uuid,
    title: shortText(160),
    description: shortText(6000),
    locationId: uuid,
    assetId: uuid.nullable().default(null),
    typeId: uuid,
    requesterId: uuid.optional(),
    channel: z.enum(['portal', 'qr', 'phone']).default('portal'),
    impact: level.optional(),
    urgency: level.optional(),
    answers: z.record(z.boolean()).default({}),
    custom: z.record(z.unknown()).default({}),
  })
  .strict();
export type CreateRequest = z.infer<typeof createRequestSchema>;

export const listRequestsSchema = z.object({
  view: z.enum(REQUEST_VIEWS).default('open'),
  q: z.string().trim().max(160).optional(),
  locationId: uuid.optional(),
  category: z.string().trim().max(60).optional(),
  channel: z.enum(REQUEST_CHANNELS).optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const requestTriageSchema = z.object({ typeId: uuid, impact: level, urgency: level }).strict();
export type RequestTriage = z.infer<typeof requestTriageSchema>;
export type RequestTypeChoice = { id: string; category: string; name: string; active: boolean };

export const changeRequestSchema = z
  .object({
    version,
    status: z.enum(['new', 'assigned', 'in_progress', 'completed', 'closed', 'rejected']).optional(),
    assigneeId: uuid.nullable().optional(),
    triage: requestTriageSchema.optional(),
    note: shortText(1200).optional(),
  })
  .strict()
  .refine(
    (change) => change.status !== undefined || change.assigneeId !== undefined || change.triage !== undefined,
    'Choose a status, an assignee or triage details.',
  );
export const mergeRequestSchema = z.object({ version, targetId: uuid, targetVersion: version }).strict();
export const requestCommentSchema = z.object({ body: shortText(6000), internal: z.boolean().default(false) }).strict();
export const requestRatingSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    feedback: z.string().trim().max(1200).optional(),
  })
  .strict();
export const requestMailboxSchema = z
  .object({
    address: z.string().trim().email().max(254).toLowerCase(),
    locationId: uuid,
    typeId: uuid,
    active: z.boolean().default(true),
  })
  .strict();
export const updateRequestMailboxSchema = requestMailboxSchema.extend({ version });
export const incomingRequestSchema = z.object({
  to: z.string().trim().email().max(254).toLowerCase(),
  from: z.string().trim().email().max(254).toLowerCase(),
  messageId: shortText(500),
  inReplyTo: shortText(500).optional(),
  subject: shortText(160),
  text: shortText(6000),
  /** True when the message carries `Auto-Submitted` (other than `no`) or is a bounce. */
  autoSubmitted: z.boolean().optional(),
});

export const NOTIFICATION_EVENTS = [
  'request.received',
  'request.progress',
  'request.completed',
  'request.reply',
] as const;
export type RequestNotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const notificationTemplateSchema = z
  .object({
    title: shortText(160),
    body: shortText(1600),
    email: z.boolean(),
    push: z.boolean(),
  })
  .strict();

export type ReportLocation = { id: string; name: string; code: string; path?: string[] };
export type ReportAsset = { id: string; name: string; number: string; locationId: string };
export type RequestTypeOption = Pick<RequestTypeInput, 'name' | 'category' | 'problemCode' | 'questions'> & {
  id: string;
};
export type RequestCatalogue<FieldDefinition> = {
  types: RequestTypeOption[];
  customFields: FieldDefinition[];
};
export type RequestSummary = {
  id: string;
  number: string;
  title: string;
  status: RequestStatus;
  linkedStatus: RequestStatus | null;
  channel: RequestChannel;
  priority: number;
  type: RequestTypeOption;
  location: ReportLocation;
  asset: ReportAsset | null;
  responseDueAt: string | null;
  firstResponseAt: string | null;
  requesterName: string | null;
  assigneeName: string | null;
  updatedAt: string;
  createdAt: string;
  rating: number | null;
};
export type RequestRecord<CustomField = unknown> = RequestSummary & {
  version: number;
  impact: number;
  urgency: number;
  description: string;
  attendDueAt: string | null;
  fixDueAt: string | null;
  assigneeId: string | null;
  feedback: string | null;
  answers: { label: string; value: boolean }[];
  customFields: { definition: CustomField; value: unknown }[];
  entries: { id: string; kind: string; body: string; internal: boolean; author: string | null; createdAt: string }[];
  linkedPhotoReports: { id: string; number: string }[];
};
export type RequestPage = {
  items: RequestSummary[];
  nextCursor: string | null;
  cursorReset?: boolean;
  counts?: {
    open: number;
    unassigned: number;
    atRisk: number;
    loggedToday: number;
    responseMinutes: number | null;
    rating: number | null;
  };
};
export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  requestId: string | null;
  assetId: string | null;
  workOrderId: string | null;
  readAt: string | null;
  createdAt: string;
};

// Browser push endpoints are provider URLs. Never let a subscription become
// an arbitrary destination for a server-side request.
const PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'wns2-par02p.notify.windows.com',
]);

export function isBrowserPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.length > 1 &&
      (PUSH_HOSTS.has(url.hostname) ||
        url.hostname.endsWith('.notify.windows.com') ||
        url.hostname.endsWith('.push.services.mozilla.com') ||
        url.hostname.endsWith('.web.push.apple.com'))
    );
  } catch {
    return false;
  }
}

export const pushEndpointSchema = z.object({ endpoint: z.string().max(2048).refine(isBrowserPushEndpoint) });

export const pushSubscriptionSchema = z
  .object({
    endpoint: z.string().max(2048).refine(isBrowserPushEndpoint, 'Browser push endpoint unsupported.'),
    keys: z.object({
      p256dh: z.string().regex(/^[a-zA-Z0-9_-]{87}$/),
      auth: z.string().regex(/^[a-zA-Z0-9_-]{22}$/),
    }),
  })
  .strict();
