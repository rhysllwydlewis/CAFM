import { z } from 'zod';

/**
 * Security settings (doc 02, admin): the shortest password, how long a sign-in lasts, and whether MFA is required.
 * The platform floor of 12 characters (NCSC guidance) can be raised, never lowered.
 */

export const PASSWORD_MIN_FLOOR = 12;
export const PASSWORD_MIN_CEILING = 64;
export const SESSION_HOURS_MIN = 1;
export const SESSION_HOURS_MAX = 720;

export interface SecuritySettingsView {
  passwordMinLength: number;
  /** Null keeps the standard sign-in length. */
  sessionTimeoutHours: number | null;
  mfaRequired: boolean;
}

export const DEFAULT_SECURITY_SETTINGS: SecuritySettingsView = {
  passwordMinLength: PASSWORD_MIN_FLOOR,
  sessionTimeoutHours: null,
  mfaRequired: false,
};

export const updateSecuritySchema = z.object({
  passwordMinLength: z
    .number()
    .int('Use a whole number.')
    .min(PASSWORD_MIN_FLOOR, `Passwords must be at least ${PASSWORD_MIN_FLOOR} characters.`)
    .max(PASSWORD_MIN_CEILING, `Use ${PASSWORD_MIN_CEILING} characters or fewer.`),
  sessionTimeoutHours: z
    .number()
    .int('Use a whole number of hours.')
    .min(SESSION_HOURS_MIN, 'Use at least 1 hour.')
    .max(SESSION_HOURS_MAX, 'Use 720 hours (30 days) or fewer.')
    .nullable(),
  mfaRequired: z.boolean(),
});
export type UpdateSecurityInput = z.infer<typeof updateSecuritySchema>;

/** One row of the audit log viewer. */
export interface AuditEventView {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string | null;
  ip: string | null;
  createdAt: string;
  changes: unknown;
}

export interface AuditPage {
  items: AuditEventView[];
  nextCursor: string | null;
}
