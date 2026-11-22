import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { can, feature } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { workOrderCosts, workOrderRecord } from '@/lib/work-orders';
import { WorkOrderDetail } from '../work-order-detail';

export const metadata: Metadata = { title: 'Work order' };

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!feature(user.entitlements, 'work_orders') || !can(user, 'work_orders.read')) redirect('/app/work-orders');
  const { id } = await params;
  const record = await workOrderRecord(id);
  if (!record) notFound();
  const canEdit = can(user, 'work_orders.edit');
  const seesCosts = can(user, 'costs.read');
  return (
    <WorkOrderDetail
      record={record}
      canEdit={canEdit}
      canAssign={can(user, 'work_orders.assign')}
      canNote={canEdit || can(user, 'work_orders.close')}
      showRequest={can(user, 'requests.read') && feature(user.entitlements, 'helpdesk')}
      now={Date.now()}
      costs={seesCosts ? await workOrderCosts(id) : undefined}
      canEditCosts={canEdit && seesCosts}
    />
  );
}
