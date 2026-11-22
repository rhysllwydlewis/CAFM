import { notFound, redirect } from 'next/navigation';
import { can, feature } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { readHelpdesk, requestRecord } from '@/lib/helpdesk';
import { RequestDetail } from '../request-detail';

export default async function HelpdeskRequest({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!can(user, 'requests.read') || !feature(user.entitlements, 'helpdesk')) redirect('/app/helpdesk');
  const { id } = await params;
  const record = await requestRecord(id, false);
  if (!record) notFound();
  const operator = can(user, 'requests.manage');
  const duplicates =
    operator && ['new', 'assigned', 'in_progress'].includes(record.status)
      ? await readHelpdesk<{ id: string; number: string; title: string; version: number }[]>(
          '/requests/' + id + '/duplicates',
        )
      : undefined;
  return <RequestDetail record={record} own={false} canManage={operator} duplicates={duplicates} />;
}
