# Build progress

The one page to read first in any new session, by any agent (Claude, Codex or other) or person. It says where the build is, what's next, and what's waiting on the product owner. Tick items off here in the same PR that finishes them.

**Last updated:** 21 Nov 2026, after PR #22 merged.

## Where we are

| | |
|---|---|
| **Current phase** | Phase 0 (Foundations) is **done**. Phase 1 hasn't started: wait for the product owner's go-ahead. |
| **Overall progress** | **About 6%** of the planned build (Phase 0 is about 4 of roughly 64 planned weeks; 15 of 83 roadmap items) |
| **Live demo** | https://cafm-production.up.railway.app: pick any demo account on the login page |
| **Next up** | Phase 1, starting with the location hierarchy and the asset register (doc 08) |

| Phase | Items done | Status |
|---|---|---|
| 0 · Foundations | 15 / 15 | Done (21 Nov 2026) |
| 1 · Core CAFM MVP | 0 / 13 | Not started |
| 2A · Comply | 0 / 12 | Not started |
| 2B · Commercial operations | 0 / 10 | Not started |
| 3 · Workplace and sustainability | 0 / 7 | Not started |
| 4 · Enterprise depth and sector packs | 0 / 14 | Not started |
| 5 · Commercialise and scale | 0 / 12 | Not started |

The percentage is weighted by each phase's planned length in doc 08, because the later items are much bigger than Phase 0's. Recalculate it when a phase finishes.

## Waiting on the product owner

These are decisions or paid resources, so agents don't do them:

- [ ] **Redis on Railway.** The background worker needs it, for emails and the nightly demo reset. Until it exists, the live demo doesn't send or capture email and doesn't reset overnight.
- [ ] **An email provider** (`SMTP_URL` on Railway). Until then, email is captured in the database, never sent.
- [ ] **Railway PR environments** (Project Settings › Environments). These give each PR a preview link. The app is ready for them; see `docs/deploy/railway.md`.
- [ ] **GitGuardian:** mark the flagged test passwords from PR #22 as test credentials. They're generated test fixtures, not real secrets.
- [ ] **The go-ahead for Phase 1.**

## How to use this page

- **Starting a session:** read this page, then `CLAUDE.md` (the rules), then the doc 08 section for the current phase. Run `source scripts/agent-setup.sh` to get a working database and demo data.
- **Picking work:** take the first unticked item in the current phase that nobody has claimed. GitHub issues labelled with the phase (`phase:1`, and so on) break each item into steps. Scheduled agents follow their own section in doc 13.
- **Finishing an item:** in the same PR, tick it here as `[x]`, add the PR link, and note anything partly done.
  - An item is only ticked when it meets the Definition of Done in doc 08: permission and entitlement checks, a cross-tenant test, tests, accessibility, audit, demo data, help text and the changelog.
  - Update the phase table and "Where we are".
