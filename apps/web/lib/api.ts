import 'server-only';
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Calls the API from a server component, forwarding the browser's session cookie. */
export async function apiGet(path: string): Promise<Response> {
  const cookie = (await cookies()).toString();
  return fetch(`${API_URL}/api${path}`, { headers: cookie ? { cookie } : {}, cache: 'no-store' });
}
