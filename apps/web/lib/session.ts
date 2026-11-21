import 'server-only';
import { redirect } from 'next/navigation';
import type { CurrentUser } from '@cafm/shared';
import { apiGet } from './api';

/** The signed-in user, or a redirect to sign-in / choose organisation. */
export async function currentUser(): Promise<CurrentUser> {
  const res = await apiGet('/auth/me');
  if (res.status === 401) redirect('/login');
  if (res.status === 403) redirect('/select-organisation');
  if (!res.ok) throw new Error(`Could not load the signed-in user (${res.status})`);
  return (await res.json()) as CurrentUser;
}
