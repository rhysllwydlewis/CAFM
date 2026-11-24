import 'server-only';
import type { SavedView, ViewEntity } from '@cafm/shared';
import { apiGet } from './api';

/** Params that describe where you are in a list, not what it is filtered by. They are never saved in a view. */
const POSITION_KEYS = new Set(['cursor', 'after', 'offset', 'new', 'log', 'page', 'limit', 'month']);

/** The filters in an address: every short text param except paging and form-open flags. */
export function filtersFromQuery(query: Record<string, string | string[] | undefined>): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (POSITION_KEYS.has(key) || key === 'layout' || key === 'view_id') continue;
    if (!/^[a-z][a-zA-Z0-9_.]*$/.test(key)) continue;
    const text = (Array.isArray(value) ? value.join(',') : (value ?? '')).trim();
    if (text && text.length <= 200) filters[key] = text;
  }
  return filters;
}

/** Saved views for a list. A failure means no saved views are offered, never a broken list. */
export async function savedViews(entity: ViewEntity): Promise<SavedView[]> {
  try {
    const response = await apiGet('/views?entity=' + entity);
    return response.ok ? ((await response.json()) as SavedView[]) : [];
  } catch {
    return [];
  }
}
