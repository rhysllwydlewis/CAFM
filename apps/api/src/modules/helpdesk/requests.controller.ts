import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Temporal } from '@js-temporal/polyfill';
import { withTenant, type Prisma, type Tx } from '@cafm/db';
import {
  acceptsRequestComments,
  changeRequestSchema,
  createRequestSchema,
  listRequestsSchema,
  mergeRequestSchema,
  requestCommentSchema,
  requestRatingSchema,
  REQUEST_STATUS_LABELS,
  REQUEST_TRANSITIONS,
  type RequestPage,
  type RequestStatus,
} from '@cafm/shared';
import { audit } from '../../core/audit';
import {
  assertAccess,
  PermissionGuard,
  RequireFeature,
  RequirePermission,
  SessionGuard,
  TenantGuard,
} from '../../core/auth.guards';
import { activeCustomFields } from '../../core/config';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { parse } from '../../core/validation';
import { locationScope } from '../locations/location-tree';
import {
  AT_RISK_MS,
  CLOSED,
  createRequest,
  eligibleAssignee,
  jsonQuestions,
  requestDetail,
  requestRelations,
  requestSummary,
  requestTargets,
} from './request-records';
import {
  missingRequest,
  reportAssetSelect,
  reportLocationSelect,
  reportLocations,
  requestScope,
  staleRequest,
  withRequestWrite,
} from './request-scope';
import { notifyLinkedRequesters, notifyRequester } from './request-notifications';

async function getRequest(tx: Tx, auth: AuthContext, id: string, own: boolean) {
  const row = await tx.serviceRequest.findFirst({
    where: { ...requestScope(auth, own), id },
    include: requestRelations,
  });
  if (!row) throw missingRequest();
  return row;
}

@Controller('helpdesk')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('helpdesk')
export class RequestsController {
  constructor(private readonly db: PrismaService) {}

