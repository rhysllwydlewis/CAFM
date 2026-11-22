import { Controller, Get, NotFoundException, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Prisma } from '@cafm/db';
import { assetScanSchema, type AssetScan, type PrintableAssetTag } from '@cafm/shared';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { reportLocations } from '../helpdesk/request-scope';
import { assetScope } from './asset-scope';

@Controller('asset-tags')
@UseGuards(SessionGuard, TenantGuard)
export class AssetScanController {
  constructor(private readonly db: PrismaService) {}

  @Get('labels')
  @UseGuards(PermissionGuard)
  @RequireFeature('assets')
  @RequirePermission('assets.read')
  labels(
    @Req() req: Request,
    @Query('asset') asset: unknown,
    @Query('q') rawQuery: unknown,
  ): Promise<{ items: PrintableAssetTag[]; hasMore: boolean }> {
    const auth = req.auth!;
    const { tenantId } = auth.membership!;
    const assetId = asset === undefined ? undefined : parse(assetScanSchema, { id: asset });
    const q =
      typeof rawQuery === 'string'
        ? rawQuery
            .trim()
            .slice(0, 120)
            .replace(/[\\%_]/g, '\\$&')
        : '';
    return withTenant(this.db, tenantId, async (tx) => {
      const tags = await tx.assetTag.findMany({
        where: {
          tenantId,
          active: true,
          ...(assetId && 'id' in assetId ? { assetId: assetId.id } : {}),
          asset: assetScope(auth),
          ...(q
            ? {
                OR: [
                  { code: { contains: q, mode: 'insensitive' } },
                  { asset: { name: { contains: q, mode: 'insensitive' } } },
                  { asset: { number: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        orderBy: [{ asset: { number: 'asc' } }, { code: 'asc' }],
        select: {
          id: true,
          kind: true,
          code: true,
          active: true,
          asset: { select: { id: true, name: true, number: true } },
        },
        take: 101,
      });
      return {
        items: tags.slice(0, 100).map((tag) => ({ ...tag, kind: tag.kind as PrintableAssetTag['kind'] })),
        hasMore: tags.length > 100,
      };
    });
  }

  @Get('resolve')
  resolve(@Req() req: Request, @Query() query: unknown): Promise<AssetScan> {
    const key = parse(assetScanSchema, query);
    const auth = req.auth!;
    const { tenantId } = auth.membership!;
    const access = auth.access!;
    const mayReport = access.permissions.has('requests.create') && access.entitlements.features.includes('helpdesk');
    const mayRead = access.permissions.has('assets.read') && access.entitlements.features.includes('assets');
    const reportWhere: Prisma.AssetWhereInput = { status: { not: 'decommissioned' }, location: reportLocations(auth) };
    return withTenant(this.db, tenantId, async (tx) => {
      const tag = { tenantId, active: true, ...key };
      if (mayReport) {
        const match = await tx.assetTag.findFirst({ where: { ...tag, asset: reportWhere }, select: { assetId: true } });
        if (match) return { ...match, destination: 'report' };
      }
      if (mayRead) {
        const match = await tx.assetTag.findFirst({
          where: { ...tag, asset: assetScope(auth) },
          select: { assetId: true },
        });
        if (match) return { ...match, destination: 'register' };
      }
      throw new NotFoundException('Asset tag unavailable.');
    });
  }
}
