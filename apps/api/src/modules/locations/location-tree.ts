import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { hasAllLocationAccess, scopedLocations, withTenant, type Prisma, type PrismaClient, type Tx } from '@cafm/db';
import { canContain, type LocationCrumb, type LocationKind, type Permission } from '@cafm/shared';
import { loadAccess } from '../../core/access';
import { assertAccess } from '../../core/auth.guards';
import type { AuthContext } from '../../core/session';

export function allLocations(auth: AuthContext): boolean {
  const member = auth.membership;
  // A promotion grants full access. The saved branch restriction applies again after demotion.
  return !!member && hasAllLocationAccess(member, auth.access?.scope);
}

/** The same filter applies to detail, list and any location chosen for a write. */
export function locationScope(auth: AuthContext): Prisma.LocationWhereInput {
  return scopedLocations(auth.membership!, auth.access?.scope);
}

/** Serialise writes and recheck access after any grant change ahead of them. */
export function withLocationWrite<T>(
  db: PrismaClient,
  auth: AuthContext,
  permission: Permission,
  fn: (tx: Tx, current: AuthContext) => Promise<T>,
): Promise<T> {
  const { tenantId, id } = auth.membership!;
  return withTenant(db, tenantId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`locations:${tenantId}`}))`;
    const membership = await tx.membership.findFirst({
      where: { id, tenantId, status: 'active', tenant: { status: 'active' } },
      include: { tenant: true },
    });
    if (!membership) throw new ForbiddenException({ code: 'organisation_required' });
    const access = await loadAccess(tx, tenantId, membership.role, membership.tenant.plan);
    assertAccess(access, 'locations', permission);
    return fn(tx, { ...auth, membership, access });
  });
}

/**
 * A location sits inside a shallower level, and the site boundary stays stable even when
 * intermediate levels are omitted.
 */
export async function assertLocationParent(tx: Tx, tenantId: string, kind: string, parentId: string | null) {
  if (parentId) {
    const parent = await tx.location.findFirst({ where: { tenantId, id: parentId }, select: { kind: true } });
    if (parent && !canContain(parent.kind as LocationKind, kind as LocationKind)) {
      throw new UnprocessableEntityException({
        code: 'invalid_location_parent',
        message: `A ${kind} can’t go inside a ${parent.kind}.`,
      });
    }
  }
  const requiresSite = !['portfolio', 'region', 'site'].includes(kind);
  const underSite =
    parentId !== null &&
    (await tx.locationPath.count({
      where: { tenantId, descendantId: parentId, ancestor: { kind: 'site' } },
    })) > 0;
  if (requiresSite !== underSite) {
    throw new UnprocessableEntityException({
      code: 'invalid_location_parent',
      message: requiresSite ? 'Choose a parent within a site.' : 'Choose a parent outside any site.',
    });
  }
}

export async function addLocationPaths(tx: Tx, tenantId: string, id: string, parentId: string | null) {
  await tx.locationPath.create({ data: { tenantId, ancestorId: id, descendantId: id } });
  if (parentId)
    await tx.$executeRaw`
    INSERT INTO location_path (tenant_id, ancestor_id, descendant_id)
    SELECT tenant_id, ancestor_id, ${id}::uuid FROM location_path
    WHERE tenant_id = ${tenantId}::uuid AND descendant_id = ${parentId}::uuid`;
}

/** Replace only the links from outside the moved branch. Keep its internal links. */
export async function moveLocationPaths(tx: Tx, tenantId: string, id: string, parentId: string | null) {
  if (parentId && (await tx.locationPath.findFirst({ where: { tenantId, ancestorId: id, descendantId: parentId } }))) {
    throw new UnprocessableEntityException({ code: 'location_cycle', message: 'Choose a parent outside this branch.' });
  }
  await tx.$executeRaw`
    DELETE FROM location_path AS path
    USING location_path AS old_parent, location_path AS branch
    WHERE path.tenant_id = ${tenantId}::uuid
      AND old_parent.tenant_id = path.tenant_id AND branch.tenant_id = path.tenant_id
      AND old_parent.descendant_id = ${id}::uuid AND old_parent.ancestor_id <> ${id}::uuid
      AND branch.ancestor_id = ${id}::uuid
      AND path.ancestor_id = old_parent.ancestor_id AND path.descendant_id = branch.descendant_id`;
  if (parentId)
    await tx.$executeRaw`
    INSERT INTO location_path (tenant_id, ancestor_id, descendant_id)
    SELECT parent.tenant_id, parent.ancestor_id, branch.descendant_id
    FROM location_path AS parent
    JOIN location_path AS branch ON branch.tenant_id = parent.tenant_id
    WHERE parent.tenant_id = ${tenantId}::uuid AND parent.descendant_id = ${parentId}::uuid
      AND branch.ancestor_id = ${id}::uuid`;
}

/**
 * The ancestors of a location that the member can see, from the top down. Visibility covers a branch and
 * everything below it, so the visible ancestors always form one unbroken run ending at the parent.
 */
export async function visibleAncestors(
  tx: Tx,
  auth: AuthContext,
  id: string,
  parentId: string | null,
): Promise<LocationCrumb[]> {
  const rows = await tx.locationPath.findMany({
    where: {
      tenantId: auth.membership!.tenantId,
      descendantId: id,
      ancestorId: { not: id },
      ancestor: locationScope(auth),
    },
    select: { ancestor: { select: { id: true, name: true, code: true, kind: true, parentId: true } } },
  });
  const byId = new Map(rows.map(({ ancestor }) => [ancestor.id, ancestor]));
  const path: LocationCrumb[] = [];
  for (let next = parentId; next && byId.has(next) && path.length < rows.length;) {
    const { parentId: above, ...crumb } = byId.get(next)!;
    path.unshift({ ...crumb, kind: crumb.kind as LocationKind });
    next = above;
  }
  return path;
}
