export async function helpdeskWrite<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message.join(' ') : data.message;
    const errors = data.errors && typeof data.errors === 'object' ? Object.values(data.errors).join(' ') : '';
    throw new Error(message || errors || 'Could not save your changes. Try again.');
  }
  return data as T;
}
