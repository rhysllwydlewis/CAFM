import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasAllLocationAccess, scopedLocations, type Tx } from '@fmstead/db';
import type { AuthContext } from './session';
import { dataScope } from './data-scope';

/**
 * Delegated administration (doc 03 § Delegate administration). Someone with
 * people permissions who is limited to certain sites is a delegated admin:
 * they can manage only people who are themselves limited to sites inside
 * their own, and never Super Users or anyone with organisation-wide access.
 */
export function isDelegated(auth: AuthContext): boolean {
  return !hasAllLocationAccess(auth.membership!, auth.access?.scope);
}

/**
 * The people this admin may manage: `null` means everyone (not delegated).
 * Otherwise every member who is site-limited, is not a Super User, and has
 * only sites the admin can also reach. The admin themself is never included.
 */
export async function administrableMembers(tx: Tx, auth: AuthContext): Promise<Set<string> | null> {
  if (!isDelegated(auth)) return null;
  const { id: actorId, tenantId } = auth.membership!;
  const reachable = new Set(
    (
      await tx.location.findMany({
        where: scopedLocations(auth.membership!, auth.access?.scope),
        select: { id: true },
      })
    ).map((l) => l.id),
  );
  const [members, grants] = await Promise.all([
    tx.membership.findMany({
      where: { tenantId, locationScoped: true, NOT: [{ role: 'super_user' }, { id: actorId }] },
      select: { id: true },
    }),
    tx.membershipSite.findMany({ where: { tenantId }, select: { membershipId: true, locationId: true } }),
  ]);
  const outside = new Set(grants.filter((g) => !reachable.has(g.locationId)).map((g) => g.membershipId));
  return new Set(members.filter((m) => !outside.has(m.id)).map((m) => m.id));
}

/** A delegated admin asking about someone outside their sites gets "not found", as if they don't exist. */
export async function assertAdministrable(tx: Tx, auth: AuthContext, membershipId: string): Promise<void> {
  const allowed = await administrableMembers(tx, auth);
  if (allowed && !allowed.has(membershipId)) throw new NotFoundException();
}

/** Invitations carry no site, so only organisation-wide admins send them. */
export function assertNotDelegated(auth: AuthContext): void {
  if (isDelegated(auth)) throw orgWide('Invitations are managed by an organisation-wide administrator.');
}

/**
 * Teams carry no site, so someone limited to sites cannot change them (reading is allowed). Nor can
 * anyone whose data scope is "team": team membership decides what a team-scoped person sees, so
 * they could widen their own access by adding themself to a team.
 */
export function assertNotSiteLimited(auth: AuthContext): void {
  if (auth.membership!.locationScoped || dataScope(auth) === 'team')
    throw orgWide('Teams are managed by an organisation-wide administrator.');
}

function orgWide(message: string): ForbiddenException {
  return new ForbiddenException({ code: 'delegated_admin_limit', message });
}
