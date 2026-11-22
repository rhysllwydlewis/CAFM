import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { generatePpm, nextNumber, Prisma, startingPoint, withTenant, type Tx } from '@cafm/db';
import {
  createPpmScheduleSchema,
  PPM_CRITICALITIES,
  setScheduleAssetsSchema,
  updatePpmScheduleSchema,
  WORK_ORDER_FINISHED,
} from '@cafm/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { parse } from '../../core/validation';
import { assetScope } from '../assets/asset-scope';
import { getScheduleRecord, listSchedules, today } from './ppm-records';
import { eligibleAssignee, missingSchedule, staleRecord, withPpmWrite } from './ppm-scope';

const listQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    criticality: z.enum(PPM_CRITICALITIES).optional(),
    discipline: z.string().trim().max(60).optional(),
    status: z.enum(['active', 'archived', 'all']).default('active'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

type AssetInput = { assetId: string; lastDoneOn?: string };

/**
 * The assets a schedule can be put on: visible, in service, not repeated, and (for a meter schedule) each with a meter
 * of the name the schedule reads.
 */
async function checkAssets(tx: Tx, auth: AuthContext, assets: AssetInput[], meterName: string | null) {
  const tenantId = auth.membership!.tenantId;
  const ids = assets.map((asset) => asset.assetId);
  if (new Set(ids).size !== ids.length)
    throw new UnprocessableEntityException('An asset can only be on a schedule once.');
  if (!ids.length) return [];
  const found = await tx.asset.findMany({
    where: { ...assetScope(auth), id: { in: ids }, status: { not: 'decommissioned' } },
    select: { id: true, name: true, locationId: true, meters: { select: { name: true } } },
  });
  if (found.length !== ids.length)
    throw new NotFoundException('One of the assets was not found, or is out of service.');
  if (meterName) {
    const missing = found.filter((asset) => !asset.meters.some((meter) => meter.name === meterName));
    if (missing.length) {
      throw new UnprocessableEntityException(
        `${missing.map((asset) => asset.name).join(', ')} ${missing.length === 1 ? 'has' : 'have'} no meter called ${meterName}.`,
      );
    }
  }
  return found;
}

async function checkTemplateAndAssignee(tx: Tx, tenantId: string, templateId?: string, assigneeId?: string | null) {
  if (
    templateId &&
    !(await tx.ppmTaskTemplate.findFirst({ where: { tenantId, id: templateId, active: true }, select: { id: true } }))
  ) {
    throw new UnprocessableEntityException('That task isn’t in the library.');
  }
  if (assigneeId && !(await eligibleAssignee(tx, tenantId, assigneeId))) {
    throw new UnprocessableEntityException('That person can’t be given jobs.');
  }
}

const frequencyData = (frequency: z.infer<typeof createPpmScheduleSchema>['frequency']) =>
  frequency.type === 'calendar'
    ? {
        freqType: 'calendar',
        calendarUnit: frequency.unit,
        interval: frequency.interval,
        meterName: null,
        meterInterval: null,
      }
    : {
        freqType: 'meter',
        calendarUnit: null,
        interval: null,
        meterName: frequency.meterName,
        meterInterval: new Prisma.Decimal(frequency.interval),
      };

/** Where each asset on a schedule starts, written as rows. */
async function startRow(tx: Tx, tenantId: string, schedule: Prisma.PpmScheduleGetPayload<object>, input: AssetInput) {
  const point = await startingPoint(tx, tenantId, schedule, { id: input.assetId }, today(), input.lastDoneOn ?? null);
  return {
    nextDueOn: point.nextDueOn,
    nextDueTotal: point.nextDueTotal,
    lastDoneOn: input.lastDoneOn ? new Date(input.lastDoneOn + 'T00:00:00Z') : null,
  };
}

@Controller('ppm/schedules')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('ppm')
export class PpmSchedulesController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('ppm.read')
  list(@Req() req: Request, @Query() query: unknown) {
    const input = parse(listQuery, query);
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, (tx) =>
      listSchedules(
        tx,
        auth,
        {
          q: input.q || undefined,
          criticality: input.criticality,
          discipline: input.discipline || undefined,
          active: input.status === 'all' ? undefined : input.status === 'active',
        },
        input.limit,
        input.offset,
      ),
    );
  }

  @Get(':id')
  @RequirePermission('ppm.read')
  get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, (tx) => getScheduleRecord(tx, auth, id));
  }

  @Post()
  @RequirePermission('ppm.manage')
  create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(createPpmScheduleSchema, body);
    return withPpmWrite(this.db, req.auth!, 'ppm.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      await checkTemplateAndAssignee(tx, tenantId, input.templateId, input.assigneeId);
      await checkAssets(tx, auth, input.assets, input.frequency.type === 'meter' ? input.frequency.meterName : null);
      const schedule = await tx.ppmSchedule.create({
        data: {
          tenantId,
          number: await nextNumber(tx, tenantId, 'ppm_schedule'),
          title: input.title,
          templateId: input.templateId ?? null,
          discipline: input.discipline ?? null,
          criticality: input.criticality,
          ...frequencyData(input.frequency),
          mode: input.mode,
          startsOn: new Date(input.startsOn + 'T00:00:00Z'),
          leadDays: input.leadDays,
          durationMinutes: input.durationMinutes,
          priority: input.priority,
          assigneeId: input.assigneeId ?? null,
          estimatedCostMinor: input.estimatedCostMinor ?? null,
          active: input.active,
        },
      });
      for (const asset of input.assets) {
        await tx.ppmScheduleAsset.create({
          data: {
            tenantId,
            scheduleId: schedule.id,
            assetId: asset.assetId,
            ...(await startRow(tx, tenantId, schedule, asset)),
          },
        });
      }
      await audit(
        tx,
        auth,
        {
          action: 'ppm_schedule.create',
          entityType: 'ppm_schedule',
          entityId: schedule.id,
          changes: {
            number: schedule.number,
            title: schedule.title,
            frequency: input.frequency,
            mode: input.mode,
            assets: input.assets.length,
          },
        },
        req.ip,
      );
      return getScheduleRecord(tx, auth, schedule.id);
    });
  }

  /**
   * Edits the schedule. Changing how often, from when, or fixed against floating works each asset's next visit out
   * again. Jobs already raised are left alone.
   */
  @Put(':id')
  @RequirePermission('ppm.manage')
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(updatePpmScheduleSchema, body);
    return withPpmWrite(this.db, req.auth!, 'ppm.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const before = await tx.ppmSchedule.findFirst({ where: { tenantId, id } });
      if (!before) throw missingSchedule();
      if (before.version !== input.version) throw staleRecord('schedule');
      await checkTemplateAndAssignee(tx, tenantId, input.templateId, input.assigneeId);
      const rows = await tx.ppmScheduleAsset.findMany({
        where: { tenantId, scheduleId: id, active: true },
        include: { asset: { select: { meters: { select: { name: true } } } } },
      });
      if (input.frequency.type === 'meter') {
        const meterName = input.frequency.meterName;
        const missing = rows.filter((row) => !row.asset.meters.some((meter) => meter.name === meterName));
        if (missing.length) {
          throw new UnprocessableEntityException(`${missing.length} of the assets have no meter called ${meterName}.`);
        }
      }
      const schedule = await tx.ppmSchedule.update({
        where: { id },
        data: {
          title: input.title,
          templateId: input.templateId ?? null,
          discipline: input.discipline ?? null,
          criticality: input.criticality,
          ...frequencyData(input.frequency),
          mode: input.mode,
          startsOn: new Date(input.startsOn + 'T00:00:00Z'),
          leadDays: input.leadDays,
          durationMinutes: input.durationMinutes,
          priority: input.priority,
          assigneeId: input.assigneeId ?? null,
          estimatedCostMinor: input.estimatedCostMinor ?? null,
          active: input.active,
          version: { increment: 1 },
        },
      });
      const timingChanged =
        before.freqType !== schedule.freqType ||
        before.calendarUnit !== schedule.calendarUnit ||
        before.interval !== schedule.interval ||
        before.meterName !== schedule.meterName ||
        !before.meterInterval?.equals(schedule.meterInterval ?? new Prisma.Decimal(-1)) ||
        before.mode !== schedule.mode ||
        before.startsOn.getTime() !== schedule.startsOn.getTime();
      if (timingChanged) {
        for (const row of rows) {
          // A floating visit waiting to be done is counted on from when it is done, so it stays as it is.
          const waiting =
            schedule.mode === 'floating' &&
            !row.nextDueOn &&
            !row.nextDueTotal &&
            (await tx.workOrder.count({
              where: { tenantId, ppmScheduleAssetId: row.id, status: { notIn: [...WORK_ORDER_FINISHED] } },
            })) > 0;
          if (waiting) continue;
          const point = await startingPoint(
            tx,
            tenantId,
            schedule,
            { id: row.assetId },
            today(),
            row.lastDoneOn ? row.lastDoneOn.toISOString().slice(0, 10) : null,
          );
          await tx.ppmScheduleAsset.update({
            where: { id: row.id },
            data: { nextDueOn: point.nextDueOn, nextDueTotal: point.nextDueTotal },
          });
        }
      }
      await audit(
        tx,
        auth,
        {
          action: 'ppm_schedule.update',
          entityType: 'ppm_schedule',
          entityId: id,
          changes: {
            before: { title: before.title, active: before.active, mode: before.mode, leadDays: before.leadDays },
            after: { title: schedule.title, active: schedule.active, mode: schedule.mode, leadDays: schedule.leadDays },
            timingChanged,
          },
        },
        req.ip,
      );
      return getScheduleRecord(tx, auth, id);
    });
  }

  /** Sets which assets are on the schedule. An asset taken off keeps its history; one put back starts afresh. */
  @Put(':id/assets')
  @RequirePermission('ppm.manage')
  setAssets(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(setScheduleAssetsSchema, body);
    return withPpmWrite(this.db, req.auth!, 'ppm.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const schedule = await tx.ppmSchedule.findFirst({ where: { tenantId, id } });
      if (!schedule) throw missingSchedule();
      if (schedule.version !== input.version) throw staleRecord('schedule');
      await checkAssets(tx, auth, input.assets, schedule.freqType === 'meter' ? schedule.meterName : null);
      const existing = await tx.ppmScheduleAsset.findMany({ where: { tenantId, scheduleId: id } });
      const wanted = new Map(input.assets.map((asset) => [asset.assetId, asset]));
      let added = 0;
      let removed = 0;
      for (const row of existing) {
        if (wanted.has(row.assetId)) continue;
        if (!row.active) continue;
        const jobs = await tx.workOrder.count({ where: { tenantId, ppmScheduleAssetId: row.id } });
        if (jobs)
          await tx.ppmScheduleAsset.update({
            where: { id: row.id },
            data: { active: false, nextDueOn: null, nextDueTotal: null },
          });
        else await tx.ppmScheduleAsset.delete({ where: { id: row.id } });
        removed += 1;
      }
      for (const [assetId, asset] of wanted) {
        const row = existing.find((candidate) => candidate.assetId === assetId);
        if (row?.active) continue;
        const start = await startRow(tx, tenantId, schedule, asset);
        if (row) await tx.ppmScheduleAsset.update({ where: { id: row.id }, data: { active: true, ...start } });
        else await tx.ppmScheduleAsset.create({ data: { tenantId, scheduleId: id, assetId, ...start } });
        added += 1;
      }
      await tx.ppmSchedule.update({ where: { id }, data: { version: { increment: 1 } } });
      await audit(
        tx,
        auth,
        {
          action: 'ppm_schedule.assets',
          entityType: 'ppm_schedule',
          entityId: id,
          changes: { added, removed, total: input.assets.length },
        },
        req.ip,
      );
      return getScheduleRecord(tx, auth, id);
    });
  }

  /** Raises the jobs that are due within the lead time now, instead of waiting for the next hourly run. */
  @Post(':id/generate')
  @RequirePermission('ppm.manage')
  generate(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return withPpmWrite(this.db, req.auth!, 'ppm.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      if (!(await tx.ppmSchedule.findFirst({ where: { tenantId, id }, select: { id: true } }))) throw missingSchedule();
      const result = await generatePpm(tx, { tenantId, today: today(), scheduleId: id });
      await audit(
        tx,
        auth,
        {
          action: 'ppm_schedule.generate',
          entityType: 'ppm_schedule',
          entityId: id,
          changes: { created: result.created, skipped: result.skipped },
        },
        req.ip,
      );
      return { created: result.created, skipped: result.skipped };
    });
  }
}

/** Raises the jobs that are due for every schedule. */
@Controller('ppm/generate')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('ppm')
export class PpmGenerateController {
  constructor(private readonly db: PrismaService) {}

  @Post()
  @RequirePermission('ppm.manage')
  generate(@Req() req: Request) {
    return withPpmWrite(this.db, req.auth!, 'ppm.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const result = await generatePpm(tx, { tenantId, today: today() });
      await audit(
        tx,
        auth,
        {
          action: 'ppm.generate',
          entityType: 'ppm_schedule',
          entityId: tenantId,
          changes: { created: result.created, skipped: result.skipped },
        },
        req.ip,
      );
      return { created: result.created, skipped: result.skipped };
    });
  }
}
