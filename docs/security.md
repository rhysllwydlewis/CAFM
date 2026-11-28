# Security notes

How the running site and API protect themselves, for operators and reviewers. The plan is doc 09.

## Response headers (web app)

Set in `apps/web/next.config.ts` on every page:

- `Strict-Transport-Security: max-age=31536000`. No `includeSubDomains` or `preload` yet: they are hard to undo, so they are the owner's call.
- `Content-Security-Policy` (enforced): `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`.
- `Content-Security-Policy-Report-Only`: the full policy, set per request in `apps/web/middleware.ts`. Scripts need a fresh nonce (`'nonce-…'` with `'strict-dynamic'`), with no `'unsafe-inline'`; styles still allow `'unsafe-inline'` because React sets style attributes. It names `report-uri /csp-report`: browsers post each violation there (`apps/web/app/csp-report/route.ts`), and the route writes one `csp-violation` log line (directive, blocked origin, page origin, never a path or query string; bodies over 8 KB are refused and reports are capped at 120 a minute per instance, or `CSP_REPORT_MAX_PER_MINUTE`). Enforcing it is the last step of issue #122, once those log lines on the live site show nothing is blocked. Every page renders on demand, because a nonce changes with each request.
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

## Dependency advisories

`pnpm audit --prod` is the check. Three advisories are cleared with overrides in `pnpm-workspace.yaml`, where another package pins a version that has one (issue #128):

| Override | Why | Remove when |
| --- | --- | --- |
| `next>postcss` | file read through source map comments; Next pins an old `postcss` | Next ships `postcss` 8.5.18 or later |
| `@prisma/config>effect`, `@prisma/config>deepmerge-ts` | regular expression and stack exhaustion issues in two build-time helpers of the Prisma CLI | Prisma ships with fixed versions (they are build and command-line only, never in the running API) |

One advisory is left, because it needs a major upgrade with code changes and its own pull request: `zod` 3 to 4 (memory use on very large arrays; request bodies are already capped at 100 kB). It is tracked on issue #128. `maplibre-gl` was moved to 6, which clears the other one; version 6 keeps its worker in a separate file, so the portfolio map points it there with `setWorkerUrl`.

## Null characters

Postgres cannot store a NUL character (U+0000), so one in a search term or a saved name used to reach the database and come back as a `500`. A global guard (`apps/api/src/core/nul.guard.ts`) now refuses a request with one in its address, query string, route parameters or JSON body (keys included) with `400` and the code `invalid_character`. It covers every route at once, including ones that read the query themselves. It runs before the session check, so an unauthenticated request with one gets the `400` too. Uploaded files are not searched.
