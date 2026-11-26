import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
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
import { PPM_TIME_ZONE, recordPpmCancelled, recordPpmDone, withTenant, type Prisma, type Tx } from '@fmstead/db';
import {
  assignWorkOrderSchema,
  bulkWorkOrderSchema,
  type BulkWorkOrderResponse,
  type BulkWorkOrderResult,
  changeWorkOrderSchema,
  changeWorkOrderStatusSchema,
  convertRequestSchema,
  createWorkOrderSchema,
  listWorkOrdersSchema,
  WORK_ORDER_FINISHED,
  WORK_ORDER_REASSIGNABLE,
  WORK_ORDER_UNASSIGNABLE,
  workOrderCommentSchema,
  workOrderNextStatuses,
  type RequestStatus,
  type WorkOrderPage,
  type WorkOrderStatus,
  localDate,
} from '@fmstead/shared';
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
import { CLOSED, requestRelations, requestTargets, slaSchedule } from '../helpdesk/request-records';
import { requestDeadline } from '../helpdesk/request-sla';
import { notifyLinkedRequesters, notifyRequester } from '../helpdesk/request-notifications';
import {
  lockRequests,
  reportAssetSelect,
  reportLocations,
  reportLocationSelect,
  requestScope,
  staleRequest,
} from '../helpdesk/request-scope';
import { locationScope } from '../locations/location-tree';
import {
  eligibleTechnician,
  getWorkOrder,
  insertWorkOrder,
  statusChange,
  statusEntryBody,
  JOB_LICENCES,
  submissionHash,
  workOrderDetail,
  workOrderRelations,
  workOrderSummary,
  type WorkOrderRow,
} from './work-order-records';
import { syncRequest } from './request-sync';
import { assertChecklistsAllow } from './work-order-checklists';
import { staleWorkOrder, withWorkOrderWrite, workOrderScope } from './work-order-scope';

const CLOSED_STATUSES = ['closed', 'cancelled'];
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

