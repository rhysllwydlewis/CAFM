import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Tx } from '@fmstead/db';
import { setLabourRateSchema } from '@fmstead/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { withWorkOrderWrite } from './work-order-scope';

const readRates = async (tx: Tx, tenantId: string) =>
  (
    await tx.labourRate.findMany({
      where: { tenantId },
      orderBy: [{ labourType: 'asc' }, { roleKey: 'asc' }],
    })
  ).map((row) => ({
    id: row.id,
    labourType: row.labourType,
    roleKey: row.roleKey,
    rateMinor: row.rateMinor,
    currency: row.currency,
    updatedAt: row.updatedAt.toISOString(),
  }));

/**
 * What an hour of each kind of labour costs. Seeing the rates needs `costs.read` and changing them needs
 * `costs.manage_rates`, so an organisation decides who sets them and who sees them by choosing which roles hold
 * each. A rate for a role wins over the rate for everyone. With no rate, time is recorded without a cost.
 */
@Controller('labour-rates')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('work_orders')
export class LabourRatesController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('costs.read')
  list(@Req() req: Request) {
    const { tenantId } = req.auth!.membership!;
    return withTenant(this.db, tenantId, (tx) => readRates(tx, tenantId));
  }

  /** Sets the rate for a kind of labour, for everyone or for one role. Changes apply to time recorded from now on. */
  @Put()
  @RequirePermission('costs.manage_rates')
  set(@Req() req: Request, @Body() body: unknown) {
    const input = parse(setLabourRateSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'costs.manage_rates', async (tx, auth) => {
      const { tenantId, id: memberId } = auth.membership!;
      if (
        input.roleKey &&
        !(await tx.role.findFirst({ where: { tenantId, key: input.roleKey }, select: { id: true } }))
      ) {
        throw new NotFoundException('Role not found.');
      }
      const where = { tenantId_labourType_roleKey: { tenantId, labourType: input.labourType, roleKey: input.roleKey } };
      const before = await tx.labourRate.findUnique({ where });
      await tx.labourRate.upsert({
        where,
        create: {
          tenantId,
          labourType: input.labourType,
          roleKey: input.roleKey,
          rateMinor: input.rateMinor,
          updatedById: memberId,
        },
        update: { rateMinor: input.rateMinor, updatedById: memberId, updatedAt: new Date() },
      });
      await audit(
        tx,
        auth,
        {
          action: 'labour_rate.set',
          entityType: 'labour_rate',
          changes: {
            labourType: input.labourType,
            roleKey: input.roleKey || null,
            before: before?.rateMinor ?? null,
            after: input.rateMinor,
            currency: before?.currency ?? 'GBP',
          },
        },
        req.ip,
      );
      return readRates(tx, tenantId);
    });
  }

  @Delete(':rateId')
  @RequirePermission('costs.manage_rates')
  remove(@Req() req: Request, @Param('rateId', ParseUUIDPipe) rateId: string) {
    return withWorkOrderWrite(this.db, req.auth!, 'costs.manage_rates', async (tx, auth) => {
      const { tenantId } = auth.membership!;
      const row = await tx.labourRate.findFirst({ where: { tenantId, id: rateId } });
      if (!row) throw new NotFoundException('Rate not found.');
      await tx.labourRate.delete({ where: { id: rateId } });
      await audit(
        tx,
        auth,
        {
          action: 'labour_rate.remove',
          entityType: 'labour_rate',
          entityId: rateId,
          changes: { labourType: row.labourType, roleKey: row.roleKey || null, rateMinor: row.rateMinor },
        },
        req.ip,
      );
      return readRates(tx, tenantId);
    });
  }
}
