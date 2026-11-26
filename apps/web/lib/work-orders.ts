import 'server-only';
import type { FieldDefinition } from '@fmstead/config-engine';
import type {
  Checklist,
  ChecklistTemplateItem,
  WorkOrderCosts,
  WorkOrderPage,
  WorkOrderPhoto,
  WorkOrderRecord,
  WorkOrderSignature,
  WorkOrderSummary,
} from '@fmstead/shared';
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

/** What a job has cost. Only for people who may see costs. */
export async function workOrderCosts(id: string): Promise<WorkOrderCosts | undefined> {
  const response = await apiGet('/work-orders/' + encodeURIComponent(id) + '/costs');
  if (!response.ok) return undefined;
  return response.json() as Promise<WorkOrderCosts>;
}

async function list<T>(path: string): Promise<T[]> {
  const response = await apiGet(path);
  return response.ok ? ((await response.json()) as T[]) : [];
}

/** Checklists, photos and sign-offs on a job, and the templates a checklist can be added from. */
export async function workOrderForms(id: string, withTemplates: boolean) {
  const base = '/work-orders/' + encodeURIComponent(id);
  const [checklists, photos, signatures, templates] = await Promise.all([
    list<Checklist>(base + '/checklists'),
    list<WorkOrderPhoto>(base + '/photos'),
    list<WorkOrderSignature>(base + '/signatures'),
    withTemplates ? list<ChecklistTemplateItem>('/checklist-templates') : Promise.resolve([]),
  ]);
  return { checklists, photos, signatures, templates };
}
