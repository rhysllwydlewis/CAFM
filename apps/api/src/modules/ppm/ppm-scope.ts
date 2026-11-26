import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasAllLocationAccess, withTenant, type PrismaClient, type Tx } from '@fmstead/db';
import type { Permission } from '@fmstead/shared';
import { loadAccess } from '../../core/access';
import { assertAccess } from '../../core/auth.guards';
import type { AuthContext } from '../../core/session';
import { JOB_LICENCES } from '../work-orders/work-order-records';

/**
 * Serialises PPM writes with every other job write for the organisation (the lock the work order code and the
 * generator take) and rechecks the member's access in the transaction. Planning maintenance for the estate needs the
 * whole estate: people limited to some sites can see what is on their sites but not change schedules.
 */
export function withPpmWrite<T>(
  db: PrismaClient,
  auth: AuthContext,
  permission: Permission,
  fn: (tx: Tx, current: AuthContext) => Promise<T>,
): Promise<T> {
  const { tenantId, id } = auth.membership!;
  return withTenant(db, tenantId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'work_orders:' + tenantId}))`;
    const member = await tx.membership.findFirst({
      where: { id, tenantId, status: 'active', tenant: { status: 'active' } },
      include: { tenant: true },
    });
    if (!member) throw new ForbiddenException({ code: 'organisation_required' });
    const access = await loadAccess(tx, tenantId, member.role, member.tenant.plan);
    assertAccess(access, 'ppm', permission);
    if (!hasAllLocationAccess(member, access.scope)) {
      throw new ForbiddenException('Planned maintenance can only be changed by people with access to every location.');
    }
    return fn(tx, { ...auth, membership: member, access });
  });
}

export const missingTemplate = () =>
  new NotFoundException({ code: 'ppm_template_not_found', message: 'Task template not found.' });
export const missingSchedule = () =>
  new NotFoundException({ code: 'ppm_schedule_not_found', message: 'PPM schedule not found.' });
export const staleRecord = (what: string) =>
  new ConflictException({
    code: 'stale_ppm',
    message: `This ${what} has changed. Refresh it and try again.`,
  });

/** Whether this member can be given jobs: active, with a licence for field work and a role that works on jobs. */
export async function eligibleAssignee(tx: Tx, tenantId: string, memberId: string): Promise<boolean> {
  const member = await tx.membership.findFirst({
    where: { tenantId, id: memberId, status: 'active', licence: { in: [...JOB_LICENCES] } },
    select: { role: true },
  });
  if (!member) return false;
  const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: member.role } } });
  return (
    !!role?.permissions.includes('work_orders.read') &&
    (role.permissions.includes('work_orders.close') || role.permissions.includes('work_orders.edit'))
  );
}
