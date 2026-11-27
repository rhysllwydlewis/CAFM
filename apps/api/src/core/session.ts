import type { Account, Membership, Session, Tenant } from '@fmstead/db';
import type { Entitlements } from '@fmstead/shared';

export const SESSION_COOKIE = 'fmstead_session';
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
export const LONG_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // "Keep me signed in": 30 days

export { hashToken, newToken as newSessionToken } from '@fmstead/db';

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
  /** Set while a Super User views the app as this member (P1-09c): who is really signed in. */
  impersonator: { accountId: string; membershipId: string; name: string } | null;
  /** The organisation requires MFA and this person has not set it up yet (P1-12). */
  mfaSetupRequired: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
