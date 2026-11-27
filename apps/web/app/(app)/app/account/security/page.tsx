import type { Metadata } from 'next';
import type { MfaStatus } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { MfaSetup } from './mfa-setup';
import { PasswordChange } from './password-change';

export const metadata: Metadata = { title: 'Account security' };

export default async function AccountSecurityPage() {
  const user = await currentUser();
  const status = await readAdmin<MfaStatus>('/auth/mfa');
  return (
    <div className="page stack g4">
      <div className="page-head">
        <div>
          <h1 className="page-title">Account security</h1>
          <div className="page-sub">Your password and two-step verification.</div>
        </div>
      </div>
      <div className="stack g4" style={{ maxWidth: 640 }}>
        <PasswordChange locked={user.preferencesLocked} />
        <MfaSetup status={status} locked={user.preferencesLocked} />
      </div>
    </div>
  );
}