  @Get('catalogue')
  @RequirePermission('requests.create')
  catalogue(@Req() req: Request) {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const [types, fields] = await Promise.all([
        tx.requestType.findMany({
          where: { active: true },
          select: requestRelations.type.select,
          orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        }),
        activeCustomFields(tx, tenantId, 'request'),
      ]);
      return {
        types: types.map((type) => ({ ...type, questions: jsonQuestions.parse(type.questions) })),
        customFields: [...fields.values()],
      };
    });
  }

  @Get('locations')
  @RequirePermission('requests.create')
  locations(@Req() req: Request, @Query('q') q?: string) {
    const auth = req.auth!;
    const query = typeof q === 'string' ? q.trim().slice(0, 100) : '';
    return withTenant(this.db, auth.membership!.tenantId, (tx) =>
      tx.location.findMany({
        where: {
          ...reportLocations(auth),
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: 'insensitive' } },
                  { code: { contains: query, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: reportLocationSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 25,
      }),
    );
  }

  @Get('locations/:id')
  @RequirePermission('requests.create')
  target(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const location = await tx.location.findFirst({
        where: { ...reportLocations(auth), id },
        select: reportLocationSelect,
      });
      if (!location) throw new NotFoundException('Reportable location not found.');
      return location;
    });
  }

  @Get('assets/:id')
  @RequirePermission('requests.create')
  assetContext(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const row = await tx.asset.findFirst({
        where: { id, location: reportLocations(auth), status: { not: 'decommissioned' } },
        select: { ...reportAssetSelect, location: { select: reportLocationSelect } },
      });
      if (!row) throw new NotFoundException('Reportable asset not found.');
      const { location, ...asset } = row;
      return { location, asset };
    });
  }

  @Get('locations/:id/assets')
  @RequirePermission('requests.create')
  assets(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Query('q') q?: string) {
    const auth = req.auth!;
    const query = typeof q === 'string' ? q.trim().slice(0, 100) : '';
    return withTenant(this.db, auth.membership!.tenantId, (tx) =>
      tx.asset.findMany({
        where: {
          location: { ...reportLocations(auth), id },
          status: { not: 'decommissioned' },
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: 'insensitive' } },
                  { number: { contains: query, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: reportAssetSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 25,
      }),
    );
  }

  @Get('contacts')
  @RequirePermission('requests.manage')
  contacts(@Req() req: Request, @Query('q') q?: string) {
    const tenantId = req.auth!.membership!.tenantId;
    const query = typeof q === 'string' ? q.trim().slice(0, 100) : '';
    return withTenant(this.db, tenantId, async (tx) => {
      const matches = await tx.membership.findMany({
        where: { tenantId, status: 'active', account: { name: { contains: query, mode: 'insensitive' } } },
        select: { id: true, account: { select: { name: true } } },
        orderBy: [{ account: { name: 'asc' } }, { id: 'asc' }],
        take: 25,
      });
      return matches.map(({ id, account }) => ({ id, name: account.name }));
    });
  }

  @Get('requests/:id/assignees')
  @RequirePermission('requests.manage')
  assignees(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Query('q') q?: string) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const query = typeof q === 'string' ? q.trim().slice(0, 100) : '';
    return withTenant(this.db, tenantId, async (tx) => {
      const request = await getRequest(tx, auth, id, false);
      const roles = await tx.role.findMany({
        where: { tenantId, permissions: { hasEvery: ['requests.manage', 'requests.read'] } },
        select: { key: true, scope: true },
      });
      const rows = await tx.membership.findMany({
        where: {
          tenantId,
          status: 'active',
          licence: 'full',
          account: { name: { contains: query, mode: 'insensitive' } },
          role: { in: roles.map(({ key }) => key) },
          OR: [
            { role: 'super_user' },
            { role: { in: roles.filter(({ scope }) => scope === 'all').map(({ key }) => key) }, locationScoped: false },
            { sites: { some: { location: { descendants: { some: { descendantId: request.locationId } } } } } },
          ],
        },
        select: { id: true, account: { select: { name: true } } },
        orderBy: [{ account: { name: 'asc' } }, { id: 'asc' }],
        take: 25,
      });
      return rows.map(({ id, account }) => ({ id, name: account.name }));
    });
  }

  @Post('requests')
  @RequirePermission('requests.create')
  create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(createRequestSchema, body);
    return withRequestWrite(this.db, req.auth!, 'requests.create', (tx, auth) => {
      if (input.channel === 'phone' || input.requesterId || input.impact || input.urgency) {
        assertAccess(auth.access, 'helpdesk', 'requests.manage');
      }
      return createRequest(tx, input, auth, req.ip);
    });
  }

  @Get('queue-filters')
  @RequirePermission('requests.read')
  filters(@Req() req: Request, @Query() query: unknown) {
    const auth = req.auth!;
    const { locationId } = parse(listRequestsSchema, query);
    const scope = requestScope(auth, false);
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const [categories, location] = await Promise.all([
        tx.requestType.findMany({
          where: { requests: { some: scope } },
          select: { category: true },
          orderBy: { category: 'asc' },
          distinct: ['category'],
        }),
        locationId
          ? tx.location.findFirst({ where: { ...locationScope(auth), id: locationId }, select: reportLocationSelect })
          : null,
      ]);
      return { categories: categories.map(({ category }) => category), location };
    });
  }

  @Get('queue-locations')
  @RequirePermission('requests.read')
  queueLocations(@Req() req: Request, @Query('q') q?: string) {
    const auth = req.auth!;
    const query = typeof q === 'string' ? q.trim().slice(0, 100) : '';
    return withTenant(this.db, auth.membership!.tenantId, (tx) =>
      tx.location.findMany({
        where: {
          ...locationScope(auth),
          descendants: { some: { descendant: { requests: { some: requestScope(auth, false) } } } },
          OR: [{ name: { contains: query, mode: 'insensitive' } }, { code: { contains: query, mode: 'insensitive' } }],
        },
        select: reportLocationSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 25,
      }),
    );
  }

  @Get('requests')
  @RequirePermission('requests.read')
  queue(@Req() req: Request, @Query() query: unknown) {
    return this.list(req.auth!, query, false);
  }

  @Get('mine')
  @RequirePermission('requests.create')
  mine(@Req() req: Request, @Query() query: unknown) {
    return this.list(req.auth!, query, true);
  }

  private list(auth: AuthContext, query: unknown, own: boolean) {
    const input = parse(listRequestsSchema, query);
    const scope = requestScope(auth, own);
    const open = { status: { notIn: CLOSED } };
    const atRisk = { ...open, firstResponseAt: null, responseDueAt: { lte: new Date(Date.now() + AT_RISK_MS) } };
    const filter: Prisma.ServiceRequestWhereInput = own
      ? {}
      : {
          open,
          mine: { ...open, assigneeId: auth.membership!.id },
          unassigned: { ...open, assigneeId: null },
          at_risk: atRisk,
          all: {},
        }[input.view];

    return withTenant(this.db, auth.membership!.tenantId, async (tx): Promise<RequestPage> => {
      const where: Prisma.ServiceRequestWhereInput = {
        AND: [
          scope,
          filter,
          ...(input.locationId ? [{ location: { ancestors: { some: { ancestorId: input.locationId } } } }] : []),
          ...(input.channel ? [{ channel: input.channel }] : []),
          ...(input.category ? [{ type: { category: input.category } }] : []),
          ...(input.q
            ? [
                {
                  OR: [
                    { title: { contains: input.q, mode: 'insensitive' as const } },
                    { number: { contains: input.q, mode: 'insensitive' as const } },
                  ],
                },
              ]
            : []),
        ],
      };
      // The anchor may have changed status or category since the last page.
      // Resolve it in the same access scope, then apply the current filters.
      const cursor = input.cursor
        ? await tx.serviceRequest.findFirst({
            where: { AND: [scope, { id: input.cursor }] },
            select: { id: true, createdAt: true },
          })
        : null;
      const rows = await tx.serviceRequest.findMany({
        where: cursor
          ? {
              AND: [
                where,
                {
                  OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
                },
              ],
            }
          : where,
        include: requestRelations,
        take: input.limit + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const items = rows.slice(0, input.limit).map(requestSummary);
      const page = {
        items,
        nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
        ...(input.cursor && !cursor ? { cursorReset: true } : {}),
      };
      if (own || cursor) return page;
      const now = new Date();
      const today = new Date(
        Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO('Europe/London').startOfDay()
          .epochMilliseconds,
      );
      const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
      const [openCount, unassigned, riskCount, loggedToday, responded, ratings] = await Promise.all([
        tx.serviceRequest.count({ where: { AND: [scope, open] } }),
        tx.serviceRequest.count({ where: { AND: [scope, { ...open, assigneeId: null }] } }),
        tx.serviceRequest.count({ where: { AND: [scope, atRisk] } }),
        tx.serviceRequest.count({ where: { AND: [scope, { createdAt: { gte: today } }] } }),
        tx.serviceRequest.findMany({
          where: { AND: [scope, { firstResponseAt: { gte: weekAgo } }] },
          select: { firstResponseAt: true, createdAt: true },
        }),
        tx.serviceRequest.aggregate({
          where: { AND: [scope, { ratedAt: { gte: weekAgo } }] },
          _avg: { rating: true },
        }),
      ]);
      const responseMinutes = responded.length
        ? Math.round(
            responded.reduce((total, row) => total + row.firstResponseAt!.getTime() - row.createdAt.getTime(), 0) /
              (60_000 * responded.length),
          )
        : null;
      return {
        ...page,
        counts: {
          open: openCount,
          unassigned,
          atRisk: riskCount,
          loggedToday,
          responseMinutes,
          rating: ratings._avg.rating,
        },
      };
    });
  }

  @Get('requests/:id')
  @RequirePermission('requests.read')
  detail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.get(req.auth!, id, false);
  }

  @Get('mine/:id')
  @RequirePermission('requests.create')
  ownDetail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.get(req.auth!, id, true);
  }

  private get(auth: AuthContext, id: string, own: boolean) {
    return withTenant(this.db, auth.membership!.tenantId, async (tx) =>
      requestDetail(tx, await getRequest(tx, auth, id, own), !own),
    );
  }

  @Get('requests/:id/triage-types')
  @RequirePermission('requests.manage')
  async triageTypes(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const request = await getRequest(tx, auth, id, false);
      return tx.requestType.findMany({
        where: { OR: [{ active: true }, { id: request.typeId }] },
        select: { id: true, category: true, name: true, active: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      });
    });
  }

  @Patch('requests/:id')
  @RequirePermission('requests.manage')
  change(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(changeRequestSchema, body);
    return withRequestWrite(this.db, req.auth!, 'requests.manage', async (tx, auth) => {
      const before = await getRequest(tx, auth, id, false);
      if (before.version !== input.version) throw staleRequest();
      const tenantId = before.tenantId;
      const current = before.status as RequestStatus;
      const assigneeId = input.assigneeId === undefined ? before.assigneeId : input.assigneeId;
      const status =
        input.status ??
        (current === 'new' && assigneeId
          ? 'assigned'
          : current === 'assigned' && assigneeId === null
            ? 'new'
            : current);
      if (status !== current && !REQUEST_TRANSITIONS[current]?.includes(status)) {
        throw new UnprocessableEntityException('That status change is unavailable.');
      }
      if (input.assigneeId !== undefined && CLOSED.includes(current)) {
        throw new UnprocessableEntityException('Reopen the request before assigning it.');
      }
      if (status === 'new' && assigneeId)
        throw new UnprocessableEntityException('Clear the assignee to return this request to New.');
      if (status === 'assigned' && !assigneeId) throw new UnprocessableEntityException('Choose an assignee.');
      if (input.assigneeId && !(await eligibleAssignee(tx, tenantId, input.assigneeId, before.locationId))) {
        throw new NotFoundException('Available assignee not found.');
      }
      if (status === 'rejected' && !input.note) throw new UnprocessableEntityException('Enter a reason for rejection.');
      const workflowChanged = status !== current || assigneeId !== before.assigneeId;
      const triage = input.triage;
      const triageChanged =
        triage &&
        (triage.typeId !== before.typeId || triage.impact !== before.impact || triage.urgency !== before.urgency)
          ? triage
          : undefined;
      if (!workflowChanged && !triageChanged) return requestSummary(before);
      let targets;
      if (triageChanged) {
        if (CLOSED.includes(current)) throw new UnprocessableEntityException('Triage is available for open requests.');
        const type = await tx.requestType.findFirst({
          where: { tenantId, id: triageChanged.typeId, OR: [{ active: true }, { id: before.typeId }] },
          select: { id: true },
        });
        if (!type) throw new NotFoundException('Request type not found.');
        const site = await tx.locationPath.findFirst({
          where: { tenantId, descendantId: before.locationId, ancestor: { kind: 'site' } },
          select: { ancestor: { select: { siteCalendar: true } } },
        });
        targets = await requestTargets(
          tx,
          tenantId,
          triageChanged.impact,
          triageChanged.urgency,
          before.createdAt,
          site?.ancestor.siteCalendar,
        );
      }

      const next = await tx.serviceRequest.update({
        where: { id },
        include: requestRelations,
        data: {
          status,
          assigneeId,
          firstResponseAt: workflowChanged ? (before.firstResponseAt ?? new Date()) : before.firstResponseAt,
          ...triageChanged,
          ...targets,
          ...(status === 'in_progress' && current === 'completed'
            ? { rating: null, feedback: null, ratedAt: null }
            : {}),
          version: { increment: 1 },
        },
      });
      const entry = await tx.requestEntry.create({
        data: {
          tenantId,
          requestId: id,
          authorId: auth.membership!.id,
          kind: workflowChanged ? 'status' : 'triage',
          internal: !workflowChanged,
          body: !workflowChanged
            ? 'Classification or priority updated'
            : status === current
              ? assigneeId
                ? 'Assignee changed'
                : 'Assignment cleared'
              : [REQUEST_STATUS_LABELS[status], input.note].filter(Boolean).join(' · '),
        },
      });
      await audit(
        tx,
        auth,
        {
          action: 'request.update',
          entityType: 'request',
          entityId: id,
          changes: {
            before: {
              status: before.status,
              assigneeId: before.assigneeId,
              typeId: before.typeId,
              impact: before.impact,
              urgency: before.urgency,
              priority: before.priority,
            },
            after: {
              status,
              assigneeId,
              typeId: next.typeId,
              impact: next.impact,
              urgency: next.urgency,
              priority: next.priority,
            },
          },
        },
        req.ip,
      );
      const event = status === 'completed' ? 'request.completed' : 'request.progress';
      const label = REQUEST_STATUS_LABELS[status];
      if (workflowChanged) await notifyRequester(tx, next, event, entry.id, label);
      if (status !== current) {
        await notifyLinkedRequesters(tx, next.tenantId, next.id, current, status);
      }
      return requestSummary(next);
    });
  }

  @Get('requests/:id/duplicates')
  @RequirePermission('requests.manage')
  duplicates(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const row = await getRequest(tx, auth, id, false);
      const window = row.type.duplicateWindowHours * 3_600_000;
      const matches = await tx.serviceRequest.findMany({
        where: {
          AND: [
            requestScope(auth, false),
            {
              id: { not: id },
              locationId: row.locationId,
              type: { category: row.type.category },
              status: { notIn: CLOSED },
              createdAt: {
                gte: new Date(row.createdAt.getTime() - window),
                lte: new Date(row.createdAt.getTime() + window),
              },
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        include: requestRelations,
      });
      return matches.map((match) => ({ ...requestSummary(match), version: match.version }));
    });
  }

  @Post('requests/:id/merge')
  @RequirePermission('requests.manage')
  merge(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(mergeRequestSchema, body);
    if (input.targetId === id) throw new BadRequestException('Choose another request.');
    return withRequestWrite(this.db, req.auth!, 'requests.manage', async (tx, auth) => {
      const [source, target] = await Promise.all([
        getRequest(tx, auth, id, false),
        getRequest(tx, auth, input.targetId, false),
      ]);
      if (source.version !== input.version || target.version !== input.targetVersion) throw staleRequest();
      if (
        CLOSED.includes(source.status) ||
        CLOSED.includes(target.status) ||
        source.locationId !== target.locationId ||
        source.type.category !== target.type.category
      ) {
        throw new UnprocessableEntityException('Select two open requests for the same location and category.');
      }
      const next = await tx.serviceRequest.update({
        where: { id },
        include: requestRelations,
        data: { mergedIntoId: target.id, status: 'merged', version: { increment: 1 } },
      });
      // Keep a group one level deep so every original reporter follows its current primary request.
      await tx.serviceRequest.updateMany({
        where: { tenantId: source.tenantId, mergedIntoId: source.id },
        data: { mergedIntoId: target.id, version: { increment: 1 } },
      });
      await tx.serviceRequest.update({ where: { id: target.id }, data: { version: { increment: 1 } } });
      const entry = await tx.requestEntry.create({
        data: {
          tenantId: source.tenantId,
          requestId: id,
          authorId: auth.membership!.id,
          kind: 'status',
          body: 'The Helpdesk linked this report to another request about the same issue.',
        },
      });
      await tx.requestEntry.create({
        data: {
          tenantId: source.tenantId,
          requestId: target.id,
          authorId: auth.membership!.id,
          kind: 'merge',
          body: 'Linked duplicate ' + source.number,
          internal: true,
        },
      });
      await audit(
        tx,
        auth,
        { action: 'request.merge', entityType: 'request', entityId: id, changes: { targetId: target.id } },
        req.ip,
      );
      await notifyRequester(tx, next, 'request.progress', entry.id, 'linked to another report');
      return requestSummary(next);
    });
  }

  @Post('requests/:id/comments')
  @RequirePermission('requests.manage')
  comment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.addComment(req, id, body, false);
  }

  @Post('mine/:id/comments')
  @RequirePermission('requests.create')
  ownComment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.addComment(req, id, body, true);
  }

  private addComment(req: Request, id: string, body: unknown, own: boolean) {
    const input = parse(requestCommentSchema, body);
    if (own && input.internal) throw new ForbiddenException();
    return withRequestWrite(this.db, req.auth!, own ? 'requests.create' : 'requests.manage', async (tx, auth) => {
      const row = await getRequest(tx, auth, id, own);
      if (!acceptsRequestComments(row.status)) {
        throw new UnprocessableEntityException('This request is closed to new comments.');
      }
      const entry = await tx.requestEntry.create({
        data: { tenantId: row.tenantId, requestId: id, authorId: auth.membership!.id, kind: 'comment', ...input },
      });
      await audit(
        tx,
        auth,
        { action: 'request.comment', entityType: 'request', entityId: id, changes: { internal: input.internal } },
        req.ip,
      );
      if (!input.internal)
        await tx.serviceRequest.update({
          where: { id },
          data: {
            updatedAt: new Date(),
            ...(!own && !row.firstResponseAt ? { firstResponseAt: new Date(), version: { increment: 1 } } : {}),
          },
        });
      if (!own && !input.internal) {
        await notifyRequester(tx, row, 'request.reply', entry.id, REQUEST_STATUS_LABELS[row.status as RequestStatus]);
      }
      return { id: entry.id };
    });
  }

  @Post('mine/:id/rating')
  @RequirePermission('requests.create')
  rate(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(requestRatingSchema, body);
    return withRequestWrite(this.db, req.auth!, 'requests.create', async (tx, auth) => {
      const row = await getRequest(tx, auth, id, true);
      if (!['completed', 'closed'].includes(row.mergedInto?.status ?? row.status) || row.rating !== null) {
        throw new UnprocessableEntityException('A completed request can be rated once.');
      }
      await tx.serviceRequest.update({
        where: { id },
        data: { ...input, ratedAt: new Date(), version: { increment: 1 } },
      });
      await audit(
        tx,
        auth,
        { action: 'request.rate', entityType: 'request', entityId: id, changes: { rating: input.rating } },
        req.ip,
      );
      return { rating: input.rating };
    });
  }
}
