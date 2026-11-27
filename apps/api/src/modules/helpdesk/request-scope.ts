import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { withTenant, type Prisma, type PrismaClient, type Tx } from '@cafm/db';
import type { Permission } from '@cafm/shared';
import { loadAccess } from '../../core/access';
import { assertAccess } from '../../core/auth.guards';
import type { AuthContext } from '../../core/session';
import { locationScope } from '../locations/location-tree';
import { dataScope, visibleMembers } from '../../core/data-scope';

export const reportLocationSelect = { id: true, name: true, code: true } as const;
export const reportAssetSelect = { id: true, name: true, number: true, locationId: true } as const;

export function reportLocations(auth: AuthContext): Prisma.LocationWhereInput {
  const { tenantId, locationScoped } = auth.membership!;
  const restricted = locationScoped || ['sites', 'team'].includes(auth.access?.scope ?? '');
  return {
    tenantId,
    AND: restricted ? [locationScope(auth)] : [],
    kind: { notIn: ['portfolio', 'region'] },
    status: 'open',
    ancestors: { some: { ancestor: { kind: 'site', status: 'open' } } },
  };
}

export function requestScope(auth: AuthContext, own: boolean): Prisma.ServiceRequestWhereInput {
  const member = auth.membership!;
  return {
    tenantId: member.tenantId,
    ...(own
      ? { requesterId: member.id }
      : {
          location: locationScope(auth),
          ...(dataScope(auth) === 'all'
            ? {}
            : { OR: [{ requester: visibleMembers(auth) }, { assignee: visibleMembers(auth) }] }),
        }),
  };
}

export function withRequestWrite<T>(
  db: PrismaClient,
  auth: AuthContext,
  permission: Permission,
  fn: (tx: Tx, auth: AuthContext) => Promise<T>,
): Promise<T> {
  const { tenantId, id } = auth.membership!;
  return withTenant(db, tenantId, async (tx) => {
    await lockRequests(tx, tenantId);
    const member = await tx.membership.findFirst({
      where: { id, status: 'active', tenant: { status: 'active' } },
      include: { tenant: true },
    });
    if (!member) throw new ForbiddenException({ code: 'organisation_required' });
    const access = await loadAccess(tx, tenantId, member.role, member.tenant.plan);
    assertAccess(access, 'helpdesk', permission);
    return fn(tx, { ...auth, membership: member, access });
  });
}

export async function lockRequests(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'helpdesk:' + tenantId}))`;
}

export const missingRequest = () => new NotFoundException({ code: 'request_not_found', message: 'Request not found.' });

export const staleRequest = () =>
  new ConflictException({ code: 'stale_request', message: 'This request has changed. Refresh it and try again.' });
