import 'server-only';
import { apiGet } from '@/lib/api';
import type { LocationPage, LocationRecord } from '@cafm/shared';

export const route = '/app/locations';
export const validLocationId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

export async function locationPage(params: Record<string, string> = {}): Promise<LocationPage> {
  const query = new URLSearchParams({ limit: '100', ...params });
  const response = await apiGet('/locations?' + query);
  if (!response.ok) throw new Error('Could not load locations.');
  return response.json() as Promise<LocationPage>;
}

export async function allLocations(params: Record<string, string> = {}): Promise<LocationPage['items']> {
  const items: LocationPage['items'] = [];
  let cursor: string | null = null;
  do {
    const page: LocationPage = await locationPage({ ...params, ...(cursor ? { after: cursor } : {}) });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export async function locationDetail(id: string): Promise<LocationRecord | null> {
  const response = await apiGet('/locations/' + encodeURIComponent(id));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not load this location.');
  return response.json() as Promise<LocationRecord>;
}
