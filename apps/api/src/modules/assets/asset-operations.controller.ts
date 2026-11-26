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
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Prisma, withTenant } from '@fmstead/db';
import {
  createAssetMeterSchema,
  createAssetTagSchema,
  recordMeterReadingSchema,
  saveWarrantySchema,
  saveWarrantyClaimSchema,
  updateWarrantyClaimSchema,
  updateWarrantySchema,
  type AssetMeterReadingItem,
  type AssetOperations,
  type AssetWarrantyItem,
  type WarrantyInput,
  type WarrantyClaimItem,
} from '@fmstead/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { requireVisibleAsset, withAssetWrite } from './asset-scope';
import { nextMeterTotal } from './meter-reading';

const PREVIEW_READINGS = 5;
const RECORD_LIMIT = 100;
const date = (value: string) => new Date(value + 'T00:00:00Z');
const day = (value: Date) => value.toISOString().slice(0, 10);
const notFound = () => new NotFoundException('Record not found on this asset.');
const limit = () => new UnprocessableEntityException('This asset has reached the limit for this type of record.');

function reading(row: {
  id: string;
  recordedAt: Date;
  value: Prisma.Decimal;
  total: Prisma.Decimal;
  rolledOver: boolean;
}): AssetMeterReadingItem {
  return {
    id: row.id,
    recordedAt: row.recordedAt.toISOString(),
    value: row.value.toFixed(),
    total: row.total.toFixed(),
    rolledOver: row.rolledOver,
  };
}

type ClaimRow = Omit<WarrantyClaimItem, 'status' | 'filedOn'> & { status: string; filedOn: Date };

function claim({ id, reference, status, filedOn, notes, version }: ClaimRow): WarrantyClaimItem {
  return { id, reference, status: status as WarrantyClaimItem['status'], filedOn: day(filedOn), notes, version };
}

function warranty(row: {
  id: string;
  provider: string;
  reference: string;
  startsOn: Date;
  expiresOn: Date;
  noticeDays: number;
  notes: string | null;
  active: boolean;
  version: number;
  claims: ClaimRow[];
}): AssetWarrantyItem {
  const { id, provider, reference, startsOn, expiresOn, noticeDays, notes, active, version } = row;
  return {
    id,
    provider,
    reference,
    startsOn: day(startsOn),
    expiresOn: day(expiresOn),
    noticeDays,
    notes,
    active,
    version,
    claims: row.claims.map(claim),
  };
}

