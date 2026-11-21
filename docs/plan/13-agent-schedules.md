# 13 · Agent Schedule Strategy

> Status: **Stage 0 ready to switch on.** Decisions D13–D15 accepted ([doc 10](10-risks-and-decisions.md)) and the "CAFM" cloud environment created. The Stage 0 routines are created from [docs/agents/routines.md](../agents/routines.md) (see §7); later stages are added as their roadmap phase starts.

## 1. The idea

The platform is built by a team of **scheduled AI agents**. Each agent owns one element of the product (a module or a cross-cutting concern) and runs on a schedule. Every run, it does one useful thing for its element, in this order:

1. **Fix** anything broken in its area (failing checks, bugs, review feedback).
2. **Build** the next unbuilt feature for its area from the [feature catalogue](02-feature-catalogue.md), in [roadmap](08-roadmap.md) order.
3. **Improve** what already exists: closer match to the [screens](12-screen-catalogue.md), better tests, accessibility, performance, clearer code.

Each agent works only in its own area, opens a small draft pull request, writes notes for its next run, and stops. A **conductor** agent keeps everyone in sequence, and **guardian** agents (QA, security, design fidelity, performance, docs, maintenance) watch quality across all areas. The product owner reviews and merges. Agents never merge their own work (D13).

## 2. Agent roster at a glance

Times are UK time (`CRON_TZ=Europe/London`). The build cadence applies while an agent's stage is active; after that it drops to the maintain cadence (one run a week, on the first build day, at the same time). Minutes are deliberately off the hour and half hour, and no run starts between 14:00 and 17:00 UK, when platform load is highest.

| ID | Agent | Builds (catalogue §) | Stage | Build cadence | Cron (build) |
|----|-------|----------------------|-------|---------------|--------------|
| A00 | Conductor | Coordination | 0 → always | Daily | `41 7 * * *` |
| A01 | Foundations & infrastructure | Repo, CI/CD, environments | 0 | Daily in Phase 0, then Mon/Wed/Fri | `13 18 * * *` |
| A02 | Identity & sign-in | Login, demo panel, sessions, MFA, SSO | 0 | Mon/Wed/Fri | `37 18 * * 1,3,5` |
| A03 | Tenancy, access & entitlements | RLS, RBAC, scopes, audit, plan gating | 0 | Tue/Thu/Sat | `13 18 * * 2,4,6` |
| A04 | Configuration engine | §0 fields, forms, workflows, automation, SLA engine | 0 (late) → 2A | Tue/Thu/Sat | `37 18 * * 2,4,6` |
| A05 | Design system & app shell | Tokens, components, icons, shell, states | 0 | Mon/Wed/Fri | `7 19 * * 1,3,5` |
| A06 | Demo data & environments | Seed generator, nightly reset, demo guard rails | 0 | Tue/Fri | `7 19 * * 2,5` |
| A07 | Super User admin console | §33 | 1 | Mon/Wed/Fri | `53 19 * * 1,3,5` |
| A10 | Locations & assets | §1, §5 | 1 | Mon/Wed/Fri | `17 20 * * 1,3,5` |
| A11 | Helpdesk & requester portal | §2 | 1 | Tue/Thu/Sat | `17 20 * * 2,4,6` |
| A12 | Work orders | §3 | 1 | Mon/Wed/Fri | `43 20 * * 1,3,5` |
| A13 | Planned maintenance | §4 | 1 | Tue/Thu/Sat | `43 20 * * 2,4,6` |
| A14 | Mobile app | §21 | 1 → 5 | Mon/Wed/Fri | `11 21 * * 1,3,5` |
| A15 | Notifications & communications | §0 notifications, §30 | 1 | Tue/Thu | `11 21 * * 2,4` |
| A16 | Reporting & dashboards | §28 | 1 → 4 | Tue/Thu/Sat | `39 21 * * 2,4,6` |
| A20 | Compliance & inspections | §6 | 2A | Mon/Wed/Fri | `7 22 * * 1,3,5` |
| A21 | Health, safety & permits | §7 | 2A → 4 | Tue/Thu/Sat | `7 22 * * 2,4,6` |
| A22 | Contractors & portal | §8 | 2A | Mon/Wed/Fri | `31 22 * * 1,3,5` |
| A23 | Contracts & SLAs | §9 | 2B | Tue/Thu/Sat | `31 22 * * 2,4,6` |
| A24 | Scheduling & workforce | §10 | 2B | Mon/Wed/Fri | `3 23 * * 1,3,5` |
| A25 | Inventory & tools | §11 | 2B | Tue/Thu/Sat | `3 23 * * 2,4,6` |
| A26 | Procurement | §12 | 2B | Mon/Wed/Fri | `29 23 * * 1,3,5` |
| A27 | Finance & client billing | §13 | 2B | Tue/Thu/Sat | `29 23 * * 2,4,6` |
| A28 | Documents & keys | §14, §25 | 2A | Mon/Thu | `17 0 * * 1,4` |
| A29 | Integrations & public API | §32 | 2A → 5 | Tue/Fri | `17 0 * * 2,5` |
| A30 | Space, floor plans & moves | §15, §20 | 3 | Mon/Wed/Fri | `43 0 * * 1,3,5` |
| A31 | Bookings & visitors | §18, §19 | 3 | Tue/Thu/Sat | `43 0 * * 2,4,6` |
| A32 | Energy & sustainability | §22 | 3 | Mon/Wed/Fri | `11 1 * * 1,3,5` |
| A33 | IoT & BMS | §26 | 3 | Tue/Thu/Sat | `11 1 * * 2,4,6` |
| A40 | Real estate & leases | §27 | 4 | Mon/Thu | `37 1 * * 1,4` |
| A41 | Capital planning & projects | §16, §17 | 4 | Tue/Fri | `37 1 * * 2,5` |
| A42 | Services & continuity | §23, §24, §31 | 4 | Mon/Wed/Fri | `7 2 * * 1,3,5` |
| A43 | Sector packs | §35 | 4 | Tue/Thu/Sat | `7 2 * * 2,4,6` |
| A44 | AI suite | §29 | 2A (certificates) → 4 | Mon/Wed/Fri | `33 2 * * 1,3,5` |
| A50 | Subscriptions & billing | Doc 07 billing, entitlements live | 5 | Mon/Wed/Fri | `3 3 * * 1,3,5` |
| A51 | Marketing site & onboarding | Phase 5 homepage, sign-up, trials | 5 | Tue/Thu/Sat | `3 3 * * 2,4,6` |
| A52 | Platform administration | §34 | 2B (basic) → 5 | Mon/Thu | `29 3 * * 1,4` |
| A90 | QA & test health | All | 0 → always | Daily | `13 4 * * *` |
| A91 | Security | All | 1 → always | Weekly (Sun) | `7 5 * * 0` |
| A92 | Design fidelity & accessibility | All UI | 1 → always | Wed/Sun | `37 5 * * 0,3` |
| A93 | Performance | All | 2B → always | Weekly (Sat) | `41 5 * * 6` |
| A94 | Docs & plan keeper | Docs 01–14 | 1 → always | Weekly (Sun) | `13 6 * * 0` |
| A95 | Dependencies & maintenance | Packages, tooling | 2B → always | Weekly (Sat) | `13 6 * * 6` |

