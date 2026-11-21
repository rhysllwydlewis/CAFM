import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma, Tx } from '@cafm/db';
import type { AuthContext } from '../../core/session';

export function allLocations(auth: AuthContext): boolean {
  const member = auth.membership;
  // A promotion grants full access. The saved branch restriction applies again after demotion.
  return auth.access?.scope === 'all' && !!member && (member.role === 'super_user' || !member.locationScoped);
}

/** The same filter applies to detail, list and any location chosen for a write. */
export function locationScope(auth: AuthContext): Prisma.LocationWhereInput {
  const { tenantId, id: membershipId } = auth.membership!;
  if (allLocations(auth)) return { tenantId };
  return { tenantId, ancestors: { some: { ancestor: { grants: { some: { tenantId, membershipId } } } } } };
}

/** Serialise tree edits, grant changes and site-limit checks for the same tenant. */
export async function lockLocations(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`locations:${tenantId}`}))`;
}

/** The site boundary stays stable even when intermediate levels are omitted. */
export async function assertLocationParent(tx: Tx, tenantId: string, kind: string, parentId: string | null) {
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
