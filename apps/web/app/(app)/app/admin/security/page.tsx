import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, type SecuritySettingsView } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { SecurityManager } from './security-manager';

export const metadata: Metadata = { title: 'Security and sign-in' };

export default async function AdminSecurityPage() {
  const user = await currentUser();
  if (!can(user, 'settings.manage')) redirect('/app');
  const settings = await readAdmin<SecuritySettingsView>('/admin/security');
  return <SecurityManager settings={settings} />;
}