**Run volume.** Stage 0 is about 30 runs a week (D14). Peak (Phase 4, before Phases 1–2 agents drop to maintain) is about 90 a week. Run volume is reviewed every two weeks against output (merged PRs, issues closed, quality metrics).

## 3. How every run works (standard run protocol)

Every agent follows this protocol. Its own section only adds focus.

1. **Orient (fresh session, no memory).** Read `CLAUDE.md`, then this document's section for the agent, then its notebook `docs/agents/notes/<ID>.md`. Then read its catalogue sections and screens, the latest `docs/agents/status.md` from the conductor, open issues labelled `agent:<ID>`, and its own open pull request if there is one.
2. **Pick exactly one work item**, in this priority order:
   1. Its open PR has *changes requested* or failing checks → address them.
   2. The default branch is failing in paths it owns → fix the root cause.
   3. Issues labelled `agent:<ID>` + `type:bug`, highest `priority:` first.
   4. Issues labelled `agent:<ID>` + `priority:now` (set by the product owner).
   5. The next unbuilt feature in its catalogue sections for the **current** roadmap phase (the conductor keeps these as issues).
   6. An improvement from its focus list (fidelity, tests, accessibility, performance, clarity).

   If its PR is open and waiting for review with nothing to change, it does a quick check that the PR still merges cleanly and still passes its checks, then stops.
