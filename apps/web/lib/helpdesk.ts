import 'server-only';
import type { FieldDefinition } from '@cafm/config-engine';
import type { ReportAsset, ReportLocation, RequestCatalogue, RequestPage, RequestRecord } from '@cafm/shared';
import { apiGet } from './api';

export async function readHelpdesk<T>(path: string): Promise<T> {
  const response = await apiGet('/helpdesk' + path);
  if (!response.ok) throw new Error('Could not load Helpdesk data.');
  return response.json() as Promise<T>;
}

export const catalogue = () => readHelpdesk<RequestCatalogue<FieldDefinition>>('/catalogue');
export const requestPage = (path: 'mine' | 'requests', params = '') => readHelpdesk<RequestPage>('/' + path + params);

export async function requestRecord(id: string, own: boolean): Promise<RequestRecord | null> {
  const response = await apiGet('/helpdesk/' + (own ? 'mine' : 'requests') + '/' + encodeURIComponent(id));
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error('Could not load this request.');
  return response.json() as Promise<RequestRecord>;
}

export async function reportLocation(id: string): Promise<ReportLocation | null> {
  const response = await apiGet('/helpdesk/locations/' + encodeURIComponent(id));
  if ([400, 403, 404].includes(response.status)) return null;
  if (!response.ok) throw new Error('Could not check this location.');
  return response.json() as Promise<ReportLocation>;
}

export async function reportAsset(id: string): Promise<{ asset: ReportAsset; location: ReportLocation } | null> {
  const response = await apiGet('/helpdesk/assets/' + encodeURIComponent(id));
  if ([400, 403, 404].includes(response.status)) return null;
  if (!response.ok) throw new Error('Could not check this asset.');
  return response.json() as Promise<{ asset: ReportAsset; location: ReportLocation }>;
}
