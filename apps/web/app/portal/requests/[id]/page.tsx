import { notFound } from 'next/navigation';
import { can, feature } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { requestRecord } from '@/lib/helpdesk';
import { RequestDetail } from '../../../(app)/app/helpdesk/request-detail';

export default async function YourRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser('/portal/requests/' + encodeURIComponent(id));
  if (!can(user, 'requests.create') || !feature(user.entitlements, 'helpdesk')) return null;
  const record = await requestRecord(id, true);
  if (!record) notFound();
  return <RequestDetail record={record} own canManage={false} />;
}
