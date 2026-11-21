import { createHash, randomBytes } from 'node:crypto';

/** A random token for links and cookies. Store only hashToken(token). */
export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
