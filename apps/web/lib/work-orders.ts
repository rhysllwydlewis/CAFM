import 'server-only';
import type { FieldDefinition } from '@cafm/config-engine';
import type { WorkOrderPage, WorkOrderRecord, WorkOrderSummary } from '@cafm/shared';
import { apiGet } from './api';

export async function workOrderPage(params = ''): Promise<WorkOrderPage> {
  const response = await apiGet('/work-orders' + (params ? '?' + params : ''));
  if (!response.ok) throw new Error('Could not load work orders.');
  return response.json() as Promise<WorkOrderPage>;
}

export async function workOrderRecord(id: string): Promise<WorkOrderRecord<FieldDefinition> | null> {
  const response = await apiGet('/work-orders/' + encodeURIComponent(id));
  if ([400, 403, 404].includes(response.status)) return null;
  if (!response.ok) throw new Error('Could not load this work order.');
  return response.json() as Promise<WorkOrderRecord<FieldDefinition>>;
}

/** The jobs raised from a request, for the request's detail page. */
export async function jobsForRequest(requestId: string): Promise<WorkOrderSummary[]> {
  const page = await workOrderPage(new URLSearchParams({ view: 'all', requestId, limit: '50' }).toString());
  return page.items;
}
