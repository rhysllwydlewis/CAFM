import type { Prisma } from '@prisma/client';

type LocationMember = { id: string; tenantId: string; role: string; locationScoped: boolean };

export function hasAllLocationAccess(member: LocationMember, scope: string | undefined): boolean {
  return scope === 'all' && (member.role === 'super_user' || !member.locationScoped);
}

export function scopedLocations(member: LocationMember, scope: string | undefined): Prisma.LocationWhereInput {
  const { id: membershipId, tenantId } = member;
  if (hasAllLocationAccess(member, scope)) return { tenantId };
  return { tenantId, ancestors: { some: { ancestor: { grants: { some: { tenantId, membershipId } } } } } };
}