3. **Work on its own branch:** `agent/<ID>-<short-slug>` (for example `agent/A12-sla-pause-reasons`). Keep the change small: about 400 changed lines of hand-written code at most (tests, generated files and fixtures excluded). Split anything bigger into steps.
4. **Verify before pushing:** typecheck, lint, unit tests, API tests (including cross-tenant denial tests for every touched endpoint), end-to-end tests for touched journeys, and for UI changes a screenshot compared side by side with the matching mockup.
5. **Ship:** push and open or update one **draft PR**, using the PR template: what changed and why, catalogue § references, screenshots next to the mockup, tests run and their results, risks, and follow-ups.
6. **Write notes:** update `docs/agents/notes/<ID>.md` (its own file, so agents never conflict on it) with what it did, decisions made, gotchas, and the next three candidate items.
7. **Stop.** Never wait or poll. If blocked, open or update an issue (`blocked` or `decision-needed`, plus the owning agent's label) and end the run.

### Guard rails (apply to every agent)

- **Never** push to the default branch, merge, force-push, rewrite history, or close other agents' PRs.
- **Only edit owned paths** (see each section). Shared paths follow the rules in §5. Anything else goes through an issue to its owner.
- **Never** skip, disable or weaken a test to get green; never reduce tenant-isolation or permission checks.
- **No secrets** in code, logs, fixtures or PRs. No real personal data in seed or tests.
- **No new runtime dependency** without a reason in the PR; A95 reviews additions.
- **Design rules:** tokens and shared components only, with no new colours or one-off styles. A new UI pattern needs a mockup first: add it under `design/mockups/screens/` and render it, and A92 reviews it.
- **Plan rules:** if the agent's work changes behaviour described in the plan, it updates its own catalogue § in the same PR. A94 reconciles anything wider.
- **One open PR per agent.** When the PR merges, the next run starts the next item.

## 4. Coordination

- **Conductor (A00)** runs every morning. It:
  - reads all agent PRs, issues and check results
  - updates the pinned **"Agent status board"** GitHub issue (an issue rather than a file, so it doesn't need a pull request every day): per-agent state, PRs waiting for review, blocked items, the recommended merge order
  - opens the next feature issues for each active agent from the catalogue
  - flags overlaps between agents
  - posts a short daily digest to the product owner (push notification).

  The conductor writes no product code.
- **Issue labels:** `agent:<ID>`, `module:<slug>`, `phase:<0|1|2A|2B|3|4|5>`, `type:<feature|bug|improvement|tech-debt|docs>`, `priority:<now|next|later>`, `blocked`, `decision-needed`, `needs-design`.
- **Merge order.** The conductor recommends merging foundations and shared changes (schema, shared types, UI components) before module PRs that depend on them. Module PRs then rebase onto the default branch in their next run.
- **The product owner** reviews and merges PRs, answers `decision-needed` issues, and steers by adding `priority:now` to an issue.
- **Cross-agent requests:** an agent that needs a change in someone else's area opens an issue with `agent:<owner>` and a short spec. The owner picks it up as a normal work item.

## 5. Code ownership and shared paths

Repository layout follows [doc 04](04-architecture.md). `<module>` is the agent's module slug (listed in its section).

| Path pattern | Owner |
|--------------|-------|
| `apps/api/src/modules/<module>/**` | Module agent |
| `apps/web/app/(app)/<module>/**` | Module agent |
| `apps/worker/src/jobs/<module>/**` | Module agent |
| `packages/db/prisma/schema/<module>.prisma` | Module agent |
| `packages/db/prisma/migrations/**` | Any agent may **add** a new migration for its own schema file; never edit an existing one |
| `packages/db/seed/modules/<module>.ts` | Module agent (A06 owns the generator and reset) |
| `apps/web/e2e/<module>/**`, `apps/api/test/<module>/**` | Module agent |
| `packages/shared/src/<module>/**` | Module agent (additive changes only to anything shared) |
| `packages/ui/**`, `design/**` | A05 (A92 reviews; others request via issue or add new mockup files) |
| `packages/config-engine/**` | A04 |
| `apps/api/src/core/auth/**`, `apps/web/app/(auth)/**` | A02 |
| `apps/api/src/core/tenancy/**`, `apps/api/src/core/rbac/**`, `apps/api/src/core/audit/**`, `apps/api/src/core/entitlements/**` | A03 |
| `.github/**`, `infra/**`, root config, `turbo.json` | A01 |
| `docs/plan/**` | A94 (module agents may edit only their own catalogue §) |
| `docs/agents/status.md` (points to the status board issue) | A00 |
| `docs/agents/notes/<ID>.md` | That agent only |

Ownership is also written to `.github/CODEOWNERS` in Phase 0, mapped to agent labels for the conductor's checks.

## 6. Rollout

| Stage | Roadmap phase | Agents switched on | Agents dropping to maintain |
|-------|---------------|--------------------|-----------------------------|
| 0 | Phase 0 Foundations | A00, A01, A02, A03, A04 (from week 3), A05, A06, A90 | — |
| 1 | Phase 1 Core MVP | A07, A10, A11, A12, A13, A14, A15, A16, A91, A92, A94 | A01 (to Mon/Wed/Fri), A06 |
| 2A | Phase 2A Comply | A20, A21, A22, A28, A29, A44 (certificate reading) | A02 |
| 2B | Phase 2B Commercial | A23, A24, A25, A26, A27, A52 (basic), A93, A95 | A10, A13 |
| 3 | Phase 3 Workplace | A30, A31, A32, A33 | A11, A12, A15, A20, A22 |
| 4 | Phase 4 Enterprise | A40, A41, A42, A43, A44 (full) | A21, A23–A28 |
| 5 | Phase 5 Commercialise | A50, A51, A52 (full) | Stage 3 agents |

An agent graduates from build to maintain when:
- every feature in its catalogue sections for the current phase is merged
- its end-to-end journeys pass on the default branch
- A92 has signed off design fidelity for its screens
- A94 has confirmed the docs match.

Maintenance runs keep the fix → improve loop going.

**Agents whose features span several phases switch back to build cadence when a later phase starts.** For example, A10 returns in Phase 4 for asset depreciation, FMEA and BIM import, and A20 returns for the golden thread. The conductor re-enables the build schedule and seeds the issues.

**Before Stage 0 starts (prerequisites):**
1. The cloud environment for agents (D15): repository access, Postgres 16 and Redis installed by the setup script, and network access to the package registries.
2. `CLAUDE.md`, this document and the PR template merged.
3. The labels created in GitHub.
4. The conductor's first run seeds the Phase 0 issues from the roadmap.

## 7. How a schedule is set up (later)

Each agent becomes one scheduled task that **starts a fresh session on each run** in the agents' cloud environment, with this repository checked out. Its prompt is the agent's **standing brief** (in its section below), always prefixed with:

> You are agent {ID} ({name}) on the CAFM project. Follow `CLAUDE.md` and the standard run protocol in `docs/plan/13-agent-schedules.md`, then your own section {ID}. Do one work item, open or update one draft PR, update `docs/agents/notes/{ID}.md`, and stop.

Tasks for later stages are created **disabled** and enabled when their stage starts. Only the conductor sends push notifications; agents report through their PRs.

**Until A01's monorepo scaffold is merged on `main`**, every other agent limits its run to planning: reading its sections, refining its issues, and writing a short design note in its notebook PR. Agents must not create their own workspace or `package.json` files, so they never build competing scaffolds.

### Stage 0 schedules (to be created in the claude.ai routines page)

**Why they're created by hand.** Agents need GitHub write access to open issues, branches and pull requests. That access is only granted when the repository is selected as a source when the routine is created in the claude.ai routines page. On 21 Nov 2026 three approaches were tested from inside a Claude session, and all failed:
- schedules that start a new session (read-only clone, GitHub API refused)
- schedules that wake an existing session (started a new, empty session instead)
- new sessions attaching the repository themselves (the tool isn't available to them)

So the eight Stage 0 routines are set up by the product owner from [docs/agents/routines.md](../agents/routines.md), which has each routine's name, schedule and full prompt ready to paste. They run in the "CAFM" environment.

| Agent | Routine | Schedule (UK time) | State |
|-------|---------|--------------------|-------|
| A00 Conductor | CAFM A00 Conductor | Daily 07:41 | To create (push notifications on) |
| A01 Foundations | CAFM A01 Foundations | Daily 18:13 | To create |
| A02 Identity | CAFM A02 Identity | Mon/Wed/Fri 18:37 | To create |
| A03 Tenancy & access | CAFM A03 Tenancy & access | Tue/Thu/Sat 18:13 | To create |
| A04 Configuration engine | CAFM A04 Configuration engine | Tue/Thu/Sat 18:37 | To create, switched off until Phase 0 week 3 |
| A05 Design system | CAFM A05 Design system | Mon/Wed/Fri 19:07 | To create |
| A06 Demo data | CAFM A06 Demo data | Tue/Fri 19:07 | To create |
| A90 QA | CAFM A90 QA | Daily 04:13 | To create |

---

## 8. Agent sections

### A00 · Conductor

- **Mission:** keep the agent team moving in the right order and keep the product owner informed.
- **Builds:** nothing in product code. Owns `docs/agents/status.md` and the issue backlog.
- **Each run:**
  - refresh the status board: active agents, open PRs and their state, blocked and decision-needed items, the recommended merge order
  - open the next 1–3 feature issues for each active agent from the catalogue, labelled per §4
  - detect PRs that touch the same files and comment on both
  - post a five-line digest.
- **Fixes and improves:** stale issues, missing labels, agents with no progress for a week (flag to the product owner), backlog ordering against the roadmap.
- **Done when:** never; it is permanent.
- **Standing brief:** "Update the status board and backlog. Recommend a merge order. Flag conflicts and stalls. Send the daily digest. Never write product code."

### A01 · Foundations & infrastructure

- **Mission:** a fast, reliable monorepo, pipeline and set of environments that every other agent can depend on.
- **Builds:** pnpm/Turborepo workspace, TypeScript strict config, lint/format, Docker Compose local stack, GitHub Actions (typecheck, lint, unit, API, e2e, build, image), preview deploys, Railway staging/demo/production, OpenTelemetry and error tracking, `CODEOWNERS`, PR template.
- **Owns:** `.github/**`, `infra/**`, root configs, `turbo.json`, `package.json` (root).
- **Depends on:** nothing. **Module slug:** `platform`.
- **Fixes:** flaky or slow CI, broken preview deploys, cache misses.
- **Improves:** CI time (target < 10 min), developer setup time, environment parity, cost.
- **Done when:** Phase 0 pipeline items are green and documented; then maintain.
- **Standing brief:** "Keep the build, CI and environments green and fast. Prefer the smallest change that makes the pipeline more reliable."

### A02 · Identity & sign-in

- **Mission:** secure, simple sign-in matching doc 06, including the demo login page.
- **Builds:**
  - global accounts and memberships
  - login with the demo-accounts panel and autofill (gated by `DEMO_MODE`)
  - organisation picker, sessions, logout, password reset, invites, terms acceptance
  - lockout and rate limiting
  - TOTP, then passkeys, recovery codes, OAuth tokens for mobile
  - SSO/SCIM in Phase 5.
- **Screens:** `auth-01` to `auth-05`, `admin-08-security`.
- **Owns:** `apps/api/src/core/auth/**`, `apps/web/app/(auth)/**`. **Module slug:** `auth`.
- **Depends on:** A01, A03 (tenancy context).
- **Fixes:** any auth bug immediately (priority over features), session edge cases, enumeration leaks.
- **Improves:** sign-in speed, password-manager compatibility, accessibility of the login page.
- **Done when:** doc 06 Phase 0–1 items merged and the security test journeys pass.
- **Standing brief:** "Own sign-in end to end. Security first: no user enumeration, the demo panel only in DEMO_MODE, every change covered by tests."

### A03 · Tenancy, access & entitlements

- **Mission:** no data ever leaks between organisations, and every action is permission- and plan-checked.
- **Builds:**
  - tenant context middleware and transaction-local RLS
  - DB roles and cross-tenant test harness
  - permission registry, roles, scopes, field security, ABAC conditions
  - audit log infrastructure
  - entitlements model with `feature()` gating.
- **Owns:** `apps/api/src/core/{tenancy,rbac,audit,entitlements}/**`, RLS policies in `packages/db`. **Module slug:** `access`.
- **Depends on:** A01.
- **Fixes:** any isolation or permission defect (top priority for the whole team), missing audit events.
- **Improves:** permission explanation ("why can this user see this?"), audit query speed, test coverage of every endpoint.
- **Done when:** the cross-tenant test runs automatically against every endpoint and doc 03 is implemented; then maintain.
- **Standing brief:** "Guard tenant isolation and permissions. Add a failing test before every fix. Never relax a check."

### A04 · Configuration engine

- **Mission:** let the Super User reshape the system without code (§0).
- **Builds:**
  - custom fields with plan limits
  - form layouts and the form designer
  - workflow state machines, the automation rules engine (including phone-call escalation), approvals
  - SLA engine with business calendars
  - numbering sequences, config versioning with diff and rollback, config export/import.
- **Screens:** `admin-04-workflow`, `admin-05-forms`, `admin-06-sla`, `admin-13-request-catalogue`.
- **Owns:** `packages/config-engine/**`, `apps/api/src/modules/config/**`, `apps/web/app/(app)/admin/{fields,forms,workflows,sla}/**`. **Module slug:** `config`.
- **Depends on:** A03.
- **Fixes:** rule loops, SLA calculation errors (with property-based tests), slow form rendering.
- **Improves:** builder usability, run history, test mode.
- **Done when:** §0 configuration items through Phase 2A are merged.
- **Standing brief:** "Build the engine every module relies on. Keep it generic and fast, and test SLA and workflow logic exhaustively."

### A05 · Design system & app shell

- **Mission:** the code version of doc 11, so every screen looks like the mockups.
- **Builds:**
  - Tailwind theme from `design/tokens/tokens.json`
  - `packages/ui` components (buttons, badges, chips, tabs, tables, KPI tiles, cards, forms, timeline, charts, floor-plan and map wrappers, modal, drawer, command palette, toasts, states)
  - icon sprite, app shell (navigation rail, top bar, ⌘K), light/dark theme.
- **Screens:** `ds-01` to `ds-10`, plus the shell on every screen.
- **Owns:** `packages/ui/**`, `design/**`. **Module slug:** `ui`.
- **Depends on:** A01.
- **Fixes:** visual regressions, accessibility failures in shared components.
- **Improves:** component API consistency, Storybook-style visual tests, bundle size.
- **Done when:** all components in doc 11 exist with tests and match the sheets; then maintain and own new mockups.
- **Standing brief:** "Make shared components pixel-close to the design sheets. Tokens only. Every component accessible and visually tested."

### A06 · Demo data & environments

- **Mission:** a demo tenant that always looks real and current (doc 06).
- **Builds:**
  - deterministic seed generator and module seed fragment framework
  - "Demo Estates Ltd" and the Starter demo tenant, with the 16 personas
  - nightly reset with date roll-forward and pre-reset banner
  - demo guard rails (locked credentials, captured email, upload limits)
  - personal demo clone (Phase 5).
- **Owns:** `packages/db/seed/{core,generator,reset}/**`, demo config. **Module slug:** `demo`.
- **Depends on:** A02, A03.
- **Fixes:** seed failures, reset drift, data that contradicts the screens.
- **Improves:** realism (numbers match the screen catalogue: 2,418 assets, 148 open work orders, 97.1% compliance), seed speed.
- **Done when:** the Phase 0 demo works end to end; afterwards each module agent adds its own seed fragment.
- **Standing brief:** "Keep the demo believable and consistent with the mockups. The seed is deterministic and the reset is reliable."

### A07 · Super User admin console

- **Mission:** everything the Super User can do (doc 03 and §33), in one coherent console.
- **Builds:**
  - users and licences, invites, CSV import, username-only accounts, delegated admin, impersonation
  - roles matrix UI, teams, modules and terminology, branding with contrast check
  - security settings UI, audit log viewer, adoption reports, data retention and DSAR tools
  - subscription screen (data from A50 in Phase 5).
- **Screens:** `admin-01`, `admin-02`, `admin-03`, `admin-07`, `admin-08`, `admin-09`, `admin-11`, `admin-12`.
- **Owns:** `apps/web/app/(app)/admin/**` (except A04's builders), `apps/api/src/modules/admin/**`. **Module slug:** `admin`.
- **Depends on:** A02, A03, A04, A05.
- **Fixes:** privilege-escalation gaps (with A03), confusing settings.
- **Improves:** setup checklist, search across settings, bulk operations.
- **Done when:** doc 03 "Everything the Super User can do" is fully available (Phase 5 items last).
- **Standing brief:** "Give the Super User full, safe control. Every sensitive action re-authenticates, is audited and can be undone."

### A10 · Locations & assets

- **Mission:** a trustworthy register of every site, space and asset (§1, §5).
- **Builds:**
  - location hierarchy and site map, calendars and jurisdiction per site, QR labels
  - asset register with classifications and attributes, "serves" relationships
  - meters, warranties, condition surveys, reliability metrics, repeat-failure insight (with A44)
  - transfers and disposal, BIM/COBie import (Phase 4).
- **Screens:** `assets-01`, `assets-02`, `locations-01`, `locations-02`.
- **Module slugs:** `locations`, `assets`.
- **Depends on:** A03, A04, A05.
- **Fixes:** import errors, hierarchy edge cases, slow large lists (500k assets target).
- **Improves:** bulk edit, label printing, map clustering.
- **Done when:** §1 and §5 Phase 1 items are merged; later-phase items are scheduled as issues.
- **Standing brief:** "Build the asset and location backbone the whole product hangs off. Correct data model first, then speed at scale."

### A11 · Helpdesk & requester portal

- **Mission:** logging a request takes seconds and routes itself (§2).
- **Builds:**
  - request catalogue and triage scripts, priority matrix
  - helpdesk queue, quick-log modal, email-to-ticket, QR reporting, duplicate detection
  - requester portal, CSAT, knowledge base, appointment self-booking, Teams/Slack intake.
- **Screens:** `helpdesk-01` to `helpdesk-03`, `mobile-03` (requester), `admin-13`.
- **Module slug:** `helpdesk`.
- **Depends on:** A04, A10, A15.
- **Fixes:** mis-routing, duplicate false positives, email parsing failures.
- **Improves:** time to log (target < 30 s), keyboard flow, deflection via knowledge base.
- **Done when:** §2 Phase 1–2B items are merged.
- **Standing brief:** "Make reporting and triage effortless for requesters and the helpdesk. Measure the time to log a request."

### A12 · Work orders

- **Mission:** the core job lifecycle, reliable and SLA-accurate (§3).
- **Builds:**
  - work order lifecycle on the workflow engine, assignment (including contractors by magic link)
  - SLA clocks and escalation, labour/parts/costs, NTE approvals
  - checklists, photos, signatures, geo-verified arrival
  - list, board, map and calendar views, job-sheet PDFs, bulk create, follow-ons and recalls.
- **Screens:** `wo-01` to `wo-04`, `home-01`.
- **Module slug:** `work-orders`.
- **Depends on:** A04, A10, A15.
- **Fixes:** SLA timing bugs, status transitions that bypass rules, PDF layout issues.
- **Improves:** list performance, bulk actions, board drag-and-drop.
- **Done when:** §3 Phase 1 items are merged and the requester → technician → sign-off journey passes.
- **Standing brief:** "Own the work order from logging to invoicing. SLA maths must be exact and every status change must go through the workflow engine."

### A13 · Planned maintenance

- **Mission:** PPM that keeps estates compliant without manual effort (§4).
- **Builds:**
  - task library, SFG20 import and connector
  - calendar, meter and condition schedules, fixed vs floating, nested visits
  - generator worker, 52-week planner, forecasting, planned outage management (with A30), PPM compliance KPI.
- **Screens:** `ppm-01`, `ppm-02`.
- **Module slug:** `ppm`.
- **Depends on:** A10, A12.
- **Fixes:** generation gaps and duplicates (idempotent generator), timezone and bank-holiday errors.
- **Improves:** planner drag-to-reschedule, forecast accuracy.
- **Done when:** §4 Phase 1 items are merged; SFG20 connector by Phase 2A.
- **Standing brief:** "Never miss or duplicate a planned visit. The generator is idempotent and tested across calendars."

### A14 · Mobile app

- **Mission:** a fast, offline-first app for technicians, contractors and requesters (§21).
- **Builds:**
  - PWA with offline work packs, mutation queue sync and conflict handling
  - jobs, checklists, photos, signatures, parts and time
  - QR/NFC scanning, meter readings with photo check, building rounds
  - requester mode; Expo native app in Phase 5.
- **Screens:** `mobile-01` to `mobile-04`, `dark-05`.
- **Owns:** `apps/web/app/(mobile)/**`, `apps/mobile/**`. **Module slug:** `mobile`.
- **Depends on:** A02 (OAuth tokens), A12.
- **Fixes:** sync conflicts, lost offline changes (highest priority), battery and data use.
- **Improves:** start-up time, one-handed usability, offline test coverage.
- **Done when:** the offline journey (doc 09) passes reliably; native app in Phase 5.
- **Standing brief:** "Work must never be lost offline. Test with the network off and keep it usable with one hand and gloves."

### A15 · Notifications & communications

- **Mission:** the right message, to the right person, through the right channel (§0 notifications, §30).
- **Builds:**
  - notification service: in-app, email, push, SMS, Teams/Slack
  - preferences and digests, template editor
  - broadcasts with scheduling and room-panel/portal channels, announcements
  - surveys and NPS with AI themes (with A44), email sender domains.
- **Screens:** `home-04-notifications`, `comms-01`, `comms-02`.
- **Module slugs:** `notifications`, `comms`.
- **Depends on:** A03, A04.
- **Fixes:** delivery failures, duplicate notifications, demo-mode capture leaks.
- **Improves:** delivery tracking, quiet hours, template preview.
- **Done when:** §30 and the notification parts of §0 are merged.
- **Standing brief:** "Deliver every message exactly once, respect preferences, and never send real messages from demo tenants."

### A16 · Reporting & dashboards

- **Mission:** decisions backed by clear numbers (§28).
- **Builds:**
  - standard report library and role dashboards, then configurable dashboards (2B)
  - report builder, scheduled report packs and client reports (4)
  - BI connector, benchmarking (5).
- **Screens:** `home-01`, `home-02`, `reports-01`.
- **Module slug:** `reporting`.
- **Depends on:** A03, and data from each module.
- **Fixes:** numbers that disagree between screens (a single metrics layer), slow queries.
- **Improves:** chart accessibility, export quality, caching.
- **Done when:** §28 items for each phase are merged.
- **Standing brief:** "One definition per metric, used everywhere. Fast, accessible charts that match the design system."

### A20 · Compliance & inspections

- **Mission:** prove the estate is safe and legal, at a glance (§6).
- **Builds:**
  - compliance register, jurisdiction-aware UK templates, certificates with AI extraction (with A44)
  - remedial actions, compliance matrix and statuses
  - inspection form builder and mobile inspections, building rounds
  - logbooks, auditor access, golden thread (Phase 4).
- **Screens:** `compliance-01` to `compliance-04`, `mobile-04`.
- **Module slugs:** `compliance`, `inspections`.
- **Depends on:** A04, A10, A13.
- **Fixes:** expiry calculation errors, missed alerts, template mistakes (flag to the reviewer, D12).
- **Improves:** evidence-pack export, matrix performance, template coverage.
- **Done when:** §6 Phase 2A items are merged; golden thread in Phase 4.
- **Standing brief:** "Compliance status must always be correct and evidenced. Templates come from the reviewed library, never from guesses."

### A21 · Health, safety & permits

- **Mission:** safe work and fast incident follow-through (§7).
- **Builds:**
  - RAMS and permit to work with LOTO, isolations and conflict checks (Phase 2A)
  - incidents, RIDDOR checks, investigations and CAPA, risk register and heat map
  - lone working, toolbox talks, COSHH, insurance claims (Phase 4).
- **Screens:** `safety-01` to `safety-03`.
- **Module slugs:** `safety`, `permits`.
- **Depends on:** A04, A12, A22.
- **Fixes:** permit conflicts that are missed, RIDDOR logic errors.
- **Improves:** mobile permit flow, investigation templates.
- **Done when:** permits in Phase 2A, the rest of §7 in Phase 4.
- **Standing brief:** "Life-safety first: permits and isolations must be unambiguous, auditable and conflict-checked."

### A22 · Contractors & portal

- **Mission:** a supply chain that is vetted, responsive and easy to work with (§8).
- **Builds:**
  - supplier records, accreditation and insurance with auto-suspension, onboarding
  - contractor portal (one login across customers) and site sign-in
  - RFQ and quote comparison, scorecards, self-billing; contractor marketplace beta (Phase 5).
- **Screens:** `contractors-01` to `contractors-04`, `mobile-04`.
- **Module slug:** `contractors`.
- **Depends on:** A02, A03, A12.
- **Fixes:** suspension edge cases, portal permission leaks (with A03).
- **Improves:** portal speed, document request flow, scorecard accuracy.
- **Done when:** §8 Phase 2A items are merged.
- **Standing brief:** "Make contractors want to use the portal while keeping customers' data strictly scoped."

### A23 · Contracts & SLAs

- **Mission:** contract performance that is measured fairly and automatically (§9).
- **Builds:**
  - contract register, contract-specific SLAs and calendars, KPI framework and monthly scorecards
  - service-credit calculation, schedules of rates
  - multi-client features and client portal (Phase 4, with A27).
- **Screens:** `contracts-01`.
- **Module slug:** `contracts`.
- **Depends on:** A04, A12, A16.
- **Fixes:** KPI miscalculation, exclusions not applied.
- **Improves:** dispute workflow, client report PDF.
- **Done when:** §9 Phase 2B items are merged; FM-provider edition in Phase 4.
- **Standing brief:** "Every KPI and deduction must be explainable from the underlying jobs and pause reasons."

### A24 · Scheduling & workforce

- **Mission:** the right engineer at the right job at the right time (§10).
- **Builds:**
  - dispatch board, live map (opt-in GPS on shift), skills and qualifications with expiry blocking
  - shifts, on-call and leave, timesheets, capacity planning
  - auto-schedule suggestions (with A44), route optimisation (Phase 4).
- **Screens:** `dispatch-01`, `dispatch-02`.
- **Module slugs:** `scheduling`, `workforce`.
- **Depends on:** A12, A14.
- **Fixes:** double-booking, wrong travel estimates, expired-qualification assignments.
- **Improves:** drag-and-drop performance, suggestion quality.
- **Done when:** §10 Phase 2B items are merged.
- **Standing brief:** "Planners should trust the board. Never let an unqualified or double-booked engineer slip through."

### A25 · Inventory & tools

- **Mission:** the right parts in the right van, and tools that are in calibration (§11).
- **Builds:** parts catalogue, stores and van stock, movements ledger, reorder suggestions, stock takes, serialised parts, kits, tools and test equipment with calibration blocking.
- **Screens:** `inventory-01`, `inventory-02`.
- **Module slug:** `inventory`.
- **Depends on:** A12.
- **Fixes:** stock ledger mismatches (double-entry tests), reservation leaks.
- **Improves:** mobile scanning speed, reorder accuracy.
- **Done when:** §11 Phase 2B items are merged.
- **Standing brief:** "The stock ledger must always balance. Tools out of calibration cannot be used."

### A26 · Procurement

- **Mission:** controlled spend with minimal admin (§12).
- **Builds:** requisitions, purchase orders, delegation-of-authority approvals, goods receipt, invoice capture with AI reading, three-way match; punch-out and frameworks (Phase 4).
- **Screens:** `purchasing-01`, `purchasing-02`.
- **Module slug:** `procurement`.
- **Depends on:** A04 (approvals), A22, A27.
- **Fixes:** approval routing errors, matching tolerance bugs.
- **Improves:** approval speed (magic links), supplier communication.
- **Done when:** §12 Phase 2B items are merged.
- **Standing brief:** "Every pound is approved by the right person and matched before payment."

### A27 · Finance & client billing

- **Mission:** accurate costs, budgets and recharges (§13).
- **Builds:**
  - cost centres, budgets/commitments/actuals, job costing
  - quotes with magic-link approval, Xero/QuickBooks/Sage connectors (with A29)
  - client billing and contract profitability (Phase 4), CIS reverse charge.
- **Screens:** `finance-01` to `finance-03`.
- **Module slug:** `finance`.
- **Depends on:** A12, A26.
- **Fixes:** rounding and VAT errors (money in minor units only), sync failures.
- **Improves:** forecast accuracy, export formats.
- **Done when:** §13 Phase 2B items are merged; billing in Phase 4.
- **Standing brief:** "Money is exact: integer minor units, VAT rules tested, every figure traceable to source records."

### A28 · Documents & keys

- **Mission:** the right document and the right key, always findable (§14, §25).
- **Builds:** document library with versions, expiry, previews and OCR search, external sharing, document requests; key and fob register with signatures.
- **Screens:** `documents-01`, `keys-01`.
- **Module slugs:** `documents`, `keys`.
- **Depends on:** A03, A10.
- **Fixes:** preview failures, permission leaks on shared links.
- **Improves:** search relevance, upload speed.
- **Done when:** §14 and §25 items are merged.
- **Standing brief:** "Files are virus-scanned, permission-checked and findable in seconds."

### A29 · Integrations & public API

- **Mission:** an open platform that connects cleanly to customers' systems (§32).
- **Builds:**
  - public REST API with OpenAPI docs, API keys and OAuth clients, webhooks with signing and retries
  - Microsoft 365, Google and Teams/Slack connectors (with A15), finance connectors (with A27)
  - Zapier/Make, enterprise connectors and the marketplace (Phase 5).
- **Screens:** `admin-10-integrations`.
- **Module slug:** `integrations`.
- **Depends on:** A03 and the module agents.
- **Fixes:** breaking API changes (contract tests), webhook delivery failures.
- **Improves:** API documentation and SDK, rate-limit clarity.
- **Done when:** API v1 and webhooks in Phase 2A; connectors as scheduled.
- **Standing brief:** "Never break an API consumer. Version, document and contract-test everything."

### A30 · Space, floor plans & moves

- **Mission:** space that is visible, measured and planned (§15, §20).
- **Builds:**
  - floor-plan import (DWG/DXF/PDF to SVG, IFC viewer), space inventory, allocation and chargeback
  - utilisation analytics, stacking and scenarios, moves with task generation
  - wayfinding, digital twin view (Phase 5).
- **Screens:** `space-01` to `space-04`, `dark-04`.
- **Module slugs:** `space`, `moves`.
- **Depends on:** A10, A05 (floor-plan component).
- **Fixes:** plan conversion errors, area calculation mistakes.
- **Improves:** plan rendering speed, layer controls.
- **Done when:** §15 and §20 Phase 3 items are merged.
- **Standing brief:** "Floor plans load fast and match reality. Areas follow RICS measurement rules."

### A31 · Bookings & visitors

- **Mission:** booking a desk or welcoming a visitor is effortless (§18, §19).
- **Builds:** desk, room and resource booking with floor-plan picker, calendar sync, check-in and auto-release, catering, room panels, visitor pre-registration, kiosk, badges, evacuation roll-call.
- **Screens:** `booking-01` to `booking-03`, `visitors-01`, `visitors-02`, `mobile-03`.
- **Module slugs:** `booking`, `visitors`.
- **Depends on:** A30, A29 (calendar sync), A15.
- **Fixes:** double bookings, calendar sync drift, GDPR retention of visitor data.
- **Improves:** kiosk speed (target < 45 s sign-in), panel reliability.
- **Done when:** §18 and §19 items are merged.
- **Standing brief:** "No double bookings, no lost visitors, and visitor data deleted on schedule."

### A32 · Energy & sustainability

- **Mission:** energy and carbon that are measured, explained and reduced (§22).
- **Builds:** meters and readings, AMR and half-hourly imports, bill validation, anomaly detection (with A44), Scope 1–3 carbon with yearly conversion factors, SECR/ESOS packs, net-zero tracking, waste.
- **Screens:** `energy-01`, `energy-02`.
- **Module slug:** `energy`.
- **Depends on:** A10, A16.
- **Fixes:** unit and conversion errors, missing data gaps.
- **Improves:** import coverage, report packs.
- **Done when:** §22 Phase 3 items are merged.
- **Standing brief:** "Every carbon figure is reproducible from readings and the published conversion factors for that year."

### A33 · IoT & BMS

- **Mission:** sensors that turn into action automatically (§26).
- **Builds:** device registry, ingestion endpoint and time-series storage, alert rules to work orders, condition-based PPM triggers, legionella temperature logging, occupancy feeds; predictive maintenance (with A44).
- **Screens:** `iot-01`.
- **Module slug:** `iot`.
- **Depends on:** A10, A12, A04.
- **Fixes:** alert storms (de-duplication), ingestion lag.
- **Improves:** ingestion throughput, device health monitoring.
- **Done when:** §26 Phase 3 items are merged.
- **Standing brief:** "One alarm becomes one job, not fifty. Ingestion scales and never blocks the main API."

### A40 · Real estate & leases

- **Mission:** no missed critical date, ever (§27).
- **Builds:** property portfolio, leases (landlord and tenant), critical-date alerts, rent schedules, service charges, IFRS 16 / FRS 102 schedules, occupier portal.
- **Screens:** `leases-01`.
- **Module slug:** `real-estate`.
- **Depends on:** A10, A27.
- **Fixes:** date calculation errors (notice periods, working days), accounting schedule errors.
- **Improves:** lease abstraction from documents (with A44).
- **Done when:** §27 Phase 4 items are merged.
- **Standing brief:** "Critical dates are calculated exactly and alerted early. Accounting schedules reconcile."

### A41 · Capital planning & projects

- **Mission:** long-term investment decisions and well-run projects (§16, §17).
- **Builds:** backlog register, lifecycle forecast and funding scenarios, capital requests, projects with Gantt, budgets and change orders, CDM records, snagging, handover packs, defects liability.
- **Screens:** `capital-01`, `projects-01`.
- **Module slugs:** `capital`, `projects`.
- **Depends on:** A10, A27.
- **Fixes:** forecast double-counting, Gantt date errors.
- **Improves:** scenario comparison, board-pack export.
- **Done when:** §16 and §17 Phase 4 items are merged.
- **Standing brief:** "Forecasts are traceable to assets and surveys. Project costs reconcile with finance."

### A42 · Services & continuity

- **Mission:** soft services, fleet and emergencies handled in the same system (§23, §24, §31).
- **Builds:** cleaning specifications and audits (NSHC 2021), on-demand cleaning, guard tours, mail room, grounds, lost property; fleet with checks and reminders; business continuity plans and live incident mode.
- **Screens:** `soft-01`, `fleet-01`, `continuity-01`.
- **Module slugs:** `soft-services`, `fleet`, `continuity`.
- **Depends on:** A12, A15, A20.
- **Fixes:** audit scoring errors, missed reminders.
- **Improves:** incident-mode speed, audit mobile flow.
- **Done when:** §23, §24 and §31 Phase 4 items are merged.
- **Standing brief:** "Keep service operations simple to run, and incident mode fast and reliable under pressure."

### A43 · Sector packs

- **Mission:** the product feels made for each sector (§35).
- **Builds:**
  - housing: Awaab's Law cases, HHSRS, Decent Homes, voids, TSM reporting, resident portal
  - healthcare: HTMs, PAM, ERIC, Pseudomonas
  - education: GEMS, term-time scheduling, safeguarding
  - retail, commercial property and public sector packs.
- **Screens:** `housing-01`, `housing-02`, `healthcare-01`, `education-01`.
- **Module slug:** `sector-packs`.
- **Depends on:** A20, A11, A04.
- **Fixes:** statutory timescale errors (top priority), template inaccuracies (to D12 reviewer).
- **Improves:** pack onboarding (one-click enable), sector reports.
- **Done when:** §35 Phase 4 items are merged.
- **Standing brief:** "Statutory timescales are configurable, correct and clearly shown. Packs are templates on core modules, not forks."

### A44 · AI suite

- **Mission:** AI that saves real time and is always safe (§29).
- **Builds:**
  - certificate reading (Phase 2A), then triage, nameplate recognition, job summaries
  - Ask-the-estate with permission-aware retrieval, anomaly and predictive models
  - auto-schedule suggestions, repeat-failure insights, meter-photo checks, survey themes, invoice reading
  - AI credit metering.
- **Screens:** `ai-01`, `compliance-02`, `helpdesk-02`.
- **Owns:** `apps/api/src/modules/ai/**`, the AI gateway. **Module slug:** `ai`.
- **Depends on:** A03 (permissions), the module agents.
- **Fixes:**
  - answers that leak data the user can't see (top priority)
  - extraction errors (evaluation set)
  - cost spikes.
- **Improves:** accuracy on a fixed evaluation set, latency, cost per credit.
- **Done when:** §29 items for each phase are merged and evaluation scores meet targets.
- **Standing brief:** "Permission-aware, human-confirmed, measured against an evaluation set, within the credit budget."

### A50 · Subscriptions & billing

- **Mission:** charging customers correctly and simply (doc 07).
- **Builds:** Stripe products and prices, seat counting by licence type, add-ons, metered usage (AI, SMS, devices), VAT via Stripe Tax, dunning and read-only mode, trials, customer billing portal, migration of manually invoiced customers.
- **Screens:** `admin-12-subscription`, `marketing-01-pricing`.
- **Module slug:** `billing`.
- **Depends on:** A03 (entitlements), A07.
- **Fixes:** seat miscounts, webhook ordering issues, proration errors.
- **Improves:** upgrade prompts, revenue metrics accuracy.
- **Done when:** the Phase 5 billing items are merged and tested against Stripe test mode.
- **Standing brief:** "Never over- or under-charge. Entitlements stay the source of truth; Stripe follows."

### A51 · Marketing site & onboarding

- **Mission:** visitors become trial users, and trials become customers.
- **Builds:** marketing homepage in front of `/login`, product, pricing and comparison pages, sign-up and trial, onboarding wizard with industry templates, personal demo clone (with A06), cookie consent, SEO content structure.
- **Screens:** `marketing-01-pricing` (more to be designed once the product is named, D1).
- **Owns:** `apps/web/app/(marketing)/**`. **Module slug:** `marketing`.
- **Depends on:** A02, A06, A50.
- **Fixes:** broken sign-up steps, slow pages, consent issues.
- **Improves:** conversion (A/B structure), Core Web Vitals.
- **Done when:** the Phase 5 marketing and onboarding items are merged.
- **Standing brief:** "Fast, clear, honest pages; a sign-up that works first time; tracking only with consent."

### A52 · Platform administration

- **Mission:** run the business without ever seeing customer data uninvited (§34).
- **Builds:** tenants and plans, overrides, support-access requests (approved by the tenant), tenant health, revenue metrics, global template publishing, announcements, the customer support desk.
- **Screens:** `platform-01-tenants`.
- **Owns:** `apps/web/app/(platform)/**`, `apps/api/src/modules/platform/**`. **Module slug:** `platform-admin`.
- **Depends on:** A03, A50.
- **Fixes:** any path that exposes tenant data without a grant (top priority).
- **Improves:** health scoring, support tooling.
- **Done when:** basic admin in 2B, full in Phase 5.
- **Standing brief:** "Platform staff see tenant data only through an approved, time-limited, audited grant."

### A90 · QA & test health

- **Mission:** the default branch is always green and tests are trustworthy.
- **Each run:**
  - run the full suite on the default branch, including the critical journeys in doc 09
  - investigate failures and flaky tests, find the root cause, and open an issue with the owning agent, or fix the test harness itself
  - track coverage per module and the cross-tenant test coverage of every endpoint.
- **Owns:** shared test harness, `apps/web/e2e/_shared/**`, test reports. **Module slug:** `qa`.
- **Fixes:** test-infrastructure faults. Product bugs go to their owners.
- **Improves:** test speed, deterministic fixtures, journey coverage.
- **Standing brief:** "Find out why things fail, never hide failures. Route product bugs to their owning agent with a reproduction."

### A91 · Security

- **Mission:** stay ahead of the risks in doc 09.
- **Each run:**
  - review merged changes from the week for security issues (authZ, input handling, file handling, SSRF, secrets)
  - run dependency and static scans
  - threat-model newly enabled modules
  - check that RLS covers every new table.
- **Owns:** security tests, `SECURITY.md`, scanning config. **Module slug:** `security`.
- **Fixes:** security findings, as an issue with the owner and a private, minimal-detail description; urgent ones are flagged to the product owner.
- **Improves:** OWASP ASVS L2 coverage, pen-test readiness, Cyber Essentials evidence.
- **Standing brief:** "Assume breach. Verify isolation, permissions and input handling on everything that changed this week."

### A92 · Design fidelity & accessibility

- **Mission:** what we ship looks like the mockups and works for everyone.
- **Each run:**
  - screenshot built screens and compare them with the matching `design/mockups/png` image
  - run axe and keyboard checks
  - review new mockups proposed by other agents
  - sign off agents graduating to maintain.
- **Owns:** visual-regression baselines, accessibility reports. **Module slug:** `design-qa`.
- **Fixes:** issues to the owner with side-by-side images. Shared-component issues go to A05.
- **Improves:** baseline coverage across the screen catalogue.
- **Standing brief:** "Compare against the mockups, test with keyboard and screen reader, and report differences with images."

### A93 · Performance

- **Mission:** meet the doc 09 targets (p95 API < 300 ms reads, LCP < 2.5 s) at design scale.
- **Each run:**
  - run k6 and Lighthouse on the heaviest pages and endpoints
  - check slow-query logs and index coverage
  - test the largest-tenant scenario.
- **Owns:** load-test scripts, performance budgets. **Module slug:** `perf`.
- **Fixes:** regressions, as issues with owners; shared infrastructure fixes with A01.
- **Improves:** budgets in CI, query plans.
- **Standing brief:** "Measure first. Report regressions with numbers and the change that caused them."

### A94 · Docs & plan keeper

- **Mission:** the plan, designs and product tell the same story.
- **Each run:**
  - reconcile docs 01–14 against merged work (feature status, numbers, names, screen counts)
  - keep the feature catalogue's built/not-built status current
  - update the user guide and changelog
  - check links; regenerate the screen catalogue after design changes.
- **Owns:** `docs/plan/**` (except module agents' own §), user guide, changelog. **Module slug:** `docs`.
- **Fixes:** contradictions between docs, renders and code.
- **Improves:** user guide coverage, clarity.
- **Standing brief:** "One source of truth. When docs and reality differ, find out which is right and fix the other."

### A95 · Dependencies & maintenance

- **Mission:** a healthy, up-to-date codebase.
- **Each run:**
  - review dependency updates (keep versions pinned and at least two weeks old)
  - batch safe updates into one PR, with release notes summarised
  - review new dependencies other agents added
  - remove dead code and unused packages.
- **Owns:** lockfile maintenance PRs, Renovate config (with A01). **Module slug:** `maintenance`.
- **Fixes:** vulnerable or abandoned packages (with A91).
- **Improves:** install size, build time, licence compliance (no copyleft in the shipped product without review).
- **Standing brief:** "Small, safe, well-explained updates. Every dependency earns its place."

---

## 9. Measuring whether it works

| Measure | Target | Reviewed |
|---------|--------|----------|
| PRs merged per agent per week (build stage) | ≥ 2 | Fortnightly |
| PRs needing more than one round of changes | < 30% | Fortnightly |
| Default branch green | > 95% of the time | Weekly (A90) |
| Escaped bugs found after merge, per module | Falling | Monthly |
| Design fidelity sign-offs on schedule | All agents graduating | Per stage |
| Cost per merged PR | Tracked, falling | Fortnightly |

If an agent misses its targets for two reviews in a row, the product owner changes its brief, its cadence or its scope, or pauses it.
