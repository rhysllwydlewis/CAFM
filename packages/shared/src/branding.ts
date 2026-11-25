import { z } from 'zod';

/**
 * Branding (doc 02, admin): an accent colour and a sign-in message. The accent is used for buttons and links,
 * which carry white text, so it must pass WCAG AA (4.5:1) against white before it can be saved.
 */

export interface BrandingView {
  accentColour: string | null;
  loginMessage: string | null;
}

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
});
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

/** What the public sign-in page may know about an organisation: its message, or nothing. */
export interface PublicSignInMessage {
  message: string | null;
}
