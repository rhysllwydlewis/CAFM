import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, type AuditActor, type AuditPage } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { AuditViewer } from './audit-viewer';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AdminAuditPage() {
  const user = await currentUser();
  if (!can(user, 'audit.read')) redirect('/app');
  const [first, actors] = await Promise.all([
    readAdmin<AuditPage>('/admin/audit'),
    readAdmin<AuditActor[]>('/admin/audit/actors'),
  ]);
  return <AuditViewer first={first} actors={actors} />;
}
