// Turns a browser's content security policy violation report into one short, safe log record
// (doc 09, issue #122). Browsers send either the older `{ "csp-report": {...} }` body (report-uri) or the
// newer `[{ type: "csp-violation", body: {...} }]` list (Reporting API). Callers control every byte, so only a
// few known fields are kept, each cut short, and the document and blocked addresses are reduced to their
// origin so no query string, token or fragment is ever logged.

export const MAX_REPORT_BYTES = 8 * 1024;

export interface CspViolation {
  directive: string;
  blocked: string;
  document: string;
  disposition: 'report' | 'enforce' | 'unknown';
}

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** An address reduced to its origin; keywords such as "inline" or "eval" pass through; anything else becomes "unknown". */
export function originOnly(value: unknown): string {
  const s = text(value, 2048);
  if (!s) return '';
  if (/^[a-z-]{1,24}$/.test(s)) return s;
  try {
    const url = new URL(s);
    return url.origin === 'null' ? `${url.protocol}` : url.origin;
  } catch {
    return 'unknown';
  }
}

function fromBody(body: unknown): CspViolation | null {
  if (!isObject(body)) return null;
  const directive = text(
    body['effective-directive'] ?? body.effectiveDirective ?? body['violated-directive'] ?? body.violatedDirective,
    64,
  );
  if (!directive) return null;
  const disposition = text(body.disposition, 16);
  return {
    directive,
    blocked: originOnly(body['blocked-uri'] ?? body.blockedURL ?? body.blockedURI),
    document: originOnly(body['document-uri'] ?? body.documentURL ?? body.documentURI),
    disposition: disposition === 'report' || disposition === 'enforce' ? disposition : 'unknown',
  };
}

/** Parses a request body into at most 10 violations. Returns an empty list for anything that is not a report. */
export function parseCspReports(raw: string): CspViolation[] {
  if (raw.length > MAX_REPORT_BYTES) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = Array.isArray(data) ? data.slice(0, 10) : [data];
  const out: CspViolation[] = [];
  for (const item of items) {
    if (!isObject(item)) continue;
    const found = fromBody(item['csp-report'] ?? (item.type === 'csp-violation' ? item.body : undefined));
    if (found) out.push(found);
  }
  return out;
}
