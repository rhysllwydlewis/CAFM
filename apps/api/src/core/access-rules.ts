import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { Tx } from '@cafm/db';
import { escalations, isAdminPermission, isPermission } from '@cafm/shared';
import type { Access } from './session';

/**
 * Doc 03 § Security guardrails: nobody can grant a permission they don't
 * hold, and only Super Users can create or edit roles with admin permissions.
 */
export function assertCanGrant(actor: Access, actorRole: string, permissions: readonly string[]): void {
  const unknown = permissions.filter((p) => !isPermission(p));
  if (unknown.length) throw new ForbiddenException({ code: 'unknown_permission', permissions: unknown });
  const beyond = escalations(actor.permissions, permissions);
  if (beyond.length) throw new ForbiddenException({ code: 'privilege_escalation', permissions: beyond });
  const admin = permissions.filter((p) => isPermission(p) && isAdminPermission(p));
  if (admin.length && actorRole !== 'super_user') {
    throw new ForbiddenException({ code: 'admin_permissions_need_super_user', permissions: admin });
  }
}

export const LAST_SUPER_USER = 'Every organisation needs at least one active Super User.';

/**
 * Throws if removing one active Super User would leave none. Takes a per-tenant
 * lock first, so two Super Users demoting each other at once can't both pass.
 */
export async function assertNotLastSuperUser(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`super_user:${tenantId}`}))`;
  const active = await tx.membership.count({ where: { tenantId, role: 'super_user', status: 'active' } });
  if (active <= 1) throw new ConflictException({ code: 'last_super_user', message: LAST_SUPER_USER });
}

/**
 * Plan limit on full-licence users (doc 07: Free includes 3). Active full
 * members and pending full invites both take a seat. Takes a per-tenant lock
 * so parallel invites can't overshoot. `exceptInviteEmail` leaves out a
 * pending invite that the caller is about to replace.
 */
export async function assertFullUserSeat(
  tx: Tx,
  access: Access,
  tenantId: string,
  exceptInviteEmail?: string,
): Promise<void> {
  const limit = access.entitlements.limits.full_users;
  if (limit === null) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`full_users:${tenantId}`}))`;
  const [members, invites] = await Promise.all([
    tx.membership.count({ where: { tenantId, status: 'active', licence: 'full' } }),
    tx.invite.count({
      where: {
        tenantId,
        licence: 'full',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(exceptInviteEmail ? { NOT: { email: exceptInviteEmail } } : {}),
      },
    }),
  ]);
  if (members + invites >= limit) {
    throw new ForbiddenException({
      code: 'limit_reached',
      limit,
      message: `Your plan includes ${limit} full users. Choose a role with a lighter licence, or ask your Super User about upgrading.`,
    });
  }
}

/** Whether this is something shared in the demo that must stay as seeded: a demo persona, or a built-in role. */
export function demoLocked(locked: boolean): boolean {
  return locked && process.env.DEMO_MODE === 'true';
}

/** In the demo, the shared demo personas and built-in roles stay as seeded (doc 06 § guard rails). */
export function assertNotDemoLocked(locked: boolean): void {
  if (demoLocked(locked)) {
    throw new ForbiddenException({
      code: 'demo_locked',
      message: 'This is part of the demo and can’t be changed. The demo resets every night.',
    });
  }
}
