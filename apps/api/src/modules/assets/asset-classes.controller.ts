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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Prisma } from '@fmstead/db';
import { createAssetClassSchema, updateAssetClassSchema, type AssetClassRecord } from '@fmstead/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { recordVersion } from '../../core/config';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

type Row = Prisma.AssetClassGetPayload<object>;

function toRecord(row: Row): AssetClassRecord {
  return {
    id: row.id,
    scheme: row.scheme as AssetClassRecord['scheme'],
    code: row.code,
    name: row.name,
    group: row.group,
    attributes: row.attributes as unknown as AssetClassRecord['attributes'],
    position: row.position,
    active: row.active,
  };
}

/** What a class version keeps: everything an administrator can change. */
function snapshot(row: Row): Prisma.InputJsonValue {
  const { scheme, code, name, group, attributes, position, active } = row;
  return { scheme, code, name, group, attributes, position, active } as Prisma.InputJsonValue;
}

/** The classification scheme and each class's attribute template (feature catalogue §5). */
@Controller('asset-classes')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('assets')
export class AssetClassesController {
  constructor(private readonly db: PrismaService) {}

  /** Everyone who can see assets needs the classes to read and filter them. Only managers see retired ones. */
  @Get()
  @RequirePermission('assets.read')
  async list(@Query('includeInactive') includeInactive: string | undefined, @Req() req: Request) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const all = includeInactive === 'true' && auth.access!.permissions.has('assets.manage');
    return withTenant(this.db, tenantId, async (tx) =>
      (
        await tx.assetClass.findMany({
          where: { tenantId, ...(all ? {} : { active: true }) },
          orderBy: [{ group: 'asc' }, { position: 'asc' }, { name: 'asc' }],
        })
      ).map(toRecord),
    );
  }

  @Post()
  @RequirePermission('assets.manage')
  async create(@Body() body: unknown, @Req() req: Request) {
    const input = parse(createAssetClassSchema, body);
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const taken = await tx.assetClass.findUnique({
        where: { tenantId_scheme_code: { tenantId, scheme: input.scheme, code: input.code } },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException({ code: 'asset_class_exists', message: 'That class code is already in use.' });
      }
      const row = await tx.assetClass.create({ data: { ...input, tenantId } });
      const version = await recordVersion(tx, auth, 'asset_class', row.id, snapshot(row));
      await audit(
        tx,
        auth,
        {
          action: 'asset_class.created',
          entityType: 'asset_class',
          entityId: row.id,
          changes: { after: snapshot(row), version },
        },
        req.ip,
      );
      return toRecord(row);
    });
  }

  @Patch(':id')
  @RequirePermission('assets.manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    const input = parse(updateAssetClassSchema, body);
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const before = await tx.assetClass.findFirst({ where: { id, tenantId } });
      if (!before) throw new NotFoundException({ code: 'asset_class_not_found', message: 'Class not found.' });
      const row = await tx.assetClass.update({ where: { id }, data: input });
      const version = await recordVersion(tx, auth, 'asset_class', id, snapshot(row));
      await audit(
        tx,
        auth,
        {
          action: 'asset_class.updated',
          entityType: 'asset_class',
          entityId: id,
          changes: { before: snapshot(before), after: snapshot(row), version },
        },
        req.ip,
      );
      return toRecord(row);
    });
  }
}
