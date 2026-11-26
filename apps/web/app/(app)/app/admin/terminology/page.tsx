import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, type TermView } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { TerminologyManager } from './terminology-manager';

export const metadata: Metadata = { title: 'Terminology' };

export default async function AdminTerminologyPage() {
  const user = await currentUser();
  if (!can(user, 'settings.manage')) redirect('/app');
  const terms = await readAdmin<TermView[]>('/admin/terminology');
  return <TerminologyManager terms={terms} />;
}
