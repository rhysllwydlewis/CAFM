import { z } from 'zod';

/**
 * Branding (doc 02, admin): an accent colour and a sign-in message. The accent is used for buttons and links,
 * which carry white text, so it must pass WCAG AA (4.5:1) against white before it can be saved.
 */

export interface BrandingView {
  accentColour: string | null;
  loginMessage: string | null;
  /** The display name emails are sent from, or null for the standard "FM Stead". */
  senderName: string | null;
  /** Whether a logo has been uploaded. It is served at /api/branding/logo. */
  hasLogo: boolean;
}

/** The largest logo, in bytes. Small enough to travel as JSON and to keep every page light. */
export const MAX_LOGO_BYTES = 64 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** True when the bytes really are the image type they claim (so a renamed file or an SVG is refused). */
export function logoMatchesType(bytes: Uint8Array, type: string): boolean {
  const at = (i: number, ...values: number[]) => values.every((v, k) => bytes[i + k] === v);
  if (type === 'image/png') return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (type === 'image/jpeg') return at(0, 0xff, 0xd8, 0xff);
  if (type === 'image/webp') return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
  return false;
}

export const logoUploadSchema = z.object({
  contentType: z.enum(LOGO_TYPES, { message: 'Use a PNG, JPEG or WebP image.' }),
  dataBase64: z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'The image could not be read.')
    .max(Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 4, 'The logo must be 64 KB or smaller.'),
});
export type LogoUploadInput = z.infer<typeof logoUploadSchema>;

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Contrast ratio of white text on the colour, or null if it isn't a six-digit hex colour. */
export function contrastWithWhite(hex: string): number | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return 1.05 / (luminance + 0.05);
}

export const updateBrandingSchema = z.object({
  accentColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit colour such as #136676.')
    .refine(
      (c) => (contrastWithWhite(c) ?? 0) >= 4.5,
      'That colour is too light: white text on it would be hard to read.',
    )
    .nullable(),
  loginMessage: z.string().trim().max(200, 'Keep the message to 200 characters or fewer.').nullable(),
  /** Left out, the saved sender name is kept. Null or empty clears it. */
  senderName: z
    .string()
    .trim()
    .max(60, 'Keep the sender name to 60 characters or fewer.')
    .regex(/^[\p{L}\p{N} .,&'()-]*$/u, "Use letters, numbers, spaces and . , & ' ( ) - only.")
    .nullable()
    .optional(),
});
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

/** What the public sign-in page may know about an organisation: its message, or nothing. */
export interface PublicSignInMessage {
  message: string | null;
}
