import { createHash } from 'node:crypto';

/** Deterministic UUID-shaped id from a name, so demo links stay stable across resets. */
export function seedId(name: string): string {
  const h = createHash('sha256').update(`cafm-demo:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
