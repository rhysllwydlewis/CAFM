import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { PasswordPolicy } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { PasswordChange } from '../../(app)/app/account/security/password-change';

export const metadata: Metadata = { title: 'Choose your password' };

/** Where someone lands when an administrator set their password and they have not yet chosen their own (issue #120). */
export default async function RequiredPasswordChangePage() {
  const user = await currentUser();
  if (!user.passwordChangeRequired) redirect('/app');
  const policy = await readAdmin<PasswordPolicy>('/auth/password-policy');
  return (
    <div className="center-screen">
      <div style={{ width: 520, maxWidth: '100%' }}>
        <h1 className="page-title">Choose your own password</h1>
        <p className="muted">
          An administrator set your password for {user.tenant.name}. Choose one only you know to continue.
        </p>
        <PasswordChange
          locked={user.preferencesLocked}
          minLength={policy.minLength}
          doneHref="/app"
          intro="Type the password you were given as your current password. Other devices you are signed in on are signed out."
        />
      </div>
    </div>
  );
}