@Controller('assets/:assetId/operations')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('assets')
export class AssetOperationsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('assets.read')
  list(@Req() req: Request, @Param('assetId', ParseUUIDPipe) assetId: string): Promise<AssetOperations> {
    const auth = req.auth!;
    const { tenantId } = auth.membership!;
    const where = { tenantId, assetId };
    return withTenant(this.db, tenantId, async (tx) => {
      await requireVisibleAsset(tx, auth, assetId);
      const [tags, meters, warranties] = await Promise.all([
        tx.assetTag.findMany({
          where,
          orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, code: true, kind: true, active: true },
        }),
        tx.assetMeter.findMany({
          where,
          orderBy: { name: 'asc' },
          include: { readings: { orderBy: { recordedAt: 'desc' }, take: PREVIEW_READINGS + 1 } },
        }),
        tx.assetWarranty.findMany({
          where,
          include: { claims: { orderBy: [{ filedOn: 'desc' }, { id: 'desc' }] } },
          orderBy: [{ active: 'desc' }, { expiresOn: 'asc' }, { id: 'asc' }],
        }),
      ]);
      return {
        tags: tags.map((tag) => ({ ...tag, kind: tag.kind as AssetOperations['tags'][number]['kind'] })),
        meters: meters.map(({ id, name, unit, rolloverAt, readings }) => ({
          id,
          name,
          unit,
          rolloverAt: rolloverAt?.toFixed() ?? null,
          readings: readings.slice(0, PREVIEW_READINGS).map(reading),
          hasMoreReadings: readings.length > PREVIEW_READINGS,
        })),
        warranties: warranties.map(warranty),
      };
    });
  }

  @Post('tags')
  @RequirePermission('assets.manage')
  createTag(@Req() req: Request, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: unknown) {
    const data = parse(createAssetTagSchema, body);
    return withAssetWrite(this.db, req.auth!, 'assets.manage', async (tx, auth) => {
      const { tenantId } = auth.membership!;
      await requireVisibleAsset(tx, auth, assetId);
      if (await tx.assetTag.findUnique({ where: { tenantId_code: { tenantId, code: data.code } } })) {
        throw new ConflictException('That tag code has already been issued in this organisation.');
      }
      if ((await tx.assetTag.count({ where: { tenantId, assetId } })) >= RECORD_LIMIT) throw limit();
      const { id, kind, code, active } = await tx.assetTag.create({ data: { tenantId, assetId, ...data } });
      await audit(
        tx,
        auth,
        { action: 'asset_tag.create', entityType: 'asset_tag', entityId: id, changes: { assetId, kind, code } },
        req.ip,
      );
      return { id, kind, code, active };
    });
  }

  @Patch('tags/:tagId/retire')
  @RequirePermission('assets.manage')
  retireTag(
    @Req() req: Request,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('tagId', ParseUUIDPipe) id: string,
  ) {
    return withAssetWrite(this.db, req.auth!, 'assets.manage', async (tx, auth) => {
      const { tenantId } = auth.membership!;
      await requireVisibleAsset(tx, auth, assetId);
      const tag = await tx.assetTag.findFirst({ where: { tenantId, assetId, id } });
      if (!tag) throw notFound();
      if (tag.active) {
        await tx.assetTag.update({ where: { id }, data: { active: false } });
        await audit(
          tx,
          auth,
          { action: 'asset_tag.retire', entityType: 'asset_tag', entityId: id, changes: { assetId } },
          req.ip,
        );
      }
      return { id, active: false };
    });
  }

  @Post('meters')
  @RequirePermission('assets.manage')
  createMeter(@Req() req: Request, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: unknown) {
    const data = parse(createAssetMeterSchema, body);
    return withAssetWrite(this.db, req.auth!, 'assets.manage', async (tx, auth) => {
      const { tenantId } = auth.membership!;
      await requireVisibleAsset(tx, auth, assetId);
      const where = { tenantId, assetId, name: { equals: data.name, mode: 'insensitive' as const } };
      if (await tx.assetMeter.findFirst({ where }))
        throw new ConflictException('A meter with this name already exists.');
      if ((await tx.assetMeter.count({ where: { tenantId, assetId } })) >= RECORD_LIMIT) throw limit();
      const { id } = await tx.assetMeter.create({ data: { tenantId, assetId, ...data } });
      await audit(
        tx,
        auth,
        { action: 'asset_meter.create', entityType: 'asset_meter', entityId: id, changes: { assetId, ...data } },
        req.ip,
      );
      return { id };
    });
  }

  @Get('meters/:meterId/readings')
  @RequirePermission('assets.read')
  listReadings(
    @Req() req: Request,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('meterId', ParseUUIDPipe) meterId: string,
    @Query('before') before: unknown,
  ) {
    const timestamp = typeof before === 'string' ? new Date(before) : null;
    if (
      before !== undefined &&
      (!timestamp || !Number.isFinite(timestamp.valueOf()) || timestamp.toISOString() !== before)
    ) {
      throw new UnprocessableEntityException('Invalid reading history cursor.');
    }
    const auth = req.auth!;
    const { tenantId } = auth.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      await requireVisibleAsset(tx, auth, assetId);
      if (!(await tx.assetMeter.findFirst({ where: { tenantId, assetId, id: meterId } }))) throw notFound();
      const rows = await tx.assetMeterReading.findMany({
        where: { tenantId, meterId, ...(timestamp && { recordedAt: { lt: timestamp } }) },
        orderBy: { recordedAt: 'desc' },
        take: 51,
      });
      return { items: rows.slice(0, 50).map(reading), hasMore: rows.length > 50 };
    });
  }

  @Post('meters/:meterId/readings')
  @RequirePermission('assets.record_readings')
  recordReading(
    @Req() req: Request,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('meterId', ParseUUIDPipe) meterId: string,
    @Body() body: unknown,
  ) {
    const data = parse(recordMeterReadingSchema, body);
    const value = new Prisma.Decimal(data.value);
    return withAssetWrite(this.db, req.auth!, 'assets.record_readings', async (tx, auth) => {
      const { tenantId } = auth.membership!;
      const asset = await requireVisibleAsset(tx, auth, assetId);
      const meter = await tx.assetMeter.findFirst({ where: { tenantId, assetId, id: meterId } });
      if (!meter) throw notFound();
      const where = { tenantId, meterId };
      const existing = await tx.assetMeterReading.findUnique({
        where: { tenantId_meterId_submission: { ...where, submission: data.submission } },
      });
      if (existing) {
        if (
          !existing.value.eq(value) ||
          existing.rolledOver !== data.rolledOver ||
          (data.recordedAt && existing.recordedAt.getTime() !== new Date(data.recordedAt).getTime())
        ) {
          throw new ConflictException('This reading submission has already been used for a different reading.');
        }
        return reading(existing);
      }
      if (asset.status === 'decommissioned')
        throw new ConflictException('Readings cannot be added to a decommissioned asset.');
      const previous = await tx.assetMeterReading.findFirst({ where, orderBy: { recordedAt: 'desc' } });
      const now = Date.now();
      const recordedAt = data.recordedAt ? new Date(data.recordedAt) : new Date(now);
      if (!Number.isFinite(recordedAt.valueOf()) || recordedAt.getTime() > now)
        throw new UnprocessableEntityException('Enter a reading time in the past.');
      if (previous && recordedAt <= previous.recordedAt)
        throw new UnprocessableEntityException('Enter a time after the last reading.');
      const total = nextMeterTotal(value, previous ?? undefined, meter.rolloverAt, data.rolledOver);
      const row = await tx.assetMeterReading.create({
        data: { ...where, submission: data.submission, recordedAt, value, total, rolledOver: data.rolledOver },
      });
      await audit(
        tx,
        auth,
        {
          action: 'asset_meter.record',
          entityType: 'asset_meter_reading',
          entityId: row.id,
          changes: { assetId, meterId, value: value.toFixed(), total: total.toFixed(), rolledOver: row.rolledOver },
        },
        req.ip,
      );
      return reading(row);
    });
  }

  @Post('warranties')
  @RequirePermission('assets.manage')
  createWarranty(@Req() req: Request, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: unknown) {
    const data = parse(saveWarrantySchema, body);
    return this.saveWarranty(req, assetId, data);
  }

  @Patch('warranties/:warrantyId')
  @RequirePermission('assets.manage')
  updateWarranty(
    @Req() req: Request,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('warrantyId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { version, ...data } = parse(updateWarrantySchema, body);
    return this.saveWarranty(req, assetId, data, { id, version });
  }

  private saveWarranty(req: Request, assetId: string, data: WarrantyInput, existing?: { id: string; version: number }) {
    if (data.startsOn > data.expiresOn)
      throw new UnprocessableEntityException('Expiry must be on or after the warranty start date.');
    const values = { ...data, startsOn: date(data.startsOn), expiresOn: date(data.expiresOn) };
    return withAssetWrite(this.db, req.auth!, 'assets.manage', async (tx, auth) => {
      const { tenantId } = auth.membership!;
      await requireVisibleAsset(tx, auth, assetId);
      const where = { tenantId, assetId };
      const previous = existing && (await tx.assetWarranty.findFirst({ where: { ...where, id: existing.id } }));
      if (existing && !previous) throw notFound();
      if (existing && previous?.version !== existing.version)
        throw new ConflictException('This warranty has changed. Reload the page and try again.');
      if (!existing && (await tx.assetWarranty.count({ where })) >= RECORD_LIMIT) throw limit();
      const row = existing
        ? await tx.assetWarranty.update({
            where: { id: existing.id },
            data: { ...values, version: { increment: 1 } },
            include: { claims: true },
          })
        : await tx.assetWarranty.create({ data: { ...where, ...values }, include: { claims: true } });
      await audit(
        tx,
        auth,
        {
          action: existing ? 'asset_warranty.update' : 'asset_warranty.create',
          entityType: 'asset_warranty',
          entityId: row.id,
          changes: {
            assetId,
            provider: row.provider,
            startsOn: data.startsOn,
            expiresOn: data.expiresOn,
            active: row.active,
            noticeDays: row.noticeDays,
            version: row.version,
          },
        },
        req.ip,
      );
      return warranty(row);
    });
  }
  @Post('warranties/:warrantyId/claims')
  @RequirePermission('assets.manage')
  fileClaim(
    @Req() req: Request,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('warrantyId', ParseUUIDPipe) warrantyId: string,
    @Body() body: unknown,
  ) {
    return this.saveClaim(req, assetId, warrantyId, parse(saveWarrantyClaimSchema, body));
  }

  @Patch('warranties/:warrantyId/claims/:claimId')
  @RequirePermission('assets.manage')
  editClaim(
    @Req() req: Request,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('warrantyId', ParseUUIDPipe) warrantyId: string,
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() body: unknown,
  ) {
    const { version, ...data } = parse(updateWarrantyClaimSchema, body);
    return this.saveClaim(req, assetId, warrantyId, data, { id: claimId, version });
  }

  private saveClaim(
    req: Request,
    assetId: string,
    warrantyId: string,
    data: Omit<WarrantyClaimItem, 'id' | 'version'>,
    existing?: { id: string; version: number },
  ) {
    return withAssetWrite(this.db, req.auth!, 'assets.manage', async (tx, auth) => {
      const { tenantId } = auth.membership!;
      await requireVisibleAsset(tx, auth, assetId);
      const parent = await tx.assetWarranty.findFirst({
        where: { tenantId, assetId, id: warrantyId },
        select: { id: true },
      });
      if (!parent) throw notFound();
      const where = { tenantId, warrantyId };
      const values = { ...data, filedOn: date(data.filedOn) };
      const previous = existing && (await tx.warrantyClaim.findFirst({ where: { ...where, id: existing.id } }));
      if (existing && !previous) throw notFound();
      if (existing && previous?.version !== existing.version)
        throw new ConflictException('This claim has changed. Reload the page and try again.');
      if (!existing && (await tx.warrantyClaim.count({ where })) >= 20) throw limit();
      const duplicate = await tx.warrantyClaim.findFirst({
        where: {
          ...where,
          reference: { equals: data.reference, mode: 'insensitive' },
          ...(existing && { id: { not: existing.id } }),
        },
      });
      if (duplicate) throw new ConflictException('This warranty already has a claim with that reference.');
      const row = existing
        ? await tx.warrantyClaim.update({ where: { id: existing.id }, data: { ...values, version: { increment: 1 } } })
        : await tx.warrantyClaim.create({ data: { ...where, ...values } });
      await audit(
        tx,
        auth,
        {
          action: existing ? 'warranty_claim.update' : 'warranty_claim.create',
          entityType: 'warranty_claim',
          entityId: row.id,
          changes: { assetId, warrantyId, status: row.status, filedOn: data.filedOn, version: row.version },
        },
        req.ip,
      );
      return claim(row);
    });
  }
}
