import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { withTenant, type Prisma, type PrismaClient, type Tx } from '@fmstead/db';
import type { Permission } from '@fmstead/shared';
import { loadAccess } from '../../core/access';
import { assertAccess } from '../../core/auth.guards';
import type { AuthContext } from '../../core/session';
import { locationScope } from '../locations/location-tree';

/**
 * An asset is visible when its location is. A member limited to some branches
 * (doc 03) sees only the assets in those branches and below.
 */
export function assetScope(auth: AuthContext): Prisma.AssetWhereInput {
  return { tenantId: auth.membership!.tenantId, location: locationScope(auth) };
}

/** Serialise asset writes per tenant, and recheck access after any change ahead of them. */
export function withAssetWrite<T>(
  db: PrismaClient,
  auth: AuthContext,
  permission: Permission,
  fn: (tx: Tx, current: AuthContext) => Promise<T>,
): Promise<T> {
  const { tenantId, id } = auth.membership!;
  return withTenant(db, tenantId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assets:${tenantId}`}))`;
    const membership = await tx.membership.findFirst({
      where: { id, tenantId, status: 'active', tenant: { status: 'active' } },
      include: { tenant: true },
    });
    if (!membership) throw new ForbiddenException({ code: 'organisation_required' });
    const access = await loadAccess(tx, tenantId, membership.role, membership.tenant.plan);
    assertAccess(access, 'assets', permission);
    return fn(tx, { ...auth, membership, access });
  });
}

/** The site a location is in (or is), or null above the site level. */
export async function siteOf(tx: Tx, tenantId: string, locationId: string) {
  const path = await tx.locationPath.findFirst({
    where: { tenantId, descendantId: locationId, ancestor: { kind: 'site' } },
    select: { ancestor: { select: { id: true, code: true, name: true } } },
  });
  return path?.ancestor ?? null;
}

/**
 * Walks up from the proposed parent. If it reaches the asset itself, the
 * parent is one of the asset's own components and the move would loop.
 */
export async function assertNoAssetCycle(tx: Tx, tenantId: string, assetId: string, parentId: string): Promise<void> {
  const [found] = await tx.$queryRaw<{ found: boolean }[]>`
    WITH RECURSIVE chain(id, parent_id) AS (
      SELECT id, parent_id FROM asset WHERE tenant_id = ${tenantId}::uuid AND id = ${parentId}::uuid
      UNION
      SELECT a.id, a.parent_id FROM asset a
      JOIN chain c ON a.tenant_id = ${tenantId}::uuid AND a.id = c.parent_id
    )
    SELECT EXISTS (SELECT 1 FROM chain WHERE id = ${assetId}::uuid) AS found`;
  if (found?.found) {
    throw new UnprocessableEntityException({
      code: 'asset_cycle',
      message: 'Choose a parent that is not one of this asset’s own components.',
    });
  }
}

/**
 * Location names from the portfolio down, for each location. Only levels the
 * member can see are included, so a member limited to one building never
 * learns the names above it.
 */
export async function locationPaths(
  tx: Tx,
  auth: AuthContext,
  locationIds: string[],
): Promise<Map<string, { id: string; name: string; kind: string }[]>> {
  const result = new Map<string, { id: string; name: string; kind: string }[]>();
  if (!locationIds.length) return result;
  const tenantId = auth.membership!.tenantId;
  const rows = await tx.$queryRaw<{ descendant_id: string; id: string; name: string; kind: string; depth: bigint }[]>`
    SELECT p.descendant_id, a.id, a.name, a.kind,
           (SELECT count(*) FROM location_path q WHERE q.tenant_id = p.tenant_id AND q.descendant_id = a.id) AS depth
    FROM location_path p
    JOIN location a ON a.tenant_id = p.tenant_id AND a.id = p.ancestor_id
    WHERE p.tenant_id = ${tenantId}::uuid AND p.descendant_id = ANY(${locationIds}::uuid[])
    ORDER BY p.descendant_id, depth`;
  const visible = new Set(
    (
      await tx.location.findMany({
        where: { ...locationScope(auth), id: { in: [...new Set(rows.map((row) => row.id))] } },
        select: { id: true },
      })
    ).map(({ id }) => id),
  );
  for (const row of rows) {
    if (!visible.has(row.id)) continue;
    const list = result.get(row.descendant_id) ?? [];
    list.push({ id: row.id, name: row.name, kind: row.kind });
    result.set(row.descendant_id, list);
  }
  return result;
}

/** The path from the site down: the levels above a site (portfolio, region) are noise on an asset. */
export function fromSite(levels: { name: string; kind: string }[]): string[] {
  const site = levels.findIndex((level) => level.kind === 'site');
  return levels.slice(site >= 0 ? site : 0).map(({ name }) => name);
}

/** An asset the member can see, or 404. */
export async function requireVisibleAsset(tx: Tx, auth: AuthContext, id: string) {
  const asset = await tx.asset.findFirst({ where: { ...assetScope(auth), id } });
  if (!asset) throw new NotFoundException({ code: 'asset_not_found', message: 'Asset not found.' });
  return asset;
}
