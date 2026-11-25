import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, type AuditFilterOptions, type AuditPage } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { AuditViewer } from './audit-viewer';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AdminAuditPage() {
  const user = await currentUser();
  if (!can(user, 'audit.read')) redirect('/app');
  const [first, options] = await Promise.all([
    readAdmin<AuditPage>('/admin/audit'),
    readAdmin<AuditFilterOptions>('/admin/audit/filters'),
  ]);
  return <AuditViewer first={first} options={options} />;
}
