import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Tx } from '@cafm/db';
import {
  addCostSchema,
  COST_KINDS,
  costAmountMinor,
  formatMinor,
  MAX_COSTS_PER_JOB,
  MAX_JOB_COST_MINOR,
  setNteSchema,
  type CostKind,
  type LabourType,
  type WorkOrderCosts,
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
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { getWorkOrder } from './work-order-records';
import { staleWorkOrder, withWorkOrderWrite } from './work-order-scope';

const memberLabel = { select: { account: { select: { name: true } } } } as const;
const LOCKED = ['closed', 'cancelled'];

/** The job's costs, as the person asking is allowed to see them. */
async function readCosts(tx: Tx, tenantId: string, job: { id: string; currency: string; nteMinor: number | null }) {
  const rows = await tx.workOrderCost.findMany({
    where: { tenantId, workOrderId: job.id },
    include: { recordedBy: memberLabel },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const byKind = Object.fromEntries(COST_KINDS.map((kind) => [kind, 0])) as Record<CostKind, number>;
  for (const row of rows) byKind[row.kind as CostKind] += row.amountMinor;
  const result: WorkOrderCosts = {
    currency: job.currency,
    nteMinor: job.nteMinor,
    totalMinor: rows.reduce((total, row) => total + row.amountMinor, 0),
    byKind,
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind as CostKind,
      labourType: row.labourType as LabourType | null,
      description: row.description,
      reference: row.reference,
      quantityMilli: row.quantityMilli,
      unitCostMinor: row.unitCostMinor,
      amountMinor: row.amountMinor,
      incurredOn: row.incurredOn.toISOString().slice(0, 10),
      recordedByName: row.recordedBy?.account.name ?? null,
      overNte: row.overNte,
      overNteReason: row.overNteReason,
      createdAt: row.createdAt.toISOString(),
    })),
  };
  return result;
}

/**
 * What a job has cost. Seeing costs needs `costs.read`; recording, removing or setting the limit also needs
 * `work_orders.edit`, so the people doing the work, who have neither, never see rates or totals.
 */
@Controller('work-orders/:id/costs')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('work_orders')
export class WorkOrderCostsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('costs.read')
  list(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    assertAccess(auth.access, 'work_orders', 'work_orders.read');
    return withTenant(this.db, auth.membership!.tenantId, async (tx) =>
      readCosts(tx, auth.membership!.tenantId, await getWorkOrder(tx, auth, id)),
    );
  }

  @Post()
  @RequirePermission('work_orders.edit')
  add(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(addCostSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.edit', async (tx, auth) => {
      assertAccess(auth.access, undefined, 'costs.read');
      const tenantId = auth.membership!.tenantId;
      const job = await getWorkOrder(tx, auth, id);
      if (LOCKED.includes(job.status)) {
        throw new UnprocessableEntityException('Costs can’t be added to a closed or cancelled work order.');
      }
      // The amount is worked out here from whole numbers, whatever the screen showed.
      const quantityMilli = 'quantityMilli' in input ? input.quantityMilli : 1000;
      const unitCostMinor = 'unitCostMinor' in input ? input.unitCostMinor : input.amountMinor;
      const amountMinor = costAmountMinor(quantityMilli, unitCostMinor);
      if (amountMinor > MAX_JOB_COST_MINOR) {
        throw new UnprocessableEntityException('That cost is too large. Check the quantity and the cost of each.');
      }
      const before = await tx.workOrderCost.aggregate({
        where: { tenantId, workOrderId: id },
        _sum: { amountMinor: true },
        _count: true,
      });
      if (before._count >= MAX_COSTS_PER_JOB) {
        throw new UnprocessableEntityException('This work order already has the most costs it can hold.');
      }
      const total = (before._sum.amountMinor ?? 0) + amountMinor;
      const over = job.nteMinor !== null && total > job.nteMinor;
      if (over && !input.overNteReason) {
        throw new UnprocessableEntityException({
          code: 'over_nte',
          message: `This takes the job to ${formatMinor(total, job.currency)}, over its limit of ${formatMinor(job.nteMinor!, job.currency)}. Give the reason to go over it.`,
        });
      }
      const row = await tx.workOrderCost.create({
        data: {
          tenantId,
          workOrderId: id,
          kind: input.kind,
          labourType: input.kind === 'labour' ? input.labourType : null,
          description: input.description,
          reference: input.reference ?? null,
          quantityMilli,
          unitCostMinor,
          amountMinor,
          incurredOn: new Date(input.incurredOn + 'T00:00:00Z'),
          recordedById: auth.membership!.id,
          overNte: over,
          overNteReason: over ? input.overNteReason : null,
        },
      });
      await audit(
        tx,
        auth,
        {
          action: 'work_order_cost.add',
          entityType: 'work_order',
          entityId: id,
          changes: {
            costId: row.id,
            kind: row.kind,
            amountMinor,
            currency: job.currency,
            totalMinor: total,
            overNte: over,
            ...(over ? { reason: input.overNteReason } : {}),
          },
        },
        req.ip,
      );
      return readCosts(tx, tenantId, job);
    });
  }

  /** Costs are removed, not edited, so every change is in the audit log. */
  @Delete(':costId')
  @RequirePermission('work_orders.edit')
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Param('costId', ParseUUIDPipe) costId: string) {
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.edit', async (tx, auth) => {
      assertAccess(auth.access, undefined, 'costs.read');
      const tenantId = auth.membership!.tenantId;
      const job = await getWorkOrder(tx, auth, id);
      if (LOCKED.includes(job.status)) {
        throw new UnprocessableEntityException('Costs can’t be removed from a closed or cancelled work order.');
      }
      const cost = await tx.workOrderCost.findFirst({ where: { tenantId, workOrderId: id, id: costId } });
      if (!cost) throw new NotFoundException('Cost not found on this work order.');
      await tx.workOrderCost.delete({ where: { id: costId } });
      await audit(
        tx,
        auth,
        {
          action: 'work_order_cost.remove',
          entityType: 'work_order',
          entityId: id,
          changes: { costId, kind: cost.kind, amountMinor: cost.amountMinor, currency: job.currency },
        },
        req.ip,
      );
      return readCosts(tx, tenantId, job);
    });
  }

  /** Sets or clears the not-to-exceed limit. A limit below what has been spent is allowed: it blocks further spend. */
  @Put('limit')
  @RequirePermission('work_orders.edit')
  limit(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(setNteSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.edit', async (tx, auth) => {
      assertAccess(auth.access, undefined, 'costs.read');
      const tenantId = auth.membership!.tenantId;
      const before = await getWorkOrder(tx, auth, id);
      if (before.version !== input.version) throw staleWorkOrder();
      if (LOCKED.includes(before.status)) {
        throw new UnprocessableEntityException('The limit can’t be changed on a closed or cancelled work order.');
      }
      const job = await tx.workOrder.update({
        where: { id },
        data: { nteMinor: input.nteMinor, version: { increment: 1 } },
      });
      await audit(
        tx,
        auth,
        {
          action: 'work_order_cost.limit',
          entityType: 'work_order',
          entityId: id,
          changes: { before: before.nteMinor, after: input.nteMinor, currency: job.currency },
        },
        req.ip,
      );
      return readCosts(tx, tenantId, job);
    });
  }
}
