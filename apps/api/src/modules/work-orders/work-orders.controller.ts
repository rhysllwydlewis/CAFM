import {
  Body,
  ConflictException,
  Controller,
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
  assignWorkOrderSchema,
  changeWorkOrderSchema,
  changeWorkOrderStatusSchema,
  convertRequestSchema,
  createWorkOrderSchema,
  listWorkOrdersSchema,
  WORK_ORDER_FINISHED,
  WORK_ORDER_PAUSE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  workOrderCommentSchema,
  type RequestStatus,
  type WorkOrderPage,
  type WorkOrderStatus,
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
import { activeCustomFields, mergeCustom } from '../../core/config';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { parse } from '../../core/validation';
import { CLOSED, requestRelations, requestTargets } from '../helpdesk/request-records';
import { notifyLinkedRequesters, notifyRequester } from '../helpdesk/request-notifications';
import { lockRequests, requestScope, staleRequest } from '../helpdesk/request-scope';
import { locationScope } from '../locations/location-tree';
import {
  eligibleTechnician,
  insertWorkOrder,
  nextStatuses,
  submissionHash,
  workOrderDetail,
  workOrderRelations,
  workOrderSummary,
  type WorkOrderRow,
} from './work-order-records';
import { missingWorkOrder, staleWorkOrder, withWorkOrderWrite, workOrderScope } from './work-order-scope';

const CLOSED_STATUSES = ['closed', 'cancelled'];
/** Jobs that can still change hands: before anyone is on site. */
const REASSIGNABLE: readonly WorkOrderStatus[] = ['logged', 'assigned', 'accepted', 'travelling', 'paused'];
const UNASSIGNABLE: readonly WorkOrderStatus[] = ['assigned', 'accepted', 'travelling'];

async function getWorkOrder(tx: Tx, auth: AuthContext, id: string): Promise<WorkOrderRow> {
  const row = await tx.workOrder.findFirst({
    where: { ...workOrderScope(auth), id },
    include: workOrderRelations,
  });
  if (!row) throw missingWorkOrder();
  return row;
}

function entry(
  tx: Tx,
  row: { tenantId: string; id: string },
  auth: AuthContext,
  kind: string,
  body: string,
  internal = false,
) {
  return tx.workOrderEntry.create({
    data: { tenantId: row.tenantId, workOrderId: row.id, authorId: auth.membership!.id, kind, body, internal },
  });
}

/**
 * Keeps the Helpdesk request in step with its jobs. When every job that is still wanted has been
 * completed, the request is completed and the requester told. Reopening a job reopens the request.
 */
async function syncRequest(tx: Tx, auth: AuthContext, requestId: string, ip?: string) {
  const tenantId = auth.membership!.tenantId;
  await lockRequests(tx, tenantId);
  const request = await tx.serviceRequest.findFirst({ where: { id: requestId, tenantId } });
  // Closed, rejected and merged requests are left alone.
  if (!request || ['closed', 'rejected', 'merged'].includes(request.status)) return;
  const jobs = await tx.workOrder.findMany({
    where: { tenantId, requestId, status: { not: 'cancelled' } },
    select: { status: true },
  });
  const done = jobs.length > 0 && jobs.every(({ status }) => ['completed', 'verified', 'closed'].includes(status));
  const next: string | null =
    done && request.status !== 'completed'
      ? 'completed'
      : !done && request.status === 'completed'
        ? 'in_progress'
        : null;
  if (!next) return;
  const updated = await tx.serviceRequest.update({
    where: { id: request.id },
    data: {
      status: next,
      firstResponseAt: request.firstResponseAt ?? new Date(),
      ...(next === 'in_progress' ? { rating: null, feedback: null, ratedAt: null } : {}),
      version: { increment: 1 },
    },
  });
  const label = next === 'completed' ? 'Completed' : 'In progress';
  const note = await tx.requestEntry.create({
    data: {
      tenantId,
      requestId: request.id,
      authorId: auth.membership!.id,
      kind: 'status',
      body: next === 'completed' ? 'Completed · all work orders finished' : 'In progress · a work order was reopened',
    },
  });
  await audit(
    tx,
    auth,
    {
      action: 'request.update',
      entityType: 'request',
      entityId: request.id,
      changes: { before: { status: request.status }, after: { status: next }, via: 'work_order' },
    },
    ip,
  );
  await notifyRequester(tx, updated, next === 'completed' ? 'request.completed' : 'request.progress', note.id, label);
  await notifyLinkedRequesters(tx, tenantId, request.id, request.status as RequestStatus, next as RequestStatus);
}

@Controller('work-orders')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('work_orders')
export class WorkOrdersController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('work_orders.read')
  list(@Req() req: Request, @Query() query: unknown): Promise<WorkOrderPage> {
    const auth = req.auth!;
    const input = parse(listWorkOrdersSchema, query);
    const scope = workOrderScope(auth);
    const open = { status: { notIn: CLOSED_STATUSES } };
    const overdue = { status: { notIn: [...WORK_ORDER_FINISHED] }, fixDueAt: { lt: new Date() } };
    const filter: Prisma.WorkOrderWhereInput = {
      open,
      mine: { ...open, assigneeId: auth.membership!.id },
      unassigned: { status: 'logged' },
      overdue,
      all: {},
    }[input.view];

    return withTenant(this.db, auth.membership!.tenantId, async (tx): Promise<WorkOrderPage> => {
      const where: Prisma.WorkOrderWhereInput = {
        AND: [
          scope,
          filter,
          ...(input.status ? [{ status: input.status }] : []),
          ...(input.priority ? [{ priority: input.priority }] : []),
          ...(input.assetId ? [{ assetId: input.assetId }] : []),
          ...(input.locationId ? [{ location: { ancestors: { some: { ancestorId: input.locationId } } } }] : []),
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
      // The anchor may have changed since the last page. Resolve it in the same scope.
      const cursor = input.cursor
        ? await tx.workOrder.findFirst({
            where: { AND: [scope, { id: input.cursor }] },
            select: { id: true, createdAt: true },
          })
        : null;
      const rows = await tx.workOrder.findMany({
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
        include: workOrderRelations,
        take: input.limit + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const items = rows.slice(0, input.limit).map(workOrderSummary);
      const page: WorkOrderPage = {
        items,
        nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
        ...(input.cursor && !cursor ? { cursorReset: true } : {}),
      };
      if (cursor) return page;
      const now = new Date();
      const today = new Date(
        Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO('Europe/London').startOfDay()
          .epochMilliseconds,
      );
      const [openCount, unassigned, late, completedToday] = await Promise.all([
        tx.workOrder.count({ where: { AND: [scope, open] } }),
        tx.workOrder.count({ where: { AND: [scope, { status: 'logged' }] } }),
        tx.workOrder.count({ where: { AND: [scope, overdue] } }),
        tx.workOrder.count({ where: { AND: [scope, { completedAt: { gte: today } }] } }),
      ]);
      return { ...page, counts: { open: openCount, unassigned, overdue: late, completedToday } };
    });
  }

  @Get('assignees')
  @RequirePermission('work_orders.assign')
  assignees(@Req() req: Request, @Query('locationId', ParseUUIDPipe) locationId: string, @Query('q') q?: string) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const query = typeof q === 'string' ? q.trim().slice(0, 100) : '';
    return withTenant(this.db, tenantId, async (tx) => {
      const location = await tx.location.findFirst({
        where: { ...locationScope(auth), id: locationId },
        select: { id: true },
      });
      if (!location) throw new NotFoundException('Location not found.');
      const roles = await tx.role.findMany({
        where: { tenantId, permissions: { has: 'work_orders.read' } },
        select: { key: true, scope: true, permissions: true },
      });
      const eligible = roles.filter(
        ({ permissions }) => permissions.includes('work_orders.close') || permissions.includes('work_orders.edit'),
      );
      const rows = await tx.membership.findMany({
        where: {
          tenantId,
          status: 'active',
          licence: 'full',
          account: { name: { contains: query, mode: 'insensitive' } },
          role: { in: eligible.map(({ key }) => key) },
          OR: [
            { role: 'super_user' },
            {
              role: { in: eligible.filter(({ scope }) => scope === 'all').map(({ key }) => key) },
              locationScoped: false,
            },
            { sites: { some: { location: { descendants: { some: { descendantId: locationId } } } } } },
          ],
        },
        select: { id: true, account: { select: { name: true } } },
        orderBy: [{ account: { name: 'asc' } }, { id: 'asc' }],
        take: 25,
      });
      return rows.map(({ id, account }) => ({ id, name: account.name }));
    });
  }

  @Get(':id')
  @RequirePermission('work_orders.read')
  detail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) =>
      workOrderDetail(tx, await getWorkOrder(tx, auth, id), auth),
    );
  }

  @Post()
  @RequirePermission('work_orders.edit')
  create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(createWorkOrderSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.edit', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const submissionKey = auth.membership!.id + ':' + input.submissionId;
      const hash = submissionHash(input);
      const old = await tx.workOrder.findUnique({
        where: { tenantId_submissionKey: { tenantId, submissionKey } },
        include: workOrderRelations,
      });
      if (old) {
        if (old.submissionHash !== hash) throw staleSubmission();
        return workOrderSummary(old);
      }
      if (input.assigneeId) assertAccess(auth.access, 'work_orders', 'work_orders.assign');
      // The creator must be able to see the location they are raising a job at.
      const visible = await tx.location.findFirst({
        where: { ...locationScope(auth), id: input.locationId },
        select: { id: true },
      });
      if (!visible) throw new NotFoundException('Open location not found.');
      const fields = await activeCustomFields(tx, tenantId, 'work_order');
      const row = await insertWorkOrder(tx, auth, {
        submissionKey,
        submissionHash: hash,
        title: input.title,
        description: input.description,
        locationId: input.locationId,
        assetId: input.assetId,
        requestId: null,
        assigneeId: input.assigneeId,
        impact: input.impact,
        urgency: input.urgency,
        custom: mergeCustom(fields, input.custom),
      });
      await audit(
        tx,
        auth,
        {
          action: 'work_order.create',
          entityType: 'work_order',
          entityId: row.id,
          changes: { number: row.number, locationId: row.locationId, assetId: row.assetId, priority: row.priority },
        },
        req.ip,
      );
      return workOrderSummary(row);
    });
  }

  /** Turns a Helpdesk request into one or more jobs. The request moves to In progress. */
  @Post('from-request/:requestId')
  @RequirePermission('work_orders.edit')
  convert(@Req() req: Request, @Param('requestId', ParseUUIDPipe) requestId: string, @Body() body: unknown) {
    const input = parse(convertRequestSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.edit', async (tx, auth) => {
      assertAccess(auth.access, 'helpdesk', 'requests.manage');
      const tenantId = auth.membership!.tenantId;
      await lockRequests(tx, tenantId);
      const request = await tx.serviceRequest.findFirst({
        where: { ...requestScope(auth, false), id: requestId },
        include: requestRelations,
      });
      if (!request) throw new NotFoundException({ code: 'request_not_found', message: 'Request not found.' });

      const keys = input.jobs.map((_, index) => `${auth.membership!.id}:${input.submissionId}:${index}`);
      const hashes = input.jobs.map((job) => submissionHash({ requestId, job }));
      const replay = await tx.workOrder.findMany({
        where: { tenantId, submissionKey: { in: keys } },
        include: workOrderRelations,
        orderBy: { submissionKey: 'asc' },
      });
      if (replay.length) {
        const byKey = new Map(replay.map((row) => [row.submissionKey, row]));
        if (keys.some((key, index) => byKey.get(key)?.submissionHash !== hashes[index])) throw staleSubmission();
        return keys.map((key) => workOrderSummary(byKey.get(key)!));
      }

      if (request.version !== input.requestVersion) throw staleRequest();
      if (CLOSED.includes(request.status)) {
        throw new UnprocessableEntityException('Reopen the request before raising work against it.');
      }
      if (input.jobs.some(({ assigneeId }) => assigneeId))
        assertAccess(auth.access, 'work_orders', 'work_orders.assign');

      const targets = {
        priority: request.priority,
        responseDueAt: request.responseDueAt,
        attendDueAt: request.attendDueAt,
        fixDueAt: request.fixDueAt,
      };
      const rows: WorkOrderRow[] = [];
      for (const [index, job] of input.jobs.entries()) {
        const row = await insertWorkOrder(tx, auth, {
          submissionKey: keys[index]!,
          submissionHash: hashes[index]!,
          title: job.title ?? request.title,
          description: job.description ?? request.description,
          locationId: request.locationId,
          assetId: job.assetId === undefined ? request.assetId : job.assetId,
          requestId: request.id,
          assigneeId: job.assigneeId,
          impact: request.impact,
          urgency: request.urgency,
          custom: {},
          from: { createdAt: request.createdAt, targets },
        });
        await audit(
          tx,
          auth,
          {
            action: 'work_order.create',
            entityType: 'work_order',
            entityId: row.id,
            changes: { number: row.number, requestId: request.id, locationId: row.locationId, priority: row.priority },
          },
          req.ip,
        );
        rows.push(row);
      }

      const numbers = rows.map(({ number }) => number).join(', ');
      await tx.requestEntry.create({
        data: {
          tenantId,
          requestId: request.id,
          authorId: auth.membership!.id,
          kind: 'status',
          internal: true,
          body: 'Raised ' + (rows.length === 1 ? 'work order ' : 'work orders ') + numbers,
        },
      });
      if (request.status === 'new' || request.status === 'assigned') {
        const next = await tx.serviceRequest.update({
          where: { id: request.id },
          data: {
            status: 'in_progress',
            firstResponseAt: request.firstResponseAt ?? new Date(),
            version: { increment: 1 },
          },
        });
        const note = await tx.requestEntry.create({
          data: { tenantId, requestId: request.id, authorId: auth.membership!.id, kind: 'status', body: 'In progress' },
        });
        await audit(
          tx,
          auth,
          {
            action: 'request.update',
            entityType: 'request',
            entityId: request.id,
            changes: { before: { status: request.status }, after: { status: 'in_progress' }, via: 'work_order' },
          },
          req.ip,
        );
        await notifyRequester(tx, next, 'request.progress', note.id, 'In progress');
        await notifyLinkedRequesters(tx, tenantId, request.id, request.status as RequestStatus, 'in_progress');
      } else {
        await tx.serviceRequest.update({ where: { id: request.id }, data: { version: { increment: 1 } } });
      }
      return rows.map(workOrderSummary);
    });
  }

  @Patch(':id')
  @RequirePermission('work_orders.edit')
  change(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(changeWorkOrderSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.edit', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const before = await getWorkOrder(tx, auth, id);
      if (before.version !== input.version) throw staleWorkOrder();
      if (CLOSED_STATUSES.includes(before.status)) {
        throw new UnprocessableEntityException('A closed or cancelled work order can’t be edited.');
      }
      if (input.assetId) {
        const asset = await tx.asset.findFirst({
          where: { tenantId, id: input.assetId, locationId: before.locationId, status: { not: 'decommissioned' } },
          select: { id: true },
        });
        if (!asset) throw new NotFoundException('Asset not found at this location.');
      }
      let targets;
      const retriage = input.impact !== undefined && input.urgency !== undefined;
      if (retriage && (input.impact !== before.impact || input.urgency !== before.urgency)) {
        const site = await tx.locationPath.findFirst({
          where: { tenantId, descendantId: before.locationId, ancestor: { kind: 'site' } },
          select: { ancestor: { select: { siteCalendar: true } } },
        });
        targets = await requestTargets(
          tx,
          tenantId,
          input.impact!,
          input.urgency!,
          before.createdAt,
          site?.ancestor.siteCalendar,
        );
      }
      const custom = input.custom
        ? mergeCustom(await activeCustomFields(tx, tenantId, 'work_order'), input.custom, before.custom)
        : undefined;
      const next = await tx.workOrder.update({
        where: { id },
        include: workOrderRelations,
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.assetId !== undefined ? { assetId: input.assetId } : {}),
          ...(targets ? { impact: input.impact, urgency: input.urgency, ...targets } : {}),
          ...(custom ? { custom } : {}),
          version: { increment: 1 },
        },
      });
      await entry(tx, before, auth, 'system', targets ? 'Priority and targets updated' : 'Details updated', true);
      await audit(
        tx,
        auth,
        {
          action: 'work_order.update',
          entityType: 'work_order',
          entityId: id,
          changes: {
            before: { title: before.title, assetId: before.assetId, impact: before.impact, urgency: before.urgency },
            after: { title: next.title, assetId: next.assetId, impact: next.impact, urgency: next.urgency },
          },
        },
        req.ip,
      );
      return workOrderSummary(next);
    });
  }

  @Post(':id/status')
  @RequirePermission('work_orders.read')
  status(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(changeWorkOrderStatusSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, ['work_orders.edit', 'work_orders.close'], async (tx, auth) => {
      const before = await getWorkOrder(tx, auth, id);
      if (before.version !== input.version) throw staleWorkOrder();
      const current = before.status as WorkOrderStatus;
      if (!nextStatuses(current, auth.access!.permissions).includes(input.status)) {
        throw new UnprocessableEntityException('That status change is unavailable.');
      }
      const to = input.status;
      const now = new Date();
      const reopened = to === 'on_site' && (current === 'completed' || current === 'verified');
      const next = await tx.workOrder.update({
        where: { id },
        include: workOrderRelations,
        data: {
          status: to,
          pauseReason: to === 'paused' ? input.pauseReason : null,
          firstResponseAt: before.firstResponseAt ?? now,
          ...(to === 'on_site' && !before.attendedAt ? { attendedAt: now } : {}),
          ...(to === 'completed' ? { completedAt: now } : {}),
          ...(to === 'verified' ? { verifiedAt: now } : {}),
          ...(to === 'closed' ? { closedAt: now } : {}),
          ...(reopened ? { completedAt: null, verifiedAt: null } : {}),
          version: { increment: 1 },
        },
      });
      await entry(
        tx,
        before,
        auth,
        'status',
        [
          WORK_ORDER_STATUS_LABELS[to],
          input.pauseReason ? WORK_ORDER_PAUSE_LABELS[input.pauseReason] : null,
          input.note,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      await audit(
        tx,
        auth,
        {
          action: 'work_order.status',
          entityType: 'work_order',
          entityId: id,
          changes: { before: { status: current }, after: { status: to, pauseReason: input.pauseReason ?? null } },
        },
        req.ip,
      );
      if (next.requestId && (to === 'completed' || reopened || to === 'cancelled')) {
        await syncRequest(tx, auth, next.requestId, req.ip);
      }
      return workOrderSummary(next);
    });
  }

  @Post(':id/assign')
  @RequirePermission('work_orders.assign')
  assign(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(assignWorkOrderSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.assign', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const before = await getWorkOrder(tx, auth, id);
      if (before.version !== input.version) throw staleWorkOrder();
      const current = before.status as WorkOrderStatus;
      if (input.assigneeId === before.assigneeId) return workOrderSummary(before);
      if (input.assigneeId === null && !UNASSIGNABLE.includes(current)) {
        throw new UnprocessableEntityException('This work order can’t be unassigned now.');
      }
      if (input.assigneeId !== null && !REASSIGNABLE.includes(current)) {
        throw new UnprocessableEntityException('This work order can’t be reassigned now.');
      }
      if (input.assigneeId && !(await eligibleTechnician(tx, tenantId, input.assigneeId, before.locationId))) {
        throw new NotFoundException('Available assignee not found.');
      }
      // A new assignee has not accepted yet. A paused job stays paused.
      const status: WorkOrderStatus =
        input.assigneeId === null ? 'logged' : current === 'paused' ? 'paused' : 'assigned';
      const now = new Date();
      const next = await tx.workOrder.update({
        where: { id },
        include: workOrderRelations,
        data: {
          assigneeId: input.assigneeId,
          status,
          firstResponseAt: before.firstResponseAt ?? now,
          version: { increment: 1 },
        },
      });
      await entry(
        tx,
        before,
        auth,
        'assignment',
        input.assigneeId ? 'Assigned to ' + (next.assignee?.account.name ?? 'a team member') : 'Assignment cleared',
      );
      await audit(
        tx,
        auth,
        {
          action: 'work_order.assign',
          entityType: 'work_order',
          entityId: id,
          changes: {
            before: { assigneeId: before.assigneeId, status: current },
            after: { assigneeId: input.assigneeId, status },
          },
        },
        req.ip,
      );
      return workOrderSummary(next);
    });
  }

  @Post(':id/comments')
  @RequirePermission('work_orders.read')
  comment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(workOrderCommentSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, ['work_orders.edit', 'work_orders.close'], async (tx, auth) => {
      const row = await getWorkOrder(tx, auth, id);
      if (row.status === 'cancelled')
        throw new UnprocessableEntityException('A cancelled work order is closed to notes.');
      const created = await entry(tx, row, auth, 'comment', input.body, input.internal);
      await tx.workOrder.update({ where: { id }, data: { firstResponseAt: row.firstResponseAt ?? new Date() } });
      await audit(
        tx,
        auth,
        { action: 'work_order.comment', entityType: 'work_order', entityId: id, changes: { internal: input.internal } },
        req.ip,
      );
      return { id: created.id };
    });
  }
}

function staleSubmission() {
  return new ConflictException('This submission was already used.');
}