- **Stopping mid-way:** leave a short note under "In progress", saying what's done, what's next and the branch name. The next session (yours or another agent's) carries on from it.
- **Changing scope:** doc 08 is the plan; this page tracks it. If an item is added, moved or split, change doc 08 first, then mirror it here.

## In progress

Nothing in progress. Phase 1 starts on the product owner's go-ahead.

## Phase checklists

### Phase 0 · Foundations

Done in PRs #3–#8, #22 and #23. Each item notes where it lives.

- [x] Monorepo (pnpm + Turborepo), lint/format, TypeScript strict, commit conventions. (`docs/contributing/commits.md`, plus the PR title check in CI)
- [x] Docker Compose local stack (Postgres, Redis, MinIO, Mailpit). (`docker-compose.yml`)
- [x] CI: typecheck, lint, unit, API, e2e (Playwright), build, container images; preview deploys. (`.github/workflows/`, `Dockerfile`)
  - The image is built in CI but not pushed to a registry yet.
  - Preview deploys are ready but need Railway PR environments turned on (see above).
- [x] Database: Prisma schema for platform + identity + config tables, RLS policies with transaction-local tenant context, separate DB roles, migration pipeline. (`packages/db`)
  - A test fails if any table with a `tenant_id` column lacks RLS.
- [x] Auth: global accounts + tenant memberships, login, logout, organisation picker, sessions, password reset, invite acceptance, terms acceptance, lockout, rate limiting, audit events. (`apps/api/src/modules/auth`, `people`)
- [x] Login page with demo credentials panel and autofill (gated by `DEMO_MODE`), demo guard rails (locked credentials, captured outbound email).
- [x] Tenancy: tenant resolution, tenant context middleware, platform-admin bootstrap CLI (create tenant, set plan/entitlements). (`withTenant`, `pnpm cafm`)
- [x] RBAC: permission registry, roles, scopes, API guards, `can()` helper in UI, no-privilege-escalation rule. (`packages/shared/src/permissions.ts`, `apps/api/src/core`)
- [x] Entitlements model and `feature()` gating, including plan limits on custom fields and full users. (`packages/shared/src/entitlements.ts`)
- [x] Config engine v1: field definitions + custom field storage/validation, numbering sequences, config versioning (every change stored as a version). (`packages/config-engine`, `/api/config`)
  - API only. The settings screens come with the Phase 1 admin console.
- [x] App shell: navigation, command palette, theming (light/dark), user menu, notifications bell, responsive layout, i18n framework (en-GB). (`apps/web/app/(app)/shell`)
- [x] Design system in code: icon sprite and the core components, matched against the screen catalogue. (`packages/ui`)
  - Uses the mockups' component stylesheet, not a Tailwind theme (ADR 0009).
  - Phase 0 built the components the shell and sign-in pages need. The rest of doc 11's components arrive with the screens that use them.
- [x] Audit log infrastructure; outbox + worker skeleton. (`apps/worker`)
- [x] Deterministic demo seed + nightly reset job. (`packages/db/src/seed.ts`, `demo-reset.ts`)
  - The reset runs once Redis exists on Railway.
- [x] ADRs 0001–0008 reviewed and confirmed (written during planning), plus ADR 0009. (`docs/adr/`)

**Done when** you can open the demo site, click "Super User" under demo accounts, sign in, see the app shell, and every API call is tenant-isolated and permission-checked, with automated tests proving it. **Met:** checked on the live demo on 21 Nov 2026. 121 unit and API tests and 59 e2e tests pass.

### Phase 1 · Core CAFM MVP

- [ ] Location hierarchy + site map; UK bank holiday calendars by nation; QR codes and label printing.
- [ ] Asset register, classes and attributes, "serves" relationships, tags, meters, warranties, attachments.
- [ ] Helpdesk: request catalogue, priority matrix, triage, portal, QR reporting, email-to-ticket (inbound mailboxes), queue, duplicate detection, CSAT.
- [ ] Reactive work orders: lifecycle, assignment (including contractors by magic link), SLA clocks and escalation, labour/parts/costs, checklists, photos, signatures, job-sheet PDFs.
- [ ] PPM: task library, schedules (calendar + meter), generator, 52-week planner, compliance KPI.
- [ ] Mobile PWA for technicians (offline work packs, mutation queue sync, checklists, photos, signatures, scan) with OAuth tokens.
- [ ] Notifications (in-app, email, push) with templates.
- [ ] List views: filters, saved views, bulk actions, kanban and calendar views.
- [ ] Super User admin console v1: users and invites, username-only accounts, roles matrix, teams, scopes, delegated admin, impersonation, modules on/off, terminology, branding (logo/colours), custom fields, statuses, SLA/calendars, categories, password policy, MFA enforcement, session timeout, audit log viewer.
- [ ] Standard reports + role default dashboards (fixed widgets).
- [ ] Import/export for locations, assets, users, PPM schedules.
- [ ] MFA (TOTP).
- [ ] First design-partner tenants live, invoiced manually.

### Phase 2A · Comply

- [ ] Statutory compliance register, jurisdiction-aware UK templates, certificates, remedial actions, compliance matrix.
- [ ] Inspections/audits builder, building rounds with checkpoints.
- [ ] Contractor management, accreditations/insurance, auto-suspension, **contractor portal**, quotes/RFQ, contractor site sign-in.
- [ ] **Permit to Work and RAMS** (moved forward from Phase 4: contractor work needs them).
- [ ] Documents module (versions, expiry, previews, external sharing).
- [ ] Workflow builder UI + automation rules + approvals engine; form designer.
- [ ] Config history UI with diff and rollback; config export/import.
- [ ] Data retention policies, legal hold, DSAR export/erasure tools.
- [ ] Public REST API v1 + API keys + webhooks.
- [ ] Passkeys (WebAuthn); SMS notifications; Teams/Slack notifications.
- [ ] AI certificate reading (early AI feature, because it directly supports compliance).
- [ ] **Cyber Essentials** certification.

### Phase 2B · Commercial Operations

- [ ] Contracts, SLAs, KPIs, performance deductions; schedule of rates.
- [ ] Scheduling & dispatch board, skills/qualifications, shifts/leave/on-call, timesheets.
- [ ] Inventory & stores, van stock, tools and test-equipment calibration.
- [ ] Procurement (requisition → PO → receipt → invoice match).
- [ ] Finance: cost centres, budgets, quotes (with magic-link approval), job costing; Xero/QuickBooks/Sage connectors.
- [ ] Keys register.
- [ ] Configurable dashboards.
- [ ] Communications: broadcast messages, announcements, knowledge base, surveys.
- [ ] Requester appointment self-booking.
- [ ] Basic platform admin UI (tenants, plans, overrides, support-access grants).

### Phase 3 · Workplace & Sustainability

- [ ] Floor plans (DWG/DXF/PDF → SVG; IFC viewer), space inventory, allocation, chargeback, occupancy analytics, stacking/blocking and scenarios, wayfinding.
- [ ] Room/desk/resource booking + Microsoft 365/Google calendar sync + check-in + room panels.
- [ ] Visitor management + kiosk + evacuation roll-call.
- [ ] Moves (MAC).
- [ ] Planned outage management (uses floor plans and "serves" relationships).
- [ ] Energy & sustainability: meters, readings, bills, AMR import, carbon (Scope 1–2–3), SECR/ESOS packs, waste.
- [ ] IoT ingestion, device registry, alert rules → auto work orders, condition-based PPM.

### Phase 4 · Enterprise Depth & Sector Packs

- [ ] Real estate & leases, critical dates, service charges, IFRS 16 outputs.
- [ ] Condition surveys → backlog → capital planning & lifecycle forecasting.
- [ ] Asset depth: depreciation and valuation, FMEA/RCM library, BIM/COBie import.
- [ ] Route optimisation for dispatch; punch-out catalogues and framework call-offs in procurement; CIS domestic reverse charge in client billing.
- [ ] Projects & minor works (Gantt, CDM, snagging, defects liability, handover/COBie).
- [ ] Health & safety: incidents, RIDDOR, investigations, CAPA, risk register, LOTO, lone worker, insurance claims.
- [ ] Soft services: cleaning specs & audits (NSHC 2021), on-demand cleaning, guard tours, mail room, grounds, lost property.
- [ ] Fleet; business continuity.
- [ ] **Sector packs**: housing (Awaab's Law, HHSRS, Decent Homes, voids, TSMs, resident portal), healthcare (HTM, PAM, ERIC), education (GEMS, MAT reporting), retail, commercial property, public sector.
- [ ] **AI suite**: triage, nameplate recognition, job summaries, Ask-the-estate, anomaly detection, predictive maintenance, invoice OCR, auto-schedule suggestions, repeat-failure insights, meter-photo checks, survey comment themes.
- [ ] Report builder + scheduled report packs; BI connector.
- [ ] Multi-client FM-provider edition: client dimension, client portal, per-client branding, client billing, contract profitability.
- [ ] Building Safety Act golden thread.
- [ ] **Cyber Essentials Plus**; first CREST penetration test before the first enterprise go-live.

### Phase 5 · Commercialise & Scale (starts during Phase 4)

- [ ] **Stripe billing** live: plans, seats, add-ons, metered usage, VAT, dunning, customer billing portal; migrate manually invoiced customers.
- [ ] **Marketing site expansion**: build on the public homepage and demo CTA with product pages, pricing, sign-up, blog/SEO, comparison pages and cookie consent (PECR).
- [ ] Self-serve sign-up, trial, onboarding wizard, industry template packs, personal demo clone.
- [ ] Platform admin console complete: health, revenue metrics, global template publishing, announcements.
- [ ] Customer support desk: in-app help widget/chat, help centre, feature-request voting.
- [ ] SSO (SAML/OIDC), SCIM, IP allow-lists, custom domains, white-label, sandbox + config promotion, data residency (UK/EU).
- [ ] Native mobile apps (Expo) to App Store / Play Store; remote assist video.
- [ ] Integration marketplace, Zapier/Make/Power Automate connectors; contractor marketplace beta.
- [ ] Enterprise connectors: SAP, Oracle, Dynamics 365, HR systems, access control, Autodesk (CAD/BIM), CTI telephony.
- [ ] Digital twin view; cross-tenant benchmarking (opt-in).
- [ ] Welsh-language interface (first additional language).
- [ ] **ISO 27001** certification (ISMS started in Phase 3); G-Cloud listing.

### Every phase

The cross-cutting work in doc 08 (accessibility audit, performance and security review, docs, demo data) is part of each item's Definition of Done, not a separate tick.
