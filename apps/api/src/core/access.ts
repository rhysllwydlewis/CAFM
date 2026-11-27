import type { Tx } from '@fmstead/db';
import { resolveEntitlements, roleLabel } from '@fmstead/shared';
import type { Access } from './session';

/**
 * Loads a member's effective access: their role's permissions and scope
 * (doc 03) and the tenant's entitlements (ADR 0006). Must run inside
 * withTenant for the member's tenant.
 */
export async function loadAccess(tx: Tx, tenantId: string, roleKey: string, plan: string): Promise<Access> {
  const [role, overrides] = await Promise.all([
    tx.role.findUnique({ where: { tenantId_key: { tenantId, key: roleKey } } }),
    tx.tenantEntitlement.findMany({ where: { tenantId } }),
  ]);
  return {
    roleName: role?.name ?? roleLabel(roleKey),
    // An unknown role grants nothing: fail closed.
    permissions: new Set(role?.permissions ?? []),
    scope: role?.scope ?? 'own',
    entitlements: resolveEntitlements(plan, overrides),
  };
}
