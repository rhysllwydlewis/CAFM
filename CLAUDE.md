# CLAUDE.md

Guidance for anyone (human or AI agent) working in this repository. Read this first, every session.

## What this is

A cloud, multi-tenant CAFM (Computer-Aided Facilities Management) platform for UK estates teams and FM service providers. The product is defined in `docs/plan/` and drawn in `design/`. Phase 0 is under way: the monorepo, database with row-level security, sign-in and the login page exist; everything else is still to build.

## Sources of truth (in this order)

1. `docs/plan/02-feature-catalogue.md`: what each module must do, with phase and pricing tier.
2. `docs/plan/12-screen-catalogue.md` and `design/mockups/`: what each screen must look like.
3. `docs/plan/03` roles and permissions, `04` architecture, `05` data model, `06` login and demo, `09` quality and security.
4. `docs/adr/`: architecture decisions. Do not contradict an accepted ADR. Propose a new one instead.
5. `docs/plan/13-agent-schedules.md`: if you are a scheduled agent, your section defines your scope.

If two sources disagree, flag it in your PR and on an issue labelled `docs`. Do not guess.

## Non-negotiable rules

- **Tenant isolation:** every tenant-owned table has `tenant_id` and an RLS policy. The tenant context is set with `set_config('app.tenant_id', $1, true)` inside the request's transaction. Every endpoint gets a cross-tenant denial test.
- **Permissions:** checked in the API (never only in the UI) using the permission registry. The data scope and field security from doc 03 apply.
- **Entitlements:** plan-gated features are checked with `feature()` in the API, the UI and workers.
- **Money:** integer minor units plus a currency code. Never floats.
- **Time:** stored in UTC. SLA maths uses the site's business calendar.
- **Design:** use tokens and `packages/ui` components only. No new colours or one-off styles. A new UI pattern needs a mockup in `design/mockups/screens/` first.
- **Tests:** never skip, disable or weaken a test to get a green build. Fix the cause.
- **Secrets and data:** no secrets in code, logs or fixtures. No real personal data in seed or tests. Demo personas only (doc 06).
- **Git:** never push to the default branch, never force-push shared branches, never merge your own PR. Keep PRs small: about 400 hand-written lines.
- **Writing style:** UK English, sentence case, plain and specific wording (see doc 11 "Voice").

## Repository layout

```
apps/api        NestJS API (modules in src/modules/<module>, core in src/core)
apps/web        Next.js web app: (auth), (app)/<module>, (mobile), (marketing), (platform)
apps/worker     BullMQ jobs (src/jobs/<module>)
packages/db     Prisma schema (prisma/schema/<module>.prisma), migrations, RLS, seed
packages/shared Zod schemas and types
packages/ui     Shared components (from design/)
packages/config-engine  Custom fields, forms, workflows, automation, SLA engine
design/         Tokens, icons, mockups, render tools
docs/           Plan, ADRs, agent notes and status
```

## Commands

Node 22 and pnpm 10 (`corepack enable`). From the repository root:

```bash
pnpm install
pnpm db:migrate        # apply migrations (owner role, DATABASE_URL)
pnpm db:seed           # demo tenants and the 16 demo personas
pnpm lint && pnpm typecheck
pnpm test              # unit and API tests (needs a migrated, seeded database)
pnpm build
pnpm e2e               # Playwright against the built apps
pnpm dev               # API on :4000, web on :3000 (open http://localhost:3000)
pnpm --filter @cafm/worker start   # background worker (needs REDIS_URL, after pnpm build)
pnpm cafm tenant:list   # platform tenant CLI (owner role): tenant:create, tenant:set-plan, tenant:suspend, tenant:activate
```

Copy `.env.example` to `.env` and export its variables (`set -a; . ./.env; set +a`). Local services: `docker compose up -d` (Postgres, Redis, MinIO, Mailpit); set `MINIO_ROOT_PASSWORD` in `.env` first.

Deploying: see `docs/deploy/railway.md` (one Railway service; `pnpm start` sets up the database, then runs the app).

Permissions and plans: add permission keys to `packages/shared/src/permissions.ts` and feature keys to `entitlements.ts`; guard endpoints with `@RequirePermission()` and `@RequireFeature()`; record changes with `audit()` and queue side effects with `enqueue()` in the same `withTenant` transaction. Worker handlers register a topic in `apps/worker/src/handlers.ts`.

Two database roles: `cafm` owns the schema and runs migrations and the seed (`DATABASE_URL`); `cafm_app` is what the API connects as (`APP_DATABASE_URL`). It owns nothing and cannot bypass RLS. Never point the API at the owner role.

New schema changes: edit `packages/db/prisma/schema/<module>.prisma`, then add a migration folder `packages/db/prisma/schema/migrations/<yyyymmddhhmmss>_<name>/migration.sql` containing the output of `pnpm --filter @cafm/db -s migrate:diff` (diffs your migrated `DATABASE_URL` against the schema), plus the RLS policies for any new tenant-owned table (separate read and write policies, as for `membership`) and a test in `packages/db/test/rls.test.ts`.

Design tooling (run in `design/`):

```bash
npm install
npm run validate   # icon references, SVG structure, screen ids
npm run render     # validate, render all screens, compress, regenerate the screen catalogue
npm run contrast   # WCAG contrast check
npm run icons      # rebuild icons, sprite, manifest, tokens.json
```

## Agent environment

Scheduled agents run in the personal cloud environment "CAFM". Its setup script installs Postgres 16, Redis and the design tooling, but cannot start background services, so start them in your session when you need them:

```bash
service postgresql start
redis-server --daemonize yes
su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='cafm'\" | grep -q 1 || psql -c \"CREATE ROLE cafm LOGIN PASSWORD 'cafm' CREATEDB\""
su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='cafm_dev'\" | grep -q 1 || createdb -O cafm cafm_dev"
su postgres -c "psql -q -f infra/postgres/init.sql"   # the cafm_app role
export DATABASE_URL=postgresql://cafm:cafm@localhost:5432/cafm_dev
export APP_DATABASE_URL=postgresql://cafm_app:cafm_app@localhost:5432/cafm_dev
export REDIS_URL=redis://localhost:6379 DEMO_MODE=true
corepack enable && pnpm install && pnpm db:migrate && pnpm db:seed
```

These are local test credentials only, never used outside the container.

## Definition of done

See `docs/plan/08-roadmap.md` § Definition of Done. In short:

- permission- and entitlement-checked
- cross-tenant test
- unit, API and e2e tests
- accessible and matches the mockup
- audit events
- custom fields and workflow where configurable
- demo data
- help text and changelog.

## Demo personas

Sam Sutton (Super User) · Alex Rowe (Administrator) · Morgan Ellis (FM Manager) · Hana Patel (Helpdesk) · Priya Shah (Planner) · Tom Price (Technician) · Cara Lloyd (Contractor, Sparks Electrical Ltd) · Riley Morgan (Requester) · Fiona Clarke (Finance) · Colin Baxter (Compliance). Full list in doc 06. Tenant: Demo Estates Ltd, 12 sites. Password in demo only: `CafmDemo!2026`.
