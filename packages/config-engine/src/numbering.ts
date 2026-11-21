/**
 * Numbering formats (doc 02 § 0), e.g. `WO-{YYYY}-{00000}` or `WO-{SITE}-{00000}`.
 * Tokens: {YYYY}, {YY}, {MM}, a run of zeros for the padded sequence, and
 * {SITE}, the site code passed in by the caller. Dates use the UK calendar.
 */

const TOKEN = /\{([A-Z]+|0+)\}/g;
/** Tokens a format may use besides the sequence. Each context token must be supplied by every caller. */
export const FORMAT_TOKENS = ['YYYY', 'YY', 'MM', 'SITE'] as const;

export function validateFormat(format: string): string | null {
  if (format.length < 3 || format.length > 60) return 'Use between 3 and 60 characters';
  if (/[{}]/.test(format.replace(TOKEN, ''))) return 'Check the braces: use tokens like {YYYY} or {00000}';
  const tokens = [...format.matchAll(TOKEN)].map((m) => m[1]!);
  const unknown = tokens.find((t) => !/^0+$/.test(t) && !(FORMAT_TOKENS as readonly string[]).includes(t));
  if (unknown)
    return `{${unknown}} isn’t a token you can use. Use {YYYY}, {YY}, {MM}, {SITE} or a sequence like {00000}`;
  const seq = tokens.filter((t) => /^0+$/.test(t));
  if (seq.length !== 1) return 'Include exactly one sequence, like {00000}';
  if (seq[0]!.length > 10) return 'The sequence can be at most 10 digits';
  return null;
}

export function formatNumber(
  format: string,
  sequence: number,
  at: Date = new Date(),
  context: Record<string, string> = {},
): string {
  const uk = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(at);
  const year = uk.find((p) => p.type === 'year')!.value;
  const month = uk.find((p) => p.type === 'month')!.value;
  return format.replace(TOKEN, (_, token: string) => {
    if (/^0+$/.test(token)) return String(sequence).padStart(token.length, '0');
    if (token === 'YYYY') return year;
    if (token === 'YY') return year.slice(2);
    if (token === 'MM') return month;
    const value = context[token];
    if (value === undefined) throw new Error(`No value for {${token}}`);
    return value;
  });
}

/** Default formats for built-in sequences, per the mockups (e.g. WO-04801). */
export const DEFAULT_SEQUENCES: Record<string, string> = {
  work_order: 'WO-{00000}',
  request: 'REQ-{00000}',
  asset: 'AST-{00000}',
  ppm_schedule: 'PPM-{0000}',
};
