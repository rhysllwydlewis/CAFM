import { withAccount, withTenant } from '@cafm/db';
import { DEFAULT_SECURITY_SETTINGS, type SecuritySettingsView } from '@cafm/shared';
import type { PrismaService } from './prisma.service';

/** An organisation's sign-in rules, or the standard rules when it has not set any. */
export function readSecurity(db: PrismaService, tenantId: string): Promise<SecuritySettingsView> {
  return withTenant(db, tenantId, async (tx) => {
    const row = await tx.tenantSecurity.findUnique({ where: { tenantId } });
    return row
      ? {
          passwordMinLength: row.passwordMinLength,
          sessionTimeoutHours: row.sessionTimeoutHours,
          mfaRequired: row.mfaRequired,
        }
      : { ...DEFAULT_SECURITY_SETTINGS };
  });
}

/**
 * A password belongs to a person, who can be a member of several organisations. When no single organisation
 * is in play (a password reset), the strictest minimum length among them applies.
 */
export async function strictestMinLength(db: PrismaService, accountId: string): Promise<number> {
  const memberships = await withAccount(db, accountId, (tx) =>
    tx.membership.findMany({ where: { accountId, status: 'active' }, select: { tenantId: true } }),
  );
  let longest = DEFAULT_SECURITY_SETTINGS.passwordMinLength;
  for (const { tenantId } of memberships) {
    longest = Math.max(longest, (await readSecurity(db, tenantId)).passwordMinLength);
  }
  return longest;
}
