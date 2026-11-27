import { z } from 'zod';

export const loginRequestSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username').max(254),
  password: z.string().min(1, 'Enter your password').max(512),
  keepSignedIn: z.boolean().optional().default(false),
  /** Set on an organisation's own sign-in page: a short username is looked up inside this organisation only. */
  organisation: z.string().trim().toLowerCase().max(64).optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const selectOrganisationSchema = z.object({ membershipId: z.string().uuid() });

export interface OrganisationOption {
  membershipId: string;
  tenantName: string;
  plan: string;
  roleLabel: string;
}

export type LoginResponse =
  { status: 'signed_in'; landingPage: string } | { status: 'choose_organisation'; organisations: OrganisationOption[] };

/** A person's own display choices. Every key is optional: an unset one means "use the default". */
export const accountPreferencesSchema = z
  .object({
    /** The desktop side menu is collapsed to an icon rail. */
    navCollapsed: z.boolean(),
  })
  .partial()
  .strict();
export type AccountPreferences = z.infer<typeof accountPreferencesSchema>;

export const updatePreferencesSchema = accountPreferencesSchema.refine((v) => Object.keys(v).length > 0, {
  message: 'Nothing to change',
});

/** Stored preferences made safe to use: unknown or malformed values are dropped, never trusted. */
export function readPreferences(stored: unknown): AccountPreferences {
  const parsed = accountPreferencesSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  const known = accountPreferencesSchema.shape.navCollapsed.safeParse(
    (stored as { navCollapsed?: unknown } | null)?.navCollapsed,
  );
  return known.success && known.data !== undefined ? { navCollapsed: known.data } : {};
}

export interface CurrentUser {
  accountId: string;
  name: string;
  email: string | null;
  membershipId: string;
  tenant: { id: string; name: string; plan: string; demo: boolean };
  role: string;
  roleLabel: string;
  licence: string;
  /** Effective permissions from the member's role (doc 03). Use can() in the UI. */
  permissions: string[];
  scope: string;
  /** Effective entitlements (ADR 0006). Use feature() in the UI. */
  entitlements: { plan: string; features: string[]; limits: Record<string, number | null> };
  /** Set while a Super User is viewing the app as this person (P1-09c). */
  impersonation: { by: string; expiresAt: string } | null;
  /** The person's own display choices, saved on their account. */
  preferences: AccountPreferences;
  /** True for a shared demo persona: no choices are kept for them, so they last only until the page is reloaded. */
  preferencesLocked: boolean;
}

export const startImpersonationSchema = z.object({
  membershipId: z.string().uuid(),
  reason: z.string().trim().min(3, 'Give a reason, at least 3 characters').max(200),
});
export type StartImpersonation = z.infer<typeof startImpersonationSchema>;

/** Generic message for any failed sign-in, so accounts can't be enumerated. */
export const SIGN_IN_FAILED = 'Email/username or password is incorrect';

export const TOO_MANY_ATTEMPTS = 'Too many sign-in attempts. Wait a few minutes and try again.';

export const updateMemberSchema = z
  .object({
    role: z.string().min(1).max(64).optional(),
    status: z.enum(['active', 'deactivated']).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, { message: 'Nothing to change' });

const permissionList = z.array(z.string()).max(200);
export const createRoleSchema = z.object({
  name: z.string().trim().min(1, 'Enter a role name').max(80),
  description: z.string().trim().max(300).optional(),
  permissions: permissionList,
  scope: z.enum(['all', 'team', 'own']).default('all'),
});
export const updateRoleSchema = createRoleSchema.partial();

/** Version of the terms of service people accept when they join (doc 06). */
export const TERMS_VERSION = '2026-11';

const COMMON_PASSWORDS = new Set([
  'password1234',
  'password12345',
  'qwertyuiop12',
  '123456789012',
  'letmein12345',
  'welcome12345',
  'iloveyou1234',
  'administrator',
  'passw0rd1234',
  'changeme1234',
  'cafmdemo2026',
]);

/**
 * Password rules (NCSC guidance): at least 12 characters, no arbitrary
 * complexity rules, not a common password, not built from the email name.
 */
export function passwordProblem(password: string, email?: string | null, minLength = 12): string | null {
  const shortest = Math.max(12, minLength);
  if (password.length < shortest) return `Use at least ${shortest} characters`;
  if (password.length > 256) return 'Use 256 characters or fewer';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower.replace(/[^a-z0-9]/g, ''))) return 'Choose a less common password';
  const name = email?.split('@')[0]?.toLowerCase();
  if (name && name.length >= 4 && lower.includes(name)) return 'Don’t include your email name in your password';
  return null;
}

export const resetRequestSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username').max(254),
});
export const resetConfirmSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(1, 'Enter a new password').max(512),
});
export const inviteCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  role: z.string().min(1).max(64),
});
export const acceptInviteSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(120).optional(),
  password: z.string().max(512).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Accept the terms to continue' }) }),
});

export interface InviteDetails {
  tenantName: string;
  email: string;
  roleLabel: string;
  accountExists: boolean;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

/** The mobile PWA's OAuth 2.0 client (P1-06a). There is one first-party public client; PKCE protects it. */
export const MOBILE_CLIENT_ID = 'cafm-pwa';
/** Access tokens are short; the refresh token rotates on every use. */
export const MOBILE_ACCESS_TOKEN_SECONDS = 15 * 60;
export const MOBILE_AUTH_CODE_SECONDS = 60;

const pkceChallenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'The code challenge must be a base64url SHA-256 hash');
const pkceVerifier = z
  .string()
  .regex(/^[A-Za-z0-9._~-]{43,128}$/, 'The code verifier must be 43 to 128 URL-safe characters');

export const oauthAuthorizeSchema = z.object({
  client_id: z.literal(MOBILE_CLIENT_ID),
  code_challenge: pkceChallenge,
  code_challenge_method: z.literal('S256'),
  device_name: z.string().trim().min(1, 'Name this device').max(80),
});
export type OauthAuthorizeRequest = z.infer<typeof oauthAuthorizeSchema>;

export const oauthTokenSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    client_id: z.literal(MOBILE_CLIENT_ID),
    code: z.string().min(1).max(200),
    code_verifier: pkceVerifier,
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    client_id: z.literal(MOBILE_CLIENT_ID),
    refresh_token: z.string().min(1).max(200),
  }),
]);
export type OauthTokenRequest = z.infer<typeof oauthTokenSchema>;

export const oauthRevokeSchema = z.object({ token: z.string().min(1).max(200) });

export interface OauthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}

export interface MobileDeviceSummary {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Enter a team name').max(80),
  description: z.string().trim().max(300).optional(),
  memberIds: z.array(z.string().uuid()).max(500).default([]),
});
export const updateTeamSchema = createTeamSchema.partial();
