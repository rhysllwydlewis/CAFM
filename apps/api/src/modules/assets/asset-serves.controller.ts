import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Prisma, type Tx } from '@fmstead/db';
import {
  setServesSchema,
  type AssetImpact,
  type AssetRecord,
  type AssetServesRecord,
  type ServedAsset,
  type ServedLocation,
} from '@fmstead/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { parse } from '../../core/validation';
import { locationScope } from '../locations/location-tree';
import { assetScope, fromSite, locationPaths, requireVisibleAsset, siteOf, withAssetWrite } from './asset-scope';

const toServedAsset = (a: { id: string; number: string; name: string; status: string }): ServedAsset => ({
  id: a.id,
  number: a.number,
  name: a.name,
  status: a.status as AssetRecord['status'],
});

/** The assets among `ids` that the member can see, in a stable order. */
async function visibleAssets(tx: Tx, auth: AuthContext, ids: string[]) {
  if (!ids.length) return [];
  return tx.asset.findMany({ where: { ...assetScope(auth), id: { in: ids } }, orderBy: { number: 'asc' } });
}

/** The locations among `ids` that the member can see, with their paths from the site down. */
async function visibleLocations(tx: Tx, auth: AuthContext, ids: string[]): Promise<ServedLocation[]> {
  if (!ids.length) return [];
  const rows = await tx.location.findMany({
    where: { AND: [locationScope(auth), { id: { in: ids } }] },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const paths = await locationPaths(
    tx,
    auth,
    rows.map(({ id }) => id),
  );
  return rows.map(({ id, name }) => ({ id, name, path: fromSite(paths.get(id) ?? []) }));
}

/** What an asset serves and what serves it (feature catalogue §5, "serves" relationships). */
@Controller('assets')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('assets')
export class AssetServesController {
  constructor(private readonly db: PrismaService) {}

  @Get(':id/serves')
  @RequirePermission('assets.read')
  async serves(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<AssetServesRecord> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      await requireVisibleAsset(tx, auth, id);
      return this.read(tx, auth, id);
    });
  }

  /**
   * Replaces what an asset serves. Everything named must be visible to you and
   * in the asset's site. Links to things outside your branches are left alone.
   */
  @Put(':id/serves')
  @RequirePermission('assets.manage')
  async setServes(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    const input = parse(setServesSchema, body);
    const locationIds = [...new Set(input.locationIds)];
    const assetIds = [...new Set(input.assetIds)];
    return withAssetWrite(this.db, req.auth!, 'assets.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const asset = await requireVisibleAsset(tx, auth, id);
      if (assetIds.includes(id)) {
        throw new UnprocessableEntityException({ code: 'serves_self', message: 'An asset can’t serve itself.' });
      }
      const site = await siteOf(tx, tenantId, asset.locationId);
      if (!site) {
        throw new UnprocessableEntityException({
          code: 'asset_location_invalid',
          message: 'This asset isn’t in a site, so it can’t serve anything yet.',
        });
      }
      const inSite = { ancestors: { some: { ancestorId: site.id } } };
      const foundLocations = await tx.location.count({
        where: { AND: [locationScope(auth), { id: { in: locationIds } }] },
      });
      const foundAssets = await tx.asset.count({ where: { ...assetScope(auth), id: { in: assetIds } } });
      if (foundLocations !== locationIds.length || foundAssets !== assetIds.length) throw new NotFoundException();
      const sameSite =
        (await tx.location.count({ where: { AND: [locationScope(auth), { id: { in: locationIds } }, inSite] } })) ===
          locationIds.length &&
        (await tx.asset.count({ where: { ...assetScope(auth), id: { in: assetIds }, location: inSite } })) ===
          assetIds.length;
      if (!sameSite) {
        throw new UnprocessableEntityException({
          code: 'serves_other_site',
          message: 'An asset can only serve places and assets in its own site.',
        });
      }

      const existing = await tx.assetServes.findMany({ where: { tenantId, assetId: id } });
      // Links to things this member can't see are theirs to keep, not to drop.
      const seenLocations = new Set(
        (
          await visibleLocations(
            tx,
            auth,
            existing.flatMap((r) => (r.locationId ? [r.locationId] : [])),
          )
        ).map((l) => l.id),
      );
      const seenAssets = new Set(
        (
          await visibleAssets(
            tx,
            auth,
            existing.flatMap((r) => (r.servedAssetId ? [r.servedAssetId] : [])),
          )
        ).map((a) => a.id),
      );
      const keep = (row: (typeof existing)[number]) =>
        row.locationId ? !seenLocations.has(row.locationId) : !seenAssets.has(row.servedAssetId!);
      const have = new Set(existing.map((row) => row.locationId ?? row.servedAssetId));
      const wanted = new Set([...locationIds, ...assetIds]);
      const remove = existing.filter((row) => !keep(row) && !wanted.has((row.locationId ?? row.servedAssetId)!));
      if (remove.length) await tx.assetServes.deleteMany({ where: { id: { in: remove.map((row) => row.id) } } });
      const add: Prisma.AssetServesCreateManyInput[] = [
        ...locationIds
          .filter((locationId) => !have.has(locationId))
          .map((locationId) => ({ tenantId, assetId: id, locationId })),
        ...assetIds
          .filter((servedAssetId) => !have.has(servedAssetId))
          .map((servedAssetId) => ({ tenantId, assetId: id, servedAssetId })),
      ];
      if (add.length) await tx.assetServes.createMany({ data: add });
      await audit(
        tx,
        auth,
        {
          action: 'asset.serves_updated',
          entityType: 'asset',
          entityId: id,
          changes: {
            before: {
              locationIds: existing.flatMap((r) => (r.locationId ? [r.locationId] : [])),
              assetIds: existing.flatMap((r) => (r.servedAssetId ? [r.servedAssetId] : [])),
            },
            after: { locationIds, assetIds },
          },
        },
        req.ip,
      );
      return this.read(tx, auth, id);
    });
  }

  /** Everything that depends on this asset, directly or through other assets it serves. */
  @Get(':id/impact')
  @RequirePermission('assets.read')
  async impact(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<AssetImpact> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      await requireVisibleAsset(tx, auth, id);
      // Follow asset-to-asset links outwards. The depth limit also stops a loop of assets serving each other.
      const reached = await tx.$queryRaw<{ asset_id: string; depth: number }[]>`
        WITH RECURSIVE reach(asset_id, depth) AS (
          SELECT served_asset_id, 1 FROM asset_serves
          WHERE tenant_id = ${tenantId}::uuid AND asset_id = ${id}::uuid AND served_asset_id IS NOT NULL
          UNION
          SELECT s.served_asset_id, r.depth + 1 FROM asset_serves s
          JOIN reach r ON s.asset_id = r.asset_id
          WHERE s.tenant_id = ${tenantId}::uuid AND s.served_asset_id IS NOT NULL AND r.depth < 20
        )
        SELECT asset_id, min(depth)::int AS depth FROM reach WHERE asset_id <> ${id}::uuid GROUP BY asset_id`;
      const depth = new Map(reached.map((row) => [row.asset_id, row.depth]));
      const sources = [id, ...depth.keys()];
      const places = await tx.assetServes.findMany({
        where: { tenantId, assetId: { in: sources }, locationId: { not: null } },
        select: { locationId: true },
      });
      const [assets, locations] = await Promise.all([
        visibleAssets(tx, auth, [...depth.keys()]),
        visibleLocations(tx, auth, [...new Set(places.map((row) => row.locationId!))]),
      ]);
      return {
        assets: assets
          .map((asset) => ({ ...toServedAsset(asset), depth: depth.get(asset.id)! }))
          .sort((a, b) => a.depth - b.depth || a.number.localeCompare(b.number)),
        locations,
      };
    });
  }

  private async read(tx: Tx, auth: AuthContext, id: string): Promise<AssetServesRecord> {
    const tenantId = auth.membership!.tenantId;
    const [serving, serves] = await Promise.all([
      tx.assetServes.findMany({ where: { tenantId, servedAssetId: id }, select: { assetId: true } }),
      tx.assetServes.findMany({ where: { tenantId, assetId: id }, select: { locationId: true, servedAssetId: true } }),
    ]);
    const [servedBy, assets, locations] = await Promise.all([
      visibleAssets(
        tx,
        auth,
        serving.map((row) => row.assetId),
      ),
      visibleAssets(
        tx,
        auth,
        serves.flatMap((row) => (row.servedAssetId ? [row.servedAssetId] : [])),
      ),
      visibleLocations(
        tx,
        auth,
        serves.flatMap((row) => (row.locationId ? [row.locationId] : [])),
      ),
    ]);
    return { locations, assets: assets.map(toServedAsset), servedBy: servedBy.map(toServedAsset) };
  }
}
