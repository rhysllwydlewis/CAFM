/** A safe in-app path to go to after signing in: relative only, never another site. */
export function safeNext(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(value) ? value : null;
}
