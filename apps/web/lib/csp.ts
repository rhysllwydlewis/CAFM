// The full content security policy, sent report-only until a clean run of the browser tests and the live
// site shows nothing is blocked. Scripts use a per-request nonce; styles still allow 'unsafe-inline'
// because React sets style attributes.
export function buildReportOnlyCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // The homepage film plays its clips from blob: URLs, so a seek never waits on the network.
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // Violations are posted to /csp-report, which logs them, so the live site shows what enforcing would block.
    'report-uri /csp-report',
  ].join('; ');
}
