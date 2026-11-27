# Security notes

How the running site and API protect themselves, for operators and reviewers. The plan is doc 09.

## Response headers (web app)

Set in `apps/web/next.config.ts` on every page:

- `Strict-Transport-Security: max-age=31536000`. No `includeSubDomains` or `preload` yet: they are hard to undo, so they are the owner's call.
- `Content-Security-Policy` (enforced): `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`.
- `Content-Security-Policy-Report-Only`: the full policy. Scripts and styles still allow `'unsafe-inline'`, because Next.js needs nonces for its inline scripts. Moving to nonces, then enforcing the full policy, is the follow-up on issue #122.
- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.

## API request log

Every API request writes one JSON line to standard output when it finishes:
`time`, `level`, `requestId`, `method`, `path` (no query string, link tokens replaced by `:token`), `status`, `durationMs`, `tenantId` and `membershipId` (null before sign-in).

- The ID is the caller's `x-request-id` when it is 8 to 64 letters, digits, `.`, `_` or `-`; otherwise a new UUID. It is returned in the `x-request-id` response header, so a support request can quote it.
- Bodies, query strings, cookies and headers are never logged.
- On by default; off under test. `LOG_REQUESTS=false` switches it off and `LOG_REQUESTS=true` forces it on.
