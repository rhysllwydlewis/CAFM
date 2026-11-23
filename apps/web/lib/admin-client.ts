/** JSON write from the browser for the admin console. Handles empty (204) answers and API error messages. */
export async function adminWrite<T = unknown>(path: string, body?: unknown, method = 'POST'): Promise<T | null> {
  const res = await fetch('/api' + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(' ') : data?.message;
    throw new Error(message || 'Could not save your changes. Try again.');
  }
  return data as T | null;
}
