import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { MfaStatus } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { MfaSetup } from '../../(app)/app/account/security/mfa-setup';

export const metadata: Metadata = { title: 'Set up two-step verification' };

/** Where someone lands when their organisation requires two-step verification and they haven't set it up. */
export default async function RequiredMfaSetupPage() {
  const user = await currentUser();
  if (!user.mfaSetupRequired) redirect('/app');
  const status = await readAdmin<MfaStatus>('/auth/mfa');
  return (
    <div className="center-screen">
      <div style={{ width: 520, maxWidth: '100%' }}>
        <p className="muted">{user.tenant.name} requires two-step verification. Set it up to continue to the app.</p>
        <MfaSetup status={status} locked={user.preferencesLocked} doneHref="/app" />
      </div>
    </div>
  );
}
