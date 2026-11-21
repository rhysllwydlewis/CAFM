/** JSON POST from the browser. Same-origin, so the session cookie goes with it. */
export async function postJson(path: string, body: unknown = {}): Promise<Response> {
  return fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
