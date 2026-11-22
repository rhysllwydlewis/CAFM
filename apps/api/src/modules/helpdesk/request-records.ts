import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { FieldDefinition } from '@cafm/config-engine';
import type { Prisma, Tx } from '@cafm/db';
import {
  DEFAULT_SITE_CALENDAR,
  defaultRequestPriority,
  REQUEST_STATUS_LABELS,
  requestQuestionSchema,
  siteCalendarSchema,
  type CreateRequest,
  type RequestChannel,
  type RequestRecord,
  type RequestStatus,
  type RequestSummary,
} from '@cafm/shared';
import { activeCustomFields, mergeCustom, nextNumber, visibleCustom } from '../../core/config';
import { audit } from '../../core/audit';
import type { AuthContext } from '../../core/session';
import { reportAssetSelect, reportLocationSelect, reportLocations, requestScope } from './request-scope';
import { requestDeadline } from './request-sla';
import { notifyRequester } from './request-notifications';

const memberLabel = { select: { account: { select: { name: true } } } } as const;
export const requestRelations = {
  location: { select: reportLocationSelect },
  asset: { select: reportAssetSelect },
  type: {
    select: { id: true, name: true, category: true, problemCode: true, questions: true, duplicateWindowHours: true },
  },
  requester: memberLabel,
  assignee: memberLabel,
  mergedInto: { select: { status: true } },
} satisfies Prisma.ServiceRequestInclude;
type RequestRow = Prisma.ServiceRequestGetPayload<{ include: typeof requestRelations }>;

export const CLOSED = ['completed', 'closed', 'rejected', 'merged'];
export const AT_RISK_MS = 60 * 60_000;

export const jsonQuestions = requestQuestionSchema.array();

export function requestSummary(row: RequestRow): RequestSummary {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status as RequestStatus,
    linkedStatus: (row.mergedInto?.status as RequestStatus | undefined) ?? null,
    channel: row.channel as RequestChannel,
    priority: row.priority,
    type: {
      id: row.type.id,
      name: row.type.name,
      category: row.type.category,
      problemCode: row.type.problemCode,
      questions: jsonQuestions.parse(row.type.questions),
    },
    location: row.location,
    asset: row.asset?.locationId === row.location.id ? row.asset : null,
    responseDueAt: row.responseDueAt?.toISOString() ?? null,
    firstResponseAt: row.firstResponseAt?.toISOString() ?? null,
    requesterName: row.requester?.account.name ?? null,
    assigneeName: row.assignee?.account.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    rating: row.rating,
  };
}

export async function requestDetail(
  tx: Tx,
  record: RequestRow,
  auth: AuthContext,
  staff: boolean,
): Promise<RequestRecord<FieldDefinition>> {
  const [entries, fields, linkedPhotoReports] = await Promise.all([
    tx.requestEntry.findMany({
      where: { tenantId: record.tenantId, requestId: record.id, ...(staff ? {} : { internal: false }) },
      include: { author: memberLabel },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    activeCustomFields(tx, record.tenantId, 'request'),
    staff
      ? tx.serviceRequest.findMany({
          where: { ...requestScope(auth, false), mergedIntoId: record.id, attachments: { some: {} } },
          select: { id: true, number: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })
      : [],
  ]);
  const questions = jsonQuestions.parse(record.type.questions);
  const answers = Array.isArray(record.answers)
    ? (record.answers as { label: string; value: boolean }[])
    : Object.entries(record.answers as Record<string, boolean>).map(([key, value]) => ({
        label: questions.find((question) => question.key === key)?.label ?? key.replaceAll('_', ' '),
        value,
      }));
  const custom = visibleCustom(record.custom, fields);
  return {
    ...requestSummary(record),
    version: record.version,
    impact: record.impact,
    urgency: record.urgency,
    description: record.description,
    attendDueAt: record.attendDueAt?.toISOString() ?? null,
    fixDueAt: record.fixDueAt?.toISOString() ?? null,
    assigneeId: staff ? record.assigneeId : null,
    feedback: record.feedback,
    answers,
    customFields: [...fields.values()].flatMap((definition) => {
      const value = custom[definition.key];
      return value == null ? [] : [{ definition, value }];
    }),
    linkedPhotoReports,
    entries: entries.map(({ id, kind, body, internal, author, createdAt }) => ({
      id,
      kind,
      body,
      internal,
      author: author?.account.name ?? null,
      createdAt: createdAt.toISOString(),
    })),
  };
}

export async function eligibleAssignee(tx: Tx, tenantId: string, id: string, locationId?: string) {
  const member = await tx.membership.findFirst({
    where: { tenantId, id, status: 'active', licence: 'full' },
    select: { role: true, locationScoped: true },
  });
  if (!member) return false;
  const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: member.role } } });
  if (!role?.permissions.includes('requests.manage') || !role.permissions.includes('requests.read')) return false;
  if (!locationId || (role.scope === 'all' && (!member.locationScoped || member.role === 'super_user'))) return true;
  return !!(await tx.membershipSite.findFirst({
    where: { tenantId, membershipId: id, location: { descendants: { some: { descendantId: locationId } } } },
    select: { membershipId: true },
  }));
}

type EmailSource = { tenantId: string; key: string; from: string };
function payloadHash(input: CreateRequest) {
  return createHash('sha256')
    .update(
      JSON.stringify(input, (_, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, value[key]]),
            )
          : value,
      ),
    )
    .digest('hex');
}

