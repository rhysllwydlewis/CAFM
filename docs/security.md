# Security notes

How the running site and API protect themselves, for operators and reviewers. The plan is doc 09.

## Response headers (web app)

Set in `apps/web/next.config.ts` on every page:

- `Strict-Transport-Security: max-age=31536000`. No `includeSubDomains` or `preload` yet: they are hard to undo, so they are the owner's call.
- `Content-Security-Policy` (enforced): `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`.
- `Content-Security-Policy-Report-Only`: the full policy, set per request in `apps/web/middleware.ts`. Scripts need a fresh nonce (`'nonce-…'` with `'strict-dynamic'`), with no `'unsafe-inline'`; styles still allow `'unsafe-inline'` because React sets style attributes. Enforcing it is the last step of issue #122, once the live site's reports show nothing is blocked. Every page renders on demand, because a nonce changes with each request.
- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.

## API request log

Every API request writes one JSON line to standard output when it finishes:
`time`, `level`, `requestId`, `method`, `path` (the matched route, such as `/api/auth/invites/:token`, never the real path, because tokens travel in path segments; unmatched requests show `(unmatched)`), `status`, `durationMs`, `tenantId` and `membershipId` (null before sign-in).

- The ID is the caller's `x-request-id` when it is 8 to 64 letters, digits, `.`, `_` or `-`; otherwise a new UUID. It is returned in the `x-request-id` response header, so a support request can quote it.
- Bodies, query strings, cookies and headers are never logged.
- On by default; off under test. `LOG_REQUESTS=false` switches it off and `LOG_REQUESTS=true` forces it on.

## Automated scanning

- **Dependabot** (`.github/dependabot.yml`) opens weekly pull requests for npm dependencies, and monthly ones for GitHub Actions, Docker and the design tooling.
- **CodeQL** (`.github/workflows/codeql.yml`) scans the TypeScript and JavaScript on every pull request, on `main` and weekly. Results are under the repository's Security tab.
- **OWASP ZAP baseline** (`.github/workflows/zap.yml`) runs weekly, and on request, against the demo build. It is passive and reports only; read the report in the run's artifacts.
