import { z } from 'zod';

/**
 * Username-only accounts (doc 03 § People & access, doc 06 § Username-only accounts).
 * The person types a short name such as `rdavies`. It is stored with the
 * organisation's address after an `@` (`rdavies@demo-estates`), so the same
 * short name can exist in two organisations and is only ever looked up inside one.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export const usernameAccountCreateSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      USERNAME_PATTERN,
      'Use 3 to 32 letters, numbers, dots, dashes or underscores, starting with a letter or number',
    ),
  role: z.string().min(1).max(64),
});
export type UsernameAccountCreate = z.infer<typeof usernameAccountCreateSchema>;

/** What the administrator is shown once, after creating an account or resetting its password. */
export interface UsernameAccountCredentials {
  membershipId: string;
  name: string;
  username: string;
  signInPath: string;
  temporaryPassword: string;
}

/** The stored form of a short username inside one organisation. */
export function scopedUsername(username: string, tenantSlug: string): string {
  return `${username.toLowerCase()}@${tenantSlug.toLowerCase()}`;
}

/** The short name to show people: drops the `@organisation` part of a stored username. */
export function shortUsername(stored: string | null): string | null {
  if (!stored) return null;
  const at = stored.lastIndexOf('@');
  return at > 0 ? stored.slice(0, at) : stored;
}
