import { z } from 'zod';

export const loginRequestSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username').max(254),
  password: z.string().min(1, 'Enter your password').max(512),
  keepSignedIn: z.boolean().optional().default(false),
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

export interface CurrentUser {
  accountId: string;
  name: string;
  email: string | null;
  membershipId: string;
  tenant: { id: string; name: string; plan: string };
  role: string;
  roleLabel: string;
  licence: string;
  /** Effective permissions from the member's role (doc 03). Use can() in the UI. */
  permissions: string[];
  scope: string;
  /** Effective entitlements (ADR 0006). Use feature() in the UI. */
  entitlements: { plan: string; features: string[]; limits: Record<string, number | null> };
}

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
  scope: z.enum(['all', 'own']).default('all'),
});
export const updateRoleSchema = createRoleSchema.partial();
