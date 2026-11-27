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
import { withTenant, type Prisma, type Tx } from '@fmstead/db';
import { importFileSchema, type ImportBatchRecord, type ImportPreview } from '@fmstead/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { toCsv } from '../../core/csv';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { parse } from '../../core/validation';
import { activeFields } from './locations.controller';
import { locationTemplate, planLocationImport, type LocationPlan } from './location-import';
import { addLocationPaths, allLocations, withLocationWrite } from './location-tree';

const SHOWN_ISSUES = 200;

function requireWholeEstate(auth: AuthContext) {
  // Organisation-wide managers shape the estate, so a manager limited to some sites cannot import.
  if (!allLocations(auth)) throw new ForbiddenException();
}

async function plan(tx: Tx, auth: AuthContext, csv: string): Promise<LocationPlan> {
  const tenantId = auth.membership!.tenantId;
  return planLocationImport(
    tx,
    tenantId,
    csv,
    await activeFields(tx, tenantId),
    auth.access!.entitlements.limits.sites,
  );
}

function preview(rows: number, result: LocationPlan): ImportPreview {
  return {
    rows,
    creates: result.issues.length ? 0 : result.ordered.length,
    issueCount: result.issues.length,
    issues: result.issues.slice(0, SHOWN_ISSUES),
    sample: result.ordered
      .slice(0, 20)
      .map(({ row, code, name, kind, parentCode }) => ({ row, code, name, kind, parentCode })),
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

@Controller('locations')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('locations')
export class LocationImportController {
  constructor(private readonly db: PrismaService) {}

  @Get('import/template')
  @RequirePermission('locations.manage')
  async template(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const auth = req.auth!;
    requireWholeEstate(auth);
    const tenantId = auth.membership!.tenantId;
    const fields = await withTenant(this.db, tenantId, (tx) => activeFields(tx, tenantId));
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="locations-import-template.csv"',
      'Cache-Control': 'no-store',
    });
    return `${locationTemplate(fields.keys())}\r\n`;
  }

  /** Checks a file and reports every problem without saving anything. `?format=csv` returns the error report. */
  @Post('import/preview')
  @RequirePermission('locations.manage')
  async preview(
    @Body() body: unknown,
    @Query('format') format: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { csv } = parse(importFileSchema, body);
    const auth = req.auth!;
    requireWholeEstate(auth);
    const result = await withTenant(this.db, auth.membership!.tenantId, (tx) => plan(tx, auth, csv));
    if (format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="locations-import-errors.csv"',
        'Cache-Control': 'no-store',
      });
      return toCsv(
        ['line', 'column', 'problem'],
        result.issues.map(({ row, column, message }) => [row, column, message]),
      );
    }
    return preview(result.ordered.length + result.issues.length, result);
  }

  /** All or nothing: a file with any problem makes no locations. */
  @Post('import')
  @RequirePermission('locations.manage')
  async apply(@Body() body: unknown, @Req() req: Request): Promise<ImportBatchRecord> {
    const { csv, fileName } = parse(importFileSchema, body);
    return withLocationWrite(this.db, req.auth!, 'locations.manage', async (tx, auth) => {
      requireWholeEstate(auth);
      const tenantId = auth.membership!.tenantId;
      const result = await plan(tx, auth, csv);
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
        const parentId = item.parentCode
          ? (ids.get(item.parentCode) ?? result.existingParents.get(item.parentCode)?.id ?? null)
          : null;
        const row = await tx.location.create({
          data: {
            tenantId,
            parentId,
            code: item.code,
            name: item.name,
            kind: item.kind,
            status: item.status,
            details: item.details as Prisma.InputJsonObject,
            custom: item.custom as Prisma.InputJsonObject,
          },
        });
        await addLocationPaths(tx, tenantId, row.id, parentId);
        ids.set(item.code, row.id);
        created.push(row.id);
      }
      const batch = await tx.importBatch.create({
        data: {
          tenantId,
          entityType: 'location',
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
          action: 'location.imported',
          entityType: 'import_batch',
          entityId: batch.id,
          changes: { rows: created.length, fileName: fileName ?? null },
        },
        req.ip,
      );
      return batchRecord(batch);
    });
  }

  @Get('import/batches')
  @RequirePermission('locations.manage')
  async batches(@Req() req: Request): Promise<ImportBatchRecord[]> {
    const auth = req.auth!;
    requireWholeEstate(auth);
    return withTenant(this.db, auth.membership!.tenantId, async (tx) =>
      (
        await tx.importBatch.findMany({ where: { entityType: 'location' }, orderBy: { createdAt: 'desc' }, take: 20 })
      ).map(batchRecord),
    );
  }

  /** Removes what an import made, if none of it has been used or edited since. */
  @Post('import/:batchId/rollback')
  @RequirePermission('locations.manage')
  async rollback(@Param('batchId', ParseUUIDPipe) batchId: string, @Req() req: Request): Promise<ImportBatchRecord> {
    return withLocationWrite(this.db, req.auth!, 'locations.manage', async (tx, auth) => {
      requireWholeEstate(auth);
      const batch = await tx.importBatch.findFirst({ where: { id: batchId, entityType: 'location' } });
      if (!batch) throw new NotFoundException({ code: 'import_not_found', message: 'Import not found.' });
      if (batch.status !== 'applied')
        throw new ConflictException({ code: 'import_rolled_back', message: 'This import was already rolled back.' });
      const ids = batch.createdIds as string[];
      const blocked = (message: string) => new ConflictException({ code: 'import_in_use', message });
      const rows = await tx.location.findMany({ where: { id: { in: ids } }, select: { id: true, version: true } });
      if (rows.some(({ version }) => version > 1))
        throw blocked('Some of these locations have been edited since the import.');
      const outside = { parentId: { in: ids }, id: { notIn: ids } };
      const [children, assets, requests, orders, mailboxes, serves, grants] = await Promise.all([
        tx.location.count({ where: outside }),
        tx.asset.count({ where: { locationId: { in: ids } } }),
        tx.serviceRequest.count({ where: { locationId: { in: ids } } }),
        tx.workOrder.count({ where: { locationId: { in: ids } } }),
        tx.requestMailbox.count({ where: { locationId: { in: ids } } }),
        // These two cascade on delete, so a rollback would silently erase what was added after the import.
        tx.assetServes.count({ where: { locationId: { in: ids } } }),
        tx.membershipSite.count({ where: { locationId: { in: ids } } }),
      ]);
      if (children || assets || requests || orders || mailboxes || serves || grants)
        throw blocked(
          'Some of these locations now have assets, requests, work orders, site access or other locations inside them.',
        );
      // Children first, because a location cannot be removed while others sit inside it.
      for (const id of [...ids].reverse()) await tx.location.deleteMany({ where: { id } });
      const updated = await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: 'rolled_back', rolledBackAt: new Date(), rolledBackBy: auth.membership!.id },
      });
      await audit(
        tx,
        auth,
        {
          action: 'location.import_rolled_back',
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
