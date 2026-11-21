import { ConflictException, ForbiddenException } from '@nestjs/common';
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

export function assertNotLastSuperUser(activeSuperUsers: number): void {
  if (activeSuperUsers <= 1) throw new ConflictException({ code: 'last_super_user', message: LAST_SUPER_USER });
}