/** The instants a run of UK calendar days covers: from the start of the first day to the start of the day after the last. */
function ukDayRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const start = (day: string) =>
    new Date(Temporal.PlainDate.from(day).toZonedDateTime('Europe/London').epochMilliseconds);
  return {
    ...(from ? { gte: start(from) } : {}),
    ...(to ? { lt: start(Temporal.PlainDate.from(to).add({ days: 1 }).toString()) } : {}),
  };
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
    // A job whose clock is stopped by a pause is not running late.
    const overdue = {
      status: { notIn: [...WORK_ORDER_FINISHED] },
      slaPausedAt: null,
      fixDueAt: { lt: new Date() },
    };
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
          ...(input.requestId ? [{ requestId: input.requestId }] : []),
          ...(input.dueFrom || input.dueTo ? [{ fixDueAt: ukDayRange(input.dueFrom, input.dueTo) }] : []),
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
            select: { id: true, createdAt: true, priority: true, number: true, title: true },
          })
        : null;
      // Sort on a column that is never empty, with the id to break ties, so every page follows on from the last.
      const dir = input.dir ?? (input.sort === 'created' ? 'desc' : 'asc');
      const column = { created: 'createdAt', priority: 'priority', number: 'number', title: 'title' }[input.sort] as
        'createdAt' | 'priority' | 'number' | 'title';
      const past = dir === 'desc' ? 'lt' : 'gt';
      const rows = await tx.workOrder.findMany({
        where: cursor
          ? {
              AND: [
                where,
                {
                  OR: [
                    { [column]: { [past]: cursor[column] } },
                    { [column]: cursor[column], id: { [past]: cursor.id } },
                  ],
                },
              ],
            }
          : where,
        include: workOrderRelations,
        take: input.limit + 1,
        orderBy: [{ [column]: dir }, { id: dir }],
      });
      const items = rows.slice(0, input.limit).map(workOrderSummary);
      // Costs are for people who may see them. Everyone else gets no money in the list.
      if (auth.access!.permissions.has('costs.read') && items.length) {
        const sums = await tx.workOrderCost.groupBy({
          by: ['workOrderId'],
          where: { tenantId: auth.membership!.tenantId, workOrderId: { in: items.map(({ id }) => id) } },
          _sum: { amountMinor: true },
        });
        const totals = new Map(sums.map((row) => [row.workOrderId, row._sum.amountMinor ?? 0]));
        for (const item of items) item.costTotalMinor = totals.get(item.id) ?? 0;
      }
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

  /** Locations a job can be raised at: open, below the portfolio and region levels, and visible to the caller. */
  @Get('locations')
  @RequirePermission('work_orders.edit')
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

  @Get('locations/:locationId/assets')
  @RequirePermission('work_orders.edit')
  assets(@Req() req: Request, @Param('locationId', ParseUUIDPipe) locationId: string, @Query('q') q?: string) {
    const auth = req.auth!;
    const query = typeof q === 'string' ? q.trim().slice(0, 100) : '';
    return withTenant(this.db, auth.membership!.tenantId, (tx) =>
      tx.asset.findMany({
        where: {
          location: { ...reportLocations(auth), id: locationId },
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

  @Get('locations/:locationId/assignees')
  @RequirePermission('work_orders.assign')
  assignees(@Req() req: Request, @Param('locationId', ParseUUIDPipe) locationId: string, @Query('q') q?: string) {
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
          licence: { in: [...JOB_LICENCES] },
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
        if (old.submissionHash !== hash) throw submissionReused();
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
        if (keys.some((key, index) => byKey.get(key)?.submissionHash !== hashes[index])) throw submissionReused();
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
      // One moment for both: converting is the response if the request hasn't had one.
      const responded = request.firstResponseAt ?? new Date();
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
          from: { createdAt: request.createdAt, targets, respondedAt: responded },
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
            firstResponseAt: responded,
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
      // The asset is what a planned maintenance visit is for, so doing the visit on another would count for the wrong one.
      if (before.ppmScheduleAssetId && input.assetId !== undefined && input.assetId !== before.assetId) {
        throw new UnprocessableEntityException('The asset on a planned maintenance job can’t be changed.');
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
        // The clock runs from when the problem was reported, which for a job raised from a request is earlier.
        const reported = before.requestId
          ? await tx.serviceRequest.findFirst({
              where: { tenantId, id: before.requestId },
              select: { createdAt: true },
            })
          : null;
        targets = await requestTargets(
          tx,
          tenantId,
          input.impact!,
          input.urgency!,
          reported?.createdAt ?? before.createdAt,
          site?.ancestor.siteCalendar,
        );
        // Time the clock has already been stopped for still counts for the new targets.
        if (before.slaPausedMinutes > 0) {
          const { schedule } = await slaSchedule(
            tx,
            tenantId,
            input.impact!,
            input.urgency!,
            site?.ancestor.siteCalendar,
          );
          const lost = before.slaPausedMinutes;
          targets = {
            ...targets,
            attendDueAt: targets.attendDueAt && requestDeadline(targets.attendDueAt, lost, schedule),
            fixDueAt: targets.fixDueAt && requestDeadline(targets.fixDueAt, lost, schedule),
          };
        }
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
      if (!workOrderNextStatuses(current, auth.access!.permissions).includes(input.status)) {
        throw new UnprocessableEntityException('That status change is unavailable.');
      }
      const to = input.status;
      await assertChecklistsAllow(tx, auth.membership!.tenantId, id, current, to);
      const { reopened, data, clockNote } = await statusChange(tx, before, current, to, input.pauseReason, new Date());
      const next = await tx.workOrder.update({
        where: { id },
        include: workOrderRelations,
        data: { ...data, version: { increment: 1 } },
      });
      await entry(tx, before, auth, 'status', statusEntryBody(to, input.pauseReason, input.note, clockNote));
      await audit(
        tx,
        auth,
        {
          action: 'work_order.status',
          entityType: 'work_order',
          entityId: id,
          changes: {
            before: { status: current },
            after: { status: to, pauseReason: input.pauseReason ?? null },
            sla: clockNote,
          },
        },
        req.ip,
      );
      // A visit raised from a PPM schedule tells the schedule it has been done, or dropped.
      if (next.ppmScheduleAssetId && next.scheduledFor) {
        const tenantId = auth.membership!.tenantId;
        if (to === 'completed') {
          await recordPpmDone(tx, tenantId, next.ppmScheduleAssetId, localDate(new Date(), PPM_TIME_ZONE));
        } else if (to === 'cancelled') {
          await recordPpmCancelled(tx, tenantId, next.ppmScheduleAssetId, next.scheduledFor.toISOString().slice(0, 10));
        }
      }
      if (next.requestId && (to === 'completed' || reopened || to === 'cancelled')) {
        await syncRequest(tx, auth.membership!.tenantId, next.requestId, { auth, ip: req.ip });
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
      if (input.assigneeId === null && !WORK_ORDER_UNASSIGNABLE.includes(current)) {
        throw new UnprocessableEntityException('This work order can’t be unassigned now.');
      }
      if (input.assigneeId !== null && !WORK_ORDER_REASSIGNABLE.includes(current)) {
        throw new UnprocessableEntityException('This work order can’t be reassigned now.');
      }
      if (input.assigneeId && !(await eligibleTechnician(tx, tenantId, input.assigneeId, before.locationId))) {
        throw new NotFoundException('Available assignee not found.');
      }
      // A new assignee has not accepted yet. A paused job stays paused.
      const status: WorkOrderStatus =
        input.assigneeId === null ? 'logged' : current === 'paused' ? 'paused' : 'assigned';
      const now = new Date();
      // Choosing a person takes the job back from a contractor, whose link stops working.
      if (input.assigneeId && before.contractors[0]) {
        await tx.workOrderContractor.update({ where: { id: before.contractors[0].id }, data: { revokedAt: now } });
        await entry(tx, before, auth, 'assignment', before.contractors[0].name + ' no longer has this job');
      }
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

  /**
   * Changes several jobs at once. Each is done by the same code as the single-job call, in its own
   * transaction, so every rule (status order, checklists, assignee eligibility, scope, versions) holds
   * per row and one failure never undoes the others. The reply says what happened to each row.
   */
  @Post('bulk')
  @RequirePermission('work_orders.read')
  async bulk(@Req() req: Request, @Body() body: unknown): Promise<BulkWorkOrderResponse> {
    const input = parse(bulkWorkOrderSchema, body);
    const held = req.auth!.access!.permissions;
    const needed =
      input.action === 'assign'
        ? ['work_orders.assign']
        : input.action === 'priority'
          ? ['work_orders.edit']
          : ['work_orders.edit', 'work_orders.close'];
    if (!needed.some((key) => held.has(key as never))) throw new ForbiddenException();
    const results: BulkWorkOrderResult[] = [];
    for (const { id, version } of input.items) {
      try {
        const next =
          input.action === 'status'
            ? await this.status(req, id, { version, status: input.status, pauseReason: input.pauseReason })
            : input.action === 'assign'
              ? await this.assign(req, id, { version, assigneeId: input.assigneeId })
              : await this.change(req, id, { version, impact: input.impact, urgency: input.urgency });
        results.push({ id, ok: true, version: next.version });
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        const detail = error.getResponse();
        const message =
          typeof detail === 'string' ? detail : ((detail as { message?: unknown }).message ?? error.message);
        results.push({
          id,
          ok: false,
          status: error.getStatus(),
          message: typeof message === 'string' ? message : error.message,
        });
      }
    }
    const succeeded = results.filter(({ ok }) => ok).length;
    return { succeeded, failed: results.length - succeeded, results };
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

function submissionReused() {
  return new ConflictException('This submission was already used.');
}
