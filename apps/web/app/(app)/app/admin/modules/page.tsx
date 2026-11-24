import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, type ModuleSettingView } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { ModulesManager } from './modules-manager';

export const metadata: Metadata = { title: 'Modules and navigation' };

export default async function AdminModulesPage() {
  const user = await currentUser();
  if (!can(user, 'settings.manage')) redirect('/app');
  const modules = await readAdmin<ModuleSettingView[]>('/admin/modules');
  return <ModulesManager modules={modules} />;
}