export async function createRequest(
  tx: Tx,
  input: CreateRequest,
  auth: AuthContext | null,
  ip?: string,
  email?: EmailSource,
): Promise<RequestSummary> {
  const member = auth?.membership;
  const tenantId = member?.tenantId ?? email!.tenantId;
  const submissionKey = member ? member.id + ':' + input.submissionId : email!.key;
  const submissionHash = payloadHash(input);
  const old = await tx.serviceRequest.findUnique({
    where: { tenantId_submissionKey: { tenantId, submissionKey } },
    include: requestRelations,
  });
  if (old) {
    if (old.submissionHash !== submissionHash) throw new ConflictException('This submission was already used.');
    return requestSummary(old);
  }

  const [location, type] = await Promise.all([
    tx.location.findFirst({
      where: { ...(auth ? reportLocations(auth) : { tenantId, status: 'open' }), id: input.locationId },
      select: { id: true },
    }),
    tx.requestType.findFirst({ where: { id: input.typeId, tenantId, active: true } }),
  ]);
  if (!location) throw new NotFoundException('Reportable location not found.');
  if (!type) throw new NotFoundException('Request type not found.');

  const selectedAsset =
    input.assetId &&
    (await tx.asset.findFirst({
      where: { tenantId, id: input.assetId, locationId: location.id, status: { not: 'decommissioned' } },
      select: { id: true },
    }));
  if (input.assetId && !selectedAsset) throw new NotFoundException('Asset not found at this location.');

  const site = await tx.locationPath.findFirst({
    where: { tenantId, descendantId: location.id, ancestor: { kind: 'site', status: 'open' } },
    select: { ancestor: { select: { code: true, siteCalendar: true } } },
  });
  if (!site) throw new BadRequestException('Choose a location within an open site.');

  const requesterId = input.requesterId ?? member?.id ?? null;
  if (
    requesterId &&
    requesterId !== member?.id &&
    !(await tx.membership.findFirst({
      where: { id: requesterId, tenantId, status: 'active' },
      select: { id: true },
    }))
  )
    throw new NotFoundException('Requester not found.');

  const questions = jsonQuestions.parse(type.questions);
  if (!email && questions.some(({ key, required }) => required && !Object.hasOwn(input.answers, key))) {
    throw new UnprocessableEntityException('Answer the required triage questions.');
  }
  if (Object.keys(input.answers).some((key) => !questions.some((question) => question.key === key))) {
    throw new UnprocessableEntityException('Some triage questions have changed. Refresh the form.');
  }
  const impact =
    input.impact ??
    Math.min(
      type.defaultImpact,
      ...questions.filter((question) => input.answers[question.key]).map((question) => question.yesImpact ?? 3),
    );
  const urgency =
    input.urgency ??
    Math.min(
      type.defaultUrgency,
      ...questions.filter((question) => input.answers[question.key]).map((question) => question.yesUrgency ?? 3),
    );
  const now = new Date();
  const targets = await requestTargets(tx, tenantId, impact, urgency, now, site.ancestor.siteCalendar);
  const fields = await activeCustomFields(tx, tenantId, 'request');
  const custom = email ? {} : mergeCustom(fields, input.custom);
  const assigneeId =
    !email && type.assigneeId && (await eligibleAssignee(tx, tenantId, type.assigneeId, location.id))
      ? type.assigneeId
      : null;
  const status = assigneeId ? 'assigned' : 'new';

  const request = await tx.serviceRequest.create({
    data: {
      tenantId,
      requesterId,
      assigneeId,
      status,
      submissionKey,
      submissionHash,
      impact,
      urgency,
      custom,
      title: input.title,
      description: input.description,
      locationId: location.id,
      assetId: input.assetId,
      typeId: type.id,
      answers: questions.flatMap(({ label, key }) => {
        const value = input.answers[key];
        return value === undefined ? [] : [{ label, value }];
      }),
      channel: email ? 'email' : input.channel,
      externalEmail: email?.from,
      createdAt: now,
      number: await nextNumber(tx, tenantId, 'request', { SITE: site.ancestor.code }),
      ...targets,
    },
    include: requestRelations,
  });
  const entry = await tx.requestEntry.create({
    data: { tenantId, requestId: request.id, authorId: member?.id, kind: 'status', body: 'Request received' },
  });
  const event = {
    action: 'request.create',
    entityType: 'request',
    entityId: request.id,
    changes: { channel: request.channel },
  };
  if (auth) await audit(tx, auth, event, ip);
  else await tx.auditEvent.create({ data: { tenantId, ...event } });
  await notifyRequester(tx, request, 'request.received', entry.id, REQUEST_STATUS_LABELS[status], type.acknowledgement);
  return requestSummary(request);
}

export async function requestTargets(
  tx: Tx,
  tenantId: string,
  impact: number,
  urgency: number,
  start: Date,
  siteCalendar: unknown,
) {
  const rule =
    (await tx.requestPriority.findUnique({ where: { tenantId_impact_urgency: { tenantId, impact, urgency } } })) ??
    defaultRequestPriority(impact, urgency);
  const calendar = siteCalendarSchema.safeParse(siteCalendar);
  const schedule = rule.businessHours ? (calendar.success ? calendar.data : DEFAULT_SITE_CALENDAR) : null;
  return {
    priority: rule.priority,
    responseDueAt: requestDeadline(start, rule.responseMinutes, schedule),
    attendDueAt: requestDeadline(start, rule.attendMinutes, schedule),
    fixDueAt: requestDeadline(start, rule.fixMinutes, schedule),
  };
}
