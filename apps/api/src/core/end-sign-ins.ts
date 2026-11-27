import type { Tx } from '@fmstead/db';

/**
 * Ends the account's sign-ins, for a new password: browser sessions, phone and tablet devices (their refresh tokens
 * last 30 days and would otherwise keep working), and phone approvals still waiting for their code. `keep` names the
 * one sign-in that stays, the one the person is using to change the password.
 */
export async function endSignIns(
  tx: Tx,
  accountId: string,
  keep?: { sessionId: string; deviceId: string | null },
): Promise<void> {
  await tx.session.deleteMany({
    where: {
      ...(keep ? { id: { not: keep.sessionId } } : {}),
      OR: [{ accountId }, { impersonatorAccountId: accountId }],
    },
  });
  await tx.mobileDevice.updateMany({
    where: { accountId, revokedAt: null, ...(keep?.deviceId ? { id: { not: keep.deviceId } } : {}) },
    data: { revokedAt: new Date() },
  });
  await tx.oauthCode.deleteMany({ where: { accountId } });
}
