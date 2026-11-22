import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can, feature } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { readHelpdesk } from '@/lib/helpdesk';
import { SettingsForms, type HelpdeskSettings } from './settings-forms';

export const metadata: Metadata = { title: 'Request catalogue' };

export default async function HelpdeskSettingsPage() {
  const user = await currentUser();
  if (!can(user, 'settings.manage') || !feature(user.entitlements, 'helpdesk')) redirect('/app/helpdesk');
  const data = await readHelpdesk<HelpdeskSettings>('/settings');
  return (
    <div className="page stack g4">
      <Link href="/app/helpdesk">Helpdesk queue</Link>
      <h1 className="page-title">Request catalogue</h1>
      <SettingsForms data={data} routeRequests={user.scope === 'all'} />
    </div>
  );
}
