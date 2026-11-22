import {
  Body,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { newToken } from '@cafm/db';
import {
  assignContractorSchema,
  CONTRACTOR_LINK_DAYS,
  withdrawContractorSchema,
  WORK_ORDER_REASSIGNABLE,
  WORK_ORDER_UNASSIGNABLE,
  type WorkOrderStatus,
} from '@cafm/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { appUrl, queueTenantEmail } from '../../core/mail';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { PRIORITY_NAMES, getWorkOrder, workOrderRelations, workOrderSummary } from './work-order-records';
import { staleWorkOrder, withWorkOrderWrite } from './work-order-scope';

const DAY_MS = 86_400_000;

/** Sending a job to a contractor who has no account, by a link, and taking it back. */
@Controller('work-orders')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('work_orders')
export class WorkOrderContractorsController {
  constructor(private readonly db: PrismaService) {}

  /**
   * Sends the job to a contractor. Sending to the same person again issues a new link and email,
   * and the old link stops working. Sending to someone else takes the job back from the first.
   */
  @Post(':id/contractor')
  @RequirePermission('work_orders.assign')
  send(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(assignContractorSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.assign', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const before = await getWorkOrder(tx, auth, id);
      if (before.version !== input.version) throw staleWorkOrder();
      const current = before.status as WorkOrderStatus;
      if (!WORK_ORDER_REASSIGNABLE.includes(current)) {
        throw new UnprocessableEntityException('This work order can’t be given to a contractor now.');
      }
      const now = new Date();
      const { token, tokenHash } = newToken();
      const expiresAt = new Date(now.getTime() + CONTRACTOR_LINK_DAYS * DAY_MS);
      const existing = before.contractors[0];
      // The same contractor again is a new link to the same job. Anyone else replaces them.
      const same = existing?.email === input.email && existing.name === input.name;
      if (existing) await tx.workOrderContractor.update({ where: { id: existing.id }, data: { revokedAt: now } });
      await tx.workOrderContractor.create({
        data: {
          tenantId,
          workOrderId: id,
          name: input.name,
          email: input.email,
          tokenHash,
          expiresAt,
          createdById: auth.membership!.id,
        },
      });
      // A job with a contractor has no internal assignee. A paused job stays paused.
      const status: WorkOrderStatus = current === 'paused' ? 'paused' : same ? current : 'assigned';
      const next = await tx.workOrder.update({
        where: { id },
        include: workOrderRelations,
        data: {
          assigneeId: null,
          status,
          firstResponseAt: before.firstResponseAt ?? now,
          version: { increment: 1 },
        },
      });
      await tx.workOrderEntry.create({
        data: {
          tenantId,
          workOrderId: id,
          authorId: auth.membership!.id,
          kind: 'assignment',
          body: same ? 'Link sent again to ' + input.name : 'Sent to ' + input.name + ' (contractor)',
        },
      });
      await queueTenantEmail(tx, tenantId, {
        to: input.email,
        subject: 'Job ' + next.number + ': ' + next.title,
        text: [
          `${auth.membership!.tenant.name} has asked ${input.name} to carry out this job.`,
          '',
          `${next.number} · ${next.title}`,
          `Where: ${next.location.name} (${next.location.code})`,
          `Priority: P${next.priority} ${PRIORITY_NAMES[next.priority - 1]}`,
          '',
          next.description,
          '',
          `Open the job to accept it, update its progress and add notes: ${appUrl()}/job/${token}`,
          `The link works for ${CONTRACTOR_LINK_DAYS} days and is only for ${input.name}. Please don’t forward it.`,
        ].join('\n'),
        capture: auth.membership!.tenant.demo,
      });
      await audit(
        tx,
        auth,
        {
          action: 'work_order.contractor_send',
          entityType: 'work_order',
          entityId: id,
          changes: { contractor: input.name, again: same, status },
        },
        req.ip,
      );
      return workOrderSummary(next);
    });
  }

  /** Takes the job back from the contractor. The link stops working at once. */
  @Post(':id/contractor/withdraw')
  @RequirePermission('work_orders.assign')
  withdraw(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(withdrawContractorSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.assign', async (tx, auth) => {
      const before = await getWorkOrder(tx, auth, id);
      if (before.version !== input.version) throw staleWorkOrder();
      const contractor = before.contractors[0];
      if (!contractor) throw new NotFoundException('This work order isn’t with a contractor.');
      const current = before.status as WorkOrderStatus;
      if (!WORK_ORDER_UNASSIGNABLE.includes(current) && current !== 'paused') {
        throw new UnprocessableEntityException('The contractor has started this work order, so it can’t be withdrawn.');
      }
      const now = new Date();
      await tx.workOrderContractor.update({ where: { id: contractor.id }, data: { revokedAt: now } });
      const status: WorkOrderStatus = current === 'paused' ? 'paused' : 'logged';
      const next = await tx.workOrder.update({
        where: { id },
        include: workOrderRelations,
        data: { status, version: { increment: 1 } },
      });
      await tx.workOrderEntry.create({
        data: {
          tenantId: before.tenantId,
          workOrderId: id,
          authorId: auth.membership!.id,
          kind: 'assignment',
          body: 'Taken back from ' + contractor.name,
        },
      });
      await audit(
        tx,
        auth,
        {
          action: 'work_order.contractor_withdraw',
          entityType: 'work_order',
          entityId: id,
          changes: { contractor: contractor.name, status },
        },
        req.ip,
      );
      return workOrderSummary(next);
    });
  }
}
