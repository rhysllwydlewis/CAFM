import 'server-only';
import { apiGet } from './api';

export async function readAdmin<T>(path: string): Promise<T> {
  const response = await apiGet(path);
  if (!response.ok) throw new Error('Could not load this page.');
  return response.json() as Promise<T>;
}
