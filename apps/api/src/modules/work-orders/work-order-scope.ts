import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { withTenant, type Prisma, type PrismaClient, type Tx } from '@fmstead/db';
import type { Permission } from '@fmstead/shared';
import { loadAccess } from '../../core/access';
import { assertAccess } from '../../core/auth.guards';
import type { AuthContext } from '../../core/session';
import { locationScope } from '../locations/location-tree';

/**
 * A job is visible when its location is. Someone limited to their own work (a technician)
 * sees only the jobs assigned to them.
 */
export function workOrderScope(auth: AuthContext): Prisma.WorkOrderWhereInput {
  const member = auth.membership!;
  return {
    tenantId: member.tenantId,
    location: locationScope(auth),
    ...(auth.access?.scope === 'own' ? { assigneeId: member.id } : {}),
  };
}

export async function lockWorkOrders(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'work_orders:' + tenantId}))`;
}

/**
 * Serialises job writes per tenant and rechecks the member's access inside the transaction, so a
 * role or site change made just before cannot be outrun. `permission` may be a list: any one will do.
 */
export function withWorkOrderWrite<T>(
  db: PrismaClient,
  auth: AuthContext,
  permission: Permission | readonly Permission[],
  fn: (tx: Tx, auth: AuthContext) => Promise<T>,
): Promise<T> {
  const { tenantId, id } = auth.membership!;
  const accepted = Array.isArray(permission) ? permission : [permission as Permission];
  return withTenant(db, tenantId, async (tx) => {
    await lockWorkOrders(tx, tenantId);
    const member = await tx.membership.findFirst({
      where: { id, tenantId, status: 'active', tenant: { status: 'active' } },
      include: { tenant: true },
    });
    if (!member) throw new ForbiddenException({ code: 'organisation_required' });
    const access = await loadAccess(tx, tenantId, member.role, member.tenant.plan);
    assertAccess(access, 'work_orders');
    if (!accepted.some((key) => access.permissions.has(key))) throw new ForbiddenException();
    return fn(tx, { ...auth, membership: member, access });
  });
}

export const missingWorkOrder = () =>
  new NotFoundException({ code: 'work_order_not_found', message: 'Work order not found.' });

export const staleWorkOrder = () =>
  new ConflictException({
    code: 'stale_work_order',
    message: 'This work order has changed. Refresh it and try again.',
  });

/** Doing the job (answering, photographing, signing off) needs `work_orders.close` or `work_orders.edit`. */
export function assertCanWorkJob(auth: AuthContext): void {
  const permissions = auth.access?.permissions;
  if (!permissions?.has('work_orders.edit') && !permissions?.has('work_orders.close')) throw new ForbiddenException();
}
