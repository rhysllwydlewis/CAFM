import { notFound, redirect } from 'next/navigation';
import { can, feature, type RequestTypeChoice } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { readHelpdesk, requestRecord } from '@/lib/helpdesk';
import { jobsForRequest } from '@/lib/work-orders';
import { RequestDetail } from '../request-detail';

export default async function HelpdeskRequest({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!can(user, 'requests.read') || !feature(user.entitlements, 'helpdesk')) redirect('/app/helpdesk');
  const { id } = await params;
  const record = await requestRecord(id, false);
  if (!record) notFound();
  const operator = can(user, 'requests.manage');
  const open = operator && ['new', 'assigned', 'in_progress'].includes(record.status);
  const [duplicates, triageTypes] = open
    ? await Promise.all([
        readHelpdesk<{ id: string; number: string; title: string; version: number }[]>(
          '/requests/' + id + '/duplicates',
        ),
        readHelpdesk<RequestTypeChoice[]>('/requests/' + id + '/triage-types'),
      ])
    : [];
  const jobsVisible = feature(user.entitlements, 'work_orders') && can(user, 'work_orders.read');
  const workOrders = jobsVisible
    ? {
        jobs: await jobsForRequest(id),
        canConvert: operator && can(user, 'work_orders.edit'),
        canAssign: can(user, 'work_orders.assign'),
      }
    : undefined;
  return (
    <RequestDetail
      record={record}
      own={false}
      canManage={operator}
      duplicates={duplicates}
      triageTypes={triageTypes}
      workOrders={workOrders}
    />
  );
}
