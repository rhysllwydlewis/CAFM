import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant } from '@fmstead/db';
import { localDate, MAX_TIME_PER_JOB, recordTimeSchema, timeCostMinor, UK_TIME_ZONE } from '@fmstead/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { getWorkOrder } from './work-order-records';
import { rateFor, readTime } from './work-order-time';
import { withWorkOrderWrite } from './work-order-scope';

const LOCKED = ['closed', 'cancelled'];
const OVER_NTE_REASON = 'Time recorded on the job';

/**
 * Time spent on a job. Recording needs `time.record`. The cost of the time is worked out on the server from the
 * organisation's labour rate and posted to the job's costs, and it is only shown to people with `costs.read`, so
 * the people doing the work never see rates.
 */
@Controller('work-orders/:id/time')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('work_orders')
export class WorkOrderTimeController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('work_orders.read')
  list(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      await getWorkOrder(tx, auth, id);
      return readTime(tx, auth.membership!.tenantId, id, !!auth.access?.permissions.has('costs.read'));
    });
  }

  @Post()
  @RequirePermission('time.record')
  record(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(recordTimeSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'time.record', async (tx, auth) => {
      const { tenantId, id: memberId, role } = auth.membership!;
      const job = await getWorkOrder(tx, auth, id);
      const withCosts = !!auth.access?.permissions.has('costs.read');
      // A retry with the same submission answers with what was recorded.
      const existing = await tx.workOrderTime.findUnique({
        where: { tenantId_memberId_submission: { tenantId, memberId, submission: input.submission } },
      });
      if (existing) {
        if (existing.workOrderId !== id) throw new UnprocessableEntityException('This submission was already used.');
        return readTime(tx, tenantId, id, withCosts);
      }
      if (LOCKED.includes(job.status)) {
        throw new UnprocessableEntityException('Time can’t be added to a closed or cancelled work order.');
      }
      // The day is the site's, not UTC's: in summer, time worked just after midnight is already tomorrow in UTC terms.
      const today = localDate(new Date(), UK_TIME_ZONE);
      if (input.workedOn > today) throw new UnprocessableEntityException('Enter a date that is not in the future.');
      if ((await tx.workOrderTime.count({ where: { tenantId, workOrderId: id } })) >= MAX_TIME_PER_JOB) {
        throw new UnprocessableEntityException('This work order already has the most time entries it can hold.');
      }
      const rate = await rateFor(tx, tenantId, input.labourType, role);
      const time = await tx.workOrderTime.create({
        data: {
          tenantId,
          workOrderId: id,
          memberId,
          labourType: input.labourType,
          minutes: input.minutes,
          workedOn: new Date(input.workedOn + 'T00:00:00Z'),
          note: input.note?.trim() || null,
          rateMinor: rate?.rateMinor ?? null,
          submission: input.submission,
        },
      });
      let amountMinor: number | null = null;
      let over = false;
      if (rate) {
        amountMinor = timeCostMinor(input.minutes, rate.rateMinor);
        const before = await tx.workOrderCost.aggregate({
          where: { tenantId, workOrderId: id },
          _sum: { amountMinor: true },
        });
        over = job.nteMinor !== null && (before._sum.amountMinor ?? 0) + amountMinor > job.nteMinor;
        await tx.workOrderCost.create({
          data: {
            tenantId,
            workOrderId: id,
            kind: 'labour',
            labourType: input.labourType,
            description: (input.note?.trim() || 'Time on the job').slice(0, 200),
            quantityMilli: Math.round((input.minutes * 1000) / 60),
            unitCostMinor: rate.rateMinor,
            amountMinor,
            incurredOn: time.workedOn,
            recordedById: memberId,
            // Time that has already happened is never refused, but going over the limit is flagged for finance.
            overNte: over,
            overNteReason: over ? OVER_NTE_REASON : null,
            timeId: time.id,
          },
        });
      }
      await audit(
        tx,
        auth,
        {
          action: 'work_order_time.record',
          entityType: 'work_order',
          entityId: id,
          changes: {
            timeId: time.id,
            labourType: input.labourType,
            minutes: input.minutes,
            costed: amountMinor !== null,
            // Rates and amounts are in the audit log for those who can read it, as for other costs.
            ...(amountMinor !== null ? { amountMinor, currency: job.currency, overNte: over } : {}),
          },
        },
        req.ip,
      );
      return readTime(tx, tenantId, id, withCosts);
    });
  }

  /** Time is removed, not edited, so every change is in the audit log. Your own, or anyone's with `work_orders.edit`. */
  @Delete(':timeId')
  @RequirePermission('time.record')
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Param('timeId', ParseUUIDPipe) timeId: string) {
    return withWorkOrderWrite(this.db, req.auth!, 'time.record', async (tx, auth) => {
      const { tenantId, id: memberId } = auth.membership!;
      const job = await getWorkOrder(tx, auth, id);
      if (LOCKED.includes(job.status)) {
        throw new UnprocessableEntityException('Time can’t be removed from a closed or cancelled work order.');
      }
      const row = await tx.workOrderTime.findFirst({ where: { tenantId, workOrderId: id, id: timeId } });
      if (!row) throw new NotFoundException('Time entry not found on this work order.');
      if (row.memberId !== memberId && !auth.access?.permissions.has('work_orders.edit'))
        throw new ForbiddenException();
      await tx.workOrderTime.delete({ where: { id: timeId } });
      await audit(
        tx,
        auth,
        {
          action: 'work_order_time.remove',
          entityType: 'work_order',
          entityId: id,
          changes: { timeId, labourType: row.labourType, minutes: row.minutes, recordedBy: row.memberId },
        },
        req.ip,
      );
      return readTime(tx, tenantId, id, !!auth.access?.permissions.has('costs.read'));
    });
  }
}
