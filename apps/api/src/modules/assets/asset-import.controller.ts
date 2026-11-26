import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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
import { activeCustomFields, nextNumber } from '../../core/config';
import { toCsv } from '../../core/csv';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { allLocations } from '../locations/location-tree';
import { assetScope, withAssetWrite } from './asset-scope';
import { assetTemplate, planAssetImport, type AssetPlan } from './asset-import';

const SHOWN_ISSUES = 200;

function preview(rows: number, result: AssetPlan): ImportPreview {
  return {
    rows,
    creates: result.issues.length ? 0 : result.ordered.length,
    issueCount: result.issues.length,
    issues: result.issues.slice(0, SHOWN_ISSUES),
    sample: result.ordered.slice(0, 20).map(({ row, ref, name, className, parent }) => ({
      row,
      code: ref,
      name,
      kind: className ?? '',
      parentCode: parent,
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

@Controller('assets')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('assets')
export class AssetImportController {
  constructor(private readonly db: PrismaService) {}

  @Get('import/template')
  @RequirePermission('assets.manage')
  async template(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tenantId = req.auth!.membership!.tenantId;
    const fields = await withTenant(this.db, tenantId, (tx) => activeCustomFields(tx, tenantId, 'asset'));
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="assets-import-template.csv"',
      'Cache-Control': 'no-store',
    });
    return `${assetTemplate(fields.keys())}\r\n`;
  }

  /** Checks a file and reports every problem without saving anything. `?format=csv` returns the error report. */
  @Post('import/preview')
  @RequirePermission('assets.manage')
  async preview(
    @Body() body: unknown,
    @Query('format') format: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { csv } = parse(importFileSchema, body);
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const result = await withTenant(this.db, tenantId, async (tx) =>
      planAssetImport(tx, auth, csv, await activeCustomFields(tx, tenantId, 'asset')),
    );
    if (format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="assets-import-errors.csv"',
        'Cache-Control': 'no-store',
      });
      return toCsv(
        ['line', 'column', 'problem'],
        result.issues.map(({ row, column, message }) => [row, column, message]),
      );
    }
    return preview(result.ordered.length + result.issues.length, result);
  }

  /** All or nothing: a file with any problem makes no assets. */
  @Post('import')
  @RequirePermission('assets.manage')
  async apply(@Body() body: unknown, @Req() req: Request): Promise<ImportBatchRecord> {
    const { csv, fileName } = parse(importFileSchema, body);
    return withAssetWrite(this.db, req.auth!, 'assets.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const result = await planAssetImport(tx, auth, csv, await activeCustomFields(tx, tenantId, 'asset'));
      if (result.issues.length) {
        throw new UnprocessableEntityException({
          code: 'import_invalid',
          message: 'Fix the problems in the file and try again. Nothing was imported.',
          issueCount: result.issues.length,
          issues: result.issues.slice(0, SHOWN_ISSUES),
        });
      }
      const ids = new Map<string, string>();
      const created: string[] = [];
      for (const item of result.ordered) {
        const parentId = item.parent
          ? (ids.get(item.parent.toLowerCase()) ?? result.existingParents.get(item.parent.toLowerCase()) ?? null)
          : null;
        const { installedOn, replacementCostMinor, ...data } = item.data;
        const row = await tx.asset.create({
          data: {
            ...data,
            tenantId,
            number: await nextNumber(tx, tenantId, 'asset', { SITE: item.siteCode }),
            name: item.name,
            locationId: item.locationId,
            parentId,
            classId: item.classId,
            installedOn: installedOn ? new Date(`${installedOn}T00:00:00Z`) : null,
            replacementCostMinor,
            attributes: item.attributes,
            custom: item.custom,
          },
        });
        if (item.ref) ids.set(item.ref.toLowerCase(), row.id);
        created.push(row.id);
      }
      const batch = await tx.importBatch.create({
        data: {
          tenantId,
          entityType: 'asset',
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
          action: 'asset.imported',
          entityType: 'import_batch',
          entityId: batch.id,
          changes: { rows: created.length, fileName: fileName ?? null },
        },
        req.ip,
      );
      return batchRecord(batch);
    });
  }

  /** A member limited to some sites sees only imports whose assets are all inside their sites. */
  @Get('import/batches')
  @RequirePermission('assets.manage')
  async batches(@Req() req: Request): Promise<ImportBatchRecord[]> {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const rows = await tx.importBatch.findMany({
        where: { entityType: 'asset' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      if (allLocations(auth)) return rows.map(batchRecord);
      const visible: typeof rows = [];
      for (const row of rows) {
        const ids = row.createdIds as string[];
        // A rolled-back import has no assets left to check, so it stays with whole-estate managers.
        if (row.status !== 'applied') continue;
        if ((await tx.asset.count({ where: { AND: [assetScope(auth), { id: { in: ids } }] } })) === ids.length)
          visible.push(row);
      }
      return visible.map(batchRecord);
    });
  }

  /** Removes what an import made, if none of it has been used or edited since. */
  @Post('import/:batchId/rollback')
  @RequirePermission('assets.manage')
  async rollback(@Param('batchId', ParseUUIDPipe) batchId: string, @Req() req: Request): Promise<ImportBatchRecord> {
    return withAssetWrite(this.db, req.auth!, 'assets.manage', async (tx, auth) => {
      const batch = await tx.importBatch.findFirst({ where: { id: batchId, entityType: 'asset' } });
      if (!batch) throw new NotFoundException({ code: 'import_not_found', message: 'Import not found.' });
      if (batch.status !== 'applied')
        throw new ConflictException({ code: 'import_rolled_back', message: 'This import was already rolled back.' });
      const ids = batch.createdIds as string[];
      const blocked = (message: string) => new ConflictException({ code: 'import_in_use', message });
      const rows = await tx.asset.findMany({
        where: { id: { in: ids } },
        select: { id: true, version: true, parentId: true },
      });
      // A manager limited to some sites cannot remove assets they cannot see.
      const visible = await tx.asset.count({ where: { AND: [assetScope(auth), { id: { in: ids } }] } });
      if (visible !== rows.length) throw new ForbiddenException();
      if (rows.some(({ version }) => version > 1))
        throw blocked('Some of these assets have been edited since the import.');
      const inBatch = { in: ids };
      const [children, serves, requests, orders, ppm, tags, meters, warranties, files, notices] = await Promise.all([
        tx.asset.count({ where: { parentId: inBatch, id: { notIn: ids } } }),
        tx.assetServes.count({ where: { OR: [{ assetId: inBatch }, { servedAssetId: inBatch }] } }),
        tx.serviceRequest.count({ where: { assetId: inBatch } }),
        tx.workOrder.count({ where: { assetId: inBatch } }),
        tx.ppmScheduleAsset.count({ where: { assetId: inBatch } }),
        tx.assetTag.count({ where: { assetId: inBatch } }),
        tx.assetMeter.count({ where: { assetId: inBatch } }),
        tx.assetWarranty.count({ where: { assetId: inBatch } }),
        tx.recordAttachment.count({ where: { assetId: inBatch } }),
        tx.notification.count({ where: { assetId: inBatch } }),
      ]);
      if (children || serves || requests || orders || ppm || tags || meters || warranties || files || notices)
        throw blocked(
          'Some of these assets now have requests, work orders, schedules, links, tags, meters, warranties, files or components.',
        );
      // Components first, because an asset cannot be removed while others sit under it.
      for (const id of [...ids].reverse()) await tx.asset.deleteMany({ where: { id } });
      const updated = await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: 'rolled_back', rolledBackAt: new Date(), rolledBackBy: auth.membership!.id },
      });
      await audit(
        tx,
        auth,
        {
          action: 'asset.import_rolled_back',
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
