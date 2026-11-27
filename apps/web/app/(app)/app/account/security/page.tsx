import type { Metadata } from 'next';
import type { MfaStatus } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { MfaSetup } from './mfa-setup';

export const metadata: Metadata = { title: 'Two-step verification' };

export default async function AccountSecurityPage() {
  const user = await currentUser();
  const status = await readAdmin<MfaStatus>('/auth/mfa');
  return <MfaSetup status={status} locked={user.preferencesLocked} />;
}
