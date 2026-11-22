import type { Tx } from './index';

/** Licences that can be given jobs: office staff, and the field and contractor people who do them. */
export const JOB_LICENCES = ['full', 'mobile', 'contractor'] as const;

/**
 * Whether this member can do jobs at the location: an active person with a full, mobile or contractor licence whose role can
 * see and work on jobs, with access to the location (everywhere, or a granted site above it).
 */
export async function eligibleTechnician(tx: Tx, tenantId: string, id: string, locationId: string): Promise<boolean> {
  const member = await tx.membership.findFirst({
    where: { tenantId, id, status: 'active', licence: { in: [...JOB_LICENCES] } },
    select: { role: true, locationScoped: true },
  });
  if (!member) return false;
  const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: member.role } } });
  if (!role?.permissions.includes('work_orders.read')) return false;
  if (!role.permissions.includes('work_orders.close') && !role.permissions.includes('work_orders.edit')) return false;
  if (role.scope === 'all' && (!member.locationScoped || member.role === 'super_user')) return true;
  return !!(await tx.membershipSite.findFirst({
    where: { tenantId, membershipId: id, location: { descendants: { some: { descendantId: locationId } } } },
    select: { membershipId: true },
  }));
}
