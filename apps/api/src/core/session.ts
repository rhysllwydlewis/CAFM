import { createHash, randomBytes } from 'node:crypto';
import type { Account, Membership, Session, Tenant } from '@cafm/db';
import type { Entitlements } from '@cafm/shared';

export const SESSION_COOKIE = 'cafm_session';
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
export const LONG_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // "Keep me signed in": 30 days

export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The member's effective access inside the current tenant. */
export interface Access {
  roleName: string;
  permissions: ReadonlySet<string>;
  scope: string;
  entitlements: Entitlements;
}

/** What the session guard attaches to the request. */
export interface AuthContext {
  session: Session;
  account: Account;
  membership: (Membership & { tenant: Tenant }) | null;
  /** Present whenever membership is. */
  access: Access | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
