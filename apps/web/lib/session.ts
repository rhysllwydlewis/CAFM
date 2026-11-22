import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { CurrentUser } from '@cafm/shared';
import { apiGet } from './api';
import { safeNext } from './next-path';

/**
 * The signed-in user, or a redirect to sign-in / choose organisation.
 * Cached per request, so the layout and page share one API call.
 */
export const currentUser = cache(async (returnPath?: string): Promise<CurrentUser> => {
  const res = await apiGet('/auth/me');
  const next = safeNext(returnPath);
  const suffix = next ? '?next=' + encodeURIComponent(next) : '';
  if (res.status === 401) redirect('/login' + suffix);
  if (res.status === 403) redirect('/select-organisation' + suffix);
  if (!res.ok) throw new Error(`Could not load the signed-in user (${res.status})`);
  return (await res.json()) as CurrentUser;
});
