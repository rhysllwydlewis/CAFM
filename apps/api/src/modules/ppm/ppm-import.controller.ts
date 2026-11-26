import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { withTenant, type Prisma } from '@fmstead/db';
import { importFileSchema, type ImportBatchRecord, type ImportPreview } from '@fmstead/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { nextNumber } from '../../core/config';
import { toCsv } from '../../core/csv';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { allLocations } from '../locations/location-tree';
import { planPpmImport, ppmTemplate, type PpmPlan } from './ppm-import';
import { frequencyData, startRow } from './ppm-schedules.controller';
import { withPpmWrite } from './ppm-scope';

const SHOWN_ISSUES = 200;

function preview(result: PpmPlan): ImportPreview {
  return {
    rows: result.rows,
    creates: result.issues.length ? 0 : result.ordered.length,
    issueCount: result.issues.length,
    issues: result.issues.slice(0, SHOWN_ISSUES),
    // The shared preview shape names its columns for locations: code is the title, kind the frequency.
    sample: result.ordered.slice(0, 20).map(({ row, input }) => ({
      row,
      code: input.title,
      name: input.title,
      kind:
        input.frequency.type === 'calendar'
          ? `Every ${input.frequency.interval} ${input.frequency.unit}${input.frequency.interval === 1 ? '' : 's'}`
          : `Every ${input.frequency.interval} on ${input.frequency.meterName}`,
      parentCode: null,
    })),
  };
}

function batchRecord(row: Prisma.ImportBatchGetPayload<object>): ImportBatchRecord {
  return {
    id: row.id,
    entityType: row.entityType,
    fileName: row.fileName,
    status: row.status as ImportBatchRecord['status'],
    rowCount: row.rowCount,
    createdAt: row.createdAt.toISOString(),
    rolledBackAt: row.rolledBackAt?.toISOString() ?? null,
  };
}

/**
 * Imports PPM schedules. Like every schedule change it needs ppm.manage and access to the whole estate, and it
 * follows the same rules as the schedule form for each row.
 */
@Controller('ppm/schedules/import')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('ppm')
export class PpmImportController {
  constructor(private readonly db: PrismaService) {}

  @Get('template')
  @RequirePermission('ppm.manage')
  template(@Res({ passthrough: true }) res: Response) {
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ppm-schedules-import-template.csv"',
      'Cache-Control': 'no-store',
    });
    return `${ppmTemplate()}\r\n`;
  }

  /** Checks a file and reports every problem without saving anything. `?format=csv` returns the error report. */
  @Post('preview')
  @RequirePermission('ppm.manage')
  async preview(
    @Body() body: unknown,
    @Query('format') format: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { csv } = parse(importFileSchema, body);
    const result = await withPpmWrite(this.db, req.auth!, 'ppm.manage', (tx, auth) => planPpmImport(tx, auth, csv));
    if (format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ppm-schedules-import-errors.csv"',
        'Cache-Control': 'no-store',
      });
      return toCsv(
        ['line', 'column', 'problem'],
        result.issues.map(({ row, column, message }) => [row, column, message]),
      );
    }
    return preview(result);
  }

  /** All or nothing: a file with any problem makes no schedules. */
  @Post()
  @RequirePermission('ppm.manage')
  async apply(@Body() body: unknown, @Req() req: Request): Promise<ImportBatchRecord> {
    const { csv, fileName } = parse(importFileSchema, body);
    return withPpmWrite(this.db, req.auth!, 'ppm.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const result = await planPpmImport(tx, auth, csv);
      if (result.issues.length) {
        throw new UnprocessableEntityException({
          code: 'import_invalid',
          message: 'Fix the problems in the file and try again. Nothing was imported.',
          issueCount: result.issues.length,
          issues: result.issues.slice(0, SHOWN_ISSUES),
        });
      }
      const created: string[] = [];
      for (const item of result.ordered) {
        const { input } = item;
        const schedule = await tx.ppmSchedule.create({
          data: {
            tenantId,
            number: await nextNumber(tx, tenantId, 'ppm_schedule'),
            title: input.title,
            discipline: input.discipline ?? null,
            criticality: input.criticality,
            ...frequencyData(input.frequency),
            mode: input.mode,
            startsOn: new Date(input.startsOn + 'T00:00:00Z'),
            leadDays: input.leadDays,
            durationMinutes: input.durationMinutes,
            priority: input.priority,
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
        created.push(schedule.id);
      }
      const batch = await tx.importBatch.create({
        data: {
          tenantId,
          entityType: 'ppm_schedule',
          fileName: fileName ?? null,
          rowCount: created.length,
          createdIds: created,
          createdBy: auth.membership!.id,
        },
      });
      await audit(
        tx,
        auth,
        {
          action: 'ppm_schedule.imported',
          entityType: 'import_batch',
          entityId: batch.id,
          changes: { rows: created.length, fileName: fileName ?? null },
        },
        req.ip,
      );
      return batchRecord(batch);
    });
  }

  /** Planning maintenance needs the whole estate, so only people with all locations see these imports. */
  @Get('batches')
  @RequirePermission('ppm.manage')
  async batches(@Req() req: Request): Promise<ImportBatchRecord[]> {
    const auth = req.auth!;
    if (!allLocations(auth)) return [];
    return withTenant(this.db, auth.membership!.tenantId, async (tx) =>
      (
        await tx.importBatch.findMany({
          where: { entityType: 'ppm_schedule' },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      ).map(batchRecord),
    );
  }

  /** Removes what an import made, if none of it has been edited or has raised jobs since. */
  @Post(':batchId/rollback')
  @RequirePermission('ppm.manage')
  async rollback(@Param('batchId', ParseUUIDPipe) batchId: string, @Req() req: Request): Promise<ImportBatchRecord> {
    return withPpmWrite(this.db, req.auth!, 'ppm.manage', async (tx, auth) => {
      const batch = await tx.importBatch.findFirst({ where: { id: batchId, entityType: 'ppm_schedule' } });
      if (!batch) throw new NotFoundException({ code: 'import_not_found', message: 'Import not found.' });
      if (batch.status !== 'applied')
        throw new ConflictException({ code: 'import_rolled_back', message: 'This import was already rolled back.' });
      const ids = batch.createdIds as string[];
      const blocked = (message: string) => new ConflictException({ code: 'import_in_use', message });
      const rows = await tx.ppmSchedule.findMany({ where: { id: { in: ids } }, select: { id: true, version: true } });
      if (rows.some(({ version }) => version > 1))
        throw blocked('Some of these schedules have been edited since the import.');
      const orders = await tx.workOrder.count({ where: { ppmScheduleAsset: { scheduleId: { in: ids } } } });
      if (orders) throw blocked('Jobs have been raised from some of these schedules.');
      // The asset rows go with their schedule.
      await tx.ppmSchedule.deleteMany({ where: { id: { in: ids } } });
      const updated = await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: 'rolled_back', rolledBackAt: new Date(), rolledBackBy: auth.membership!.id },
      });
      await audit(
        tx,
        auth,
        {
          action: 'ppm_schedule.import_rolled_back',
          entityType: 'import_batch',
          entityId: batch.id,
          changes: { rows: rows.length },
        },
        req.ip,
      );
      return batchRecord(updated);
    });
  }
}
