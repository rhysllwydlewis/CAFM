import type { Prisma } from '@cafm/db';
import type { AuthContext } from './session';

/**
 * Data scope filters (doc 03). A role's scope is `all`, `team` (my records and those of people
 * who share a team with me) or `own` (only mine). Anything else is treated as `own`, so a
 * scope this code doesn't know can never widen what someone sees.
 */
export type DataScope = 'all' | 'team' | 'own';

export function dataScope(auth: AuthContext): DataScope {
  const scope = auth.access?.scope;
  return scope === 'all' || scope === 'team' ? scope : 'own';
}

/** People who share at least one team with the signed-in member (not including themself). */
function teammates(tenantId: string, membershipId: string): Prisma.MembershipWhereInput {
  return {
    teamMemberships: { some: { tenantId, team: { members: { some: { tenantId, membershipId } } } } },
  };
}

/** The people whose records the signed-in member may see: themself, plus their teammates for `team`. */
export function visibleMembers(auth: AuthContext): Prisma.MembershipWhereInput {
  const { id, tenantId } = auth.membership!;
  const scope = dataScope(auth);
  if (scope === 'all') return {};
  if (scope === 'own') return { id };
  return { OR: [{ id }, teammates(tenantId, id)] };
}
