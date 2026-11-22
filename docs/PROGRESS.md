# Build progress

The one page to read first in any new session, by any agent (Claude, Codex or other) or person. It says where the build is, what's next, and what's waiting on the product owner. Tick items off here in the same PR that finishes them.

**Last updated:** 22 Nov 2026, with asset "serves" relationships (P1-02c) built.

## Where we are

| | |
|---|---|
| **Current phase** | Phase 1 (Core CAFM MVP) is under way. Phase 0 (Foundations) is **done**. |
| **Overall progress** | **About 7%** of the planned build (16 of 83 top-level roadmap items) |
| **Live demo** | https://cafm-production.up.railway.app: pick any demo account on the login page |
| **Approved to build** | Phase 1, with the product owner's go-ahead |
| **Next up** | Phase 1 asset register (P1-02) |

<!-- approved-phase: 1 -->

| Phase | Items done | Status |
|---|---|---|
| 0 · Foundations | 15 / 15 | Done (21 Nov 2026) |
| 1 · Core CAFM MVP | 1 / 13 | In progress |
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

## How to use this page

The full rules are in [AGENTS.md § Progress rules](../AGENTS.md#3-progress-rules-mandatory-checked-by-ci). CI checks them on every PR. In short:

- **Start of session:** read this page and run `pnpm progress`. It lists the next unclaimed items in the approved phase.
- **Before you build:** claim the item. Open a draft PR with `Progress: P1-02 in progress` and add a row to "In progress" below.
- **When it's done:** in that PR, tick it `[x]`, remove its row, update the phase table and the percentage, and write `Progress: P1-02 done`. `node scripts/progress.mjs check` gives the right numbers.
- **Stopping part-way:** update the row's "Next step" so anyone can carry on.
- **Big items:** track acceptance in indented sub-items. Owner-approved capability batches can finish related sub-items together.
- **Changing scope:** change doc 08 first, then mirror it here.

## In progress

Claim an item here before you start, in a draft PR you open straight away (see AGENTS.md § Progress rules). Remove the row when the item is ticked.

| Item | Who | Branch | Started | Next step |
|---|---|---|---|---|
| P1-02 | Claude | `claude/trusting-carson-1nifqf` | 2026-11-22 | P1-02d: tags (QR, barcode, NFC), label printing and stable scan links, following the Locations QR labels (`apps/web/app/(app)/app/locations/labels`, `location-qr`). Then meters (e), warranties (f), attachments (g). |

## Phase checklists

### Phase 0 · Foundations

Done in PRs #3–#8, #22 and #23. Each item notes where it lives.

- [x] **P0-01** Monorepo (pnpm + Turborepo), lint/format, TypeScript strict, commit conventions. (`docs/contributing/commits.md`, plus the PR title check in CI)
- [x] **P0-02** Docker Compose local stack (Postgres, Redis, MinIO, Mailpit). (`docker-compose.yml`)
- [x] **P0-03** CI: typecheck, lint, unit, API, e2e (Playwright), build, container images; preview deploys. (`.github/workflows/`, `Dockerfile`)
  - The image is built in CI but not pushed to a registry yet.
  - Preview deploys are ready but need Railway PR environments turned on (see above).
- [x] **P0-04** Database: Prisma schema for platform + identity + config tables, RLS policies with transaction-local tenant context, separate DB roles, migration pipeline. (`packages/db`)
  - A test fails if any table with a `tenant_id` column lacks RLS.
- [x] **P0-05** Auth: global accounts + tenant memberships, login, logout, organisation picker, sessions, password reset, invite acceptance, terms acceptance, lockout, rate limiting, audit events. (`apps/api/src/modules/auth`, `people`)
- [x] **P0-06** Login page with demo credentials panel and autofill (gated by `DEMO_MODE`), demo guard rails (locked credentials, captured outbound email).
- [x] **P0-07** Tenancy: tenant resolution, tenant context middleware, platform-admin bootstrap CLI (create tenant, set plan/entitlements). (`withTenant`, `pnpm cafm`)
- [x] **P0-08** RBAC: permission registry, roles, scopes, API guards, `can()` helper in UI, no-privilege-escalation rule. (`packages/shared/src/permissions.ts`, `apps/api/src/core`)
- [x] **P0-09** Entitlements model and `feature()` gating, including plan limits on custom fields and full users. (`packages/shared/src/entitlements.ts`)
- [x] **P0-10** Config engine v1: field definitions + custom field storage/validation, numbering sequences, config versioning (every change stored as a version). (`packages/config-engine`, `/api/config`)
  - API only. The settings screens come with the Phase 1 admin console.
- [x] **P0-11** App shell: navigation, command palette, theming (light/dark), user menu, notifications bell, responsive layout, i18n framework (en-GB). (`apps/web/app/(app)/shell`)
- [x] **P0-12** Design system in code: icon sprite and the core components, matched against the screen catalogue. (`packages/ui`)
  - Uses the mockups' component stylesheet, not a Tailwind theme (ADR 0009).
  - Phase 0 built the components the shell and sign-in pages need. The rest of doc 11's components arrive with the screens that use them.
- [x] **P0-13** Audit log infrastructure; outbox + worker skeleton. (`apps/worker`)
- [x] **P0-14** Deterministic demo seed + nightly reset job. (`packages/db/src/seed.ts`, `demo-reset.ts`)
  - The reset runs once Redis exists on Railway.
- [x] **P0-15** ADRs 0001–0008 reviewed and confirmed (written during planning), plus ADR 0009. (`docs/adr/`)

**Done when** you can open the demo site, click "Super User" under demo accounts, sign in, see the app shell, and every API call is tenant-isolated and permission-checked, with automated tests proving it. **Met:** checked on the live demo on 21 Nov 2026. 121 unit and API tests and 59 e2e tests pass.

### Phase 1 · Core CAFM MVP

- [x] **P1-01** Location hierarchy + site map; UK bank holiday calendars by nation; QR codes and label printing.
  - [x] **P1-01a** Tenant-scoped location hierarchy, site access rules and API. ([API guide](locations.md))
  - [x] **P1-01b** Searchable hierarchy and site detail, with site management in the app shell.
  - [x] **P1-01c** Site business hours, jurisdiction, UK bank holidays and custom closures for SLA clocks.
  - [x] **P1-01d** Portfolio map and accessible site list with filters.
  - [x] **P1-01e** Location QR labels, printing and stable links for Helpdesk fault intake (P1-03).
- [ ] **P1-02** Asset register, classes and attributes, "serves" relationships, tags, meters, warranties, attachments.
  - [x] **P1-02a** Asset classes with attribute templates, and the tenant-scoped asset hierarchy and API (location link, parent and child, plan limit, custom fields, audit). ([guide](assets.md))
  - [x] **P1-02b** Asset register and asset detail screens in the app shell (`assets-01-register`, `assets-02-detail`). ([guide](assets.md))
  - [x] **P1-02c** "Serves" relationships: the spaces and assets an asset serves, and impact lookup. ([guide](assets.md))
  - [ ] **P1-02d** Tags (QR, barcode, NFC), label printing and stable scan links for Helpdesk (P1-03).
  - [ ] **P1-02e** Meters and readings, with rollover handling.
  - [ ] **P1-02f** Warranties with expiry alerts.
  - [ ] **P1-02g** Attachments (photos and documents) on assets.
- [ ] **P1-03** Helpdesk: request catalogue, priority matrix, triage, portal, QR reporting, email-to-ticket (inbound mailboxes), queue, duplicate detection, CSAT.
- [ ] **P1-04** Reactive work orders: lifecycle, assignment (including contractors by magic link), SLA clocks and escalation, labour/parts/costs, checklists, photos, signatures, job-sheet PDFs.
- [ ] **P1-05** PPM: task library, schedules (calendar + meter), generator, 52-week planner, compliance KPI.
- [ ] **P1-06** Mobile PWA for technicians (offline work packs, mutation queue sync, checklists, photos, signatures, scan) with OAuth tokens.
- [ ] **P1-07** Notifications (in-app, email, push) with templates.
- [ ] **P1-08** List views: filters, saved views, bulk actions, kanban and calendar views.
- [ ] **P1-09** Super User admin console v1: users and invites, username-only accounts, roles matrix, teams, scopes, delegated admin, impersonation, modules on/off, terminology, branding (logo/colours), custom fields, statuses, SLA/calendars, categories, password policy, MFA enforcement, session timeout, audit log viewer.
- [ ] **P1-10** Standard reports + role default dashboards (fixed widgets).
- [ ] **P1-11** Import/export for locations, assets, users, PPM schedules.
- [ ] **P1-12** MFA (TOTP).
- [ ] **P1-13** First design-partner tenants live, invoiced manually.

### Phase 2A · Comply

- [ ] **P2A-01** Statutory compliance register, jurisdiction-aware UK templates, certificates, remedial actions, compliance matrix.
- [ ] **P2A-02** Inspections/audits builder, building rounds with checkpoints.
- [ ] **P2A-03** Contractor management, accreditations/insurance, auto-suspension, **contractor portal**, quotes/RFQ, contractor site sign-in.
- [ ] **P2A-04** **Permit to Work and RAMS** (moved forward from Phase 4: contractor work needs them).
- [ ] **P2A-05** Documents module (versions, expiry, previews, external sharing).
- [ ] **P2A-06** Workflow builder UI + automation rules + approvals engine; form designer.
- [ ] **P2A-07** Config history UI with diff and rollback; config export/import.
- [ ] **P2A-08** Data retention policies, legal hold, DSAR export/erasure tools.
- [ ] **P2A-09** Public REST API v1 + API keys + webhooks.
- [ ] **P2A-10** Passkeys (WebAuthn); SMS notifications; Teams/Slack notifications.
- [ ] **P2A-11** AI certificate reading (early AI feature, because it directly supports compliance).
- [ ] **P2A-12** **Cyber Essentials** certification.

### Phase 2B · Commercial Operations

- [ ] **P2B-01** Contracts, SLAs, KPIs, performance deductions; schedule of rates.
- [ ] **P2B-02** Scheduling & dispatch board, skills/qualifications, shifts/leave/on-call, timesheets.
- [ ] **P2B-03** Inventory & stores, van stock, tools and test-equipment calibration.
- [ ] **P2B-04** Procurement (requisition → PO → receipt → invoice match).
- [ ] **P2B-05** Finance: cost centres, budgets, quotes (with magic-link approval), job costing; Xero/QuickBooks/Sage connectors.
- [ ] **P2B-06** Keys register.
- [ ] **P2B-07** Configurable dashboards.
- [ ] **P2B-08** Communications: broadcast messages, announcements, knowledge base, surveys.
- [ ] **P2B-09** Requester appointment self-booking.
- [ ] **P2B-10** Basic platform admin UI (tenants, plans, overrides, support-access grants).

### Phase 3 · Workplace & Sustainability

- [ ] **P3-01** Floor plans (DWG/DXF/PDF → SVG; IFC viewer), space inventory, allocation, chargeback, occupancy analytics, stacking/blocking and scenarios, wayfinding.
- [ ] **P3-02** Room/desk/resource booking + Microsoft 365/Google calendar sync + check-in + room panels.
- [ ] **P3-03** Visitor management + kiosk + evacuation roll-call.
- [ ] **P3-04** Moves (MAC).
- [ ] **P3-05** Planned outage management (uses floor plans and "serves" relationships).
- [ ] **P3-06** Energy & sustainability: meters, readings, bills, AMR import, carbon (Scope 1–2–3), SECR/ESOS packs, waste.
- [ ] **P3-07** IoT ingestion, device registry, alert rules → auto work orders, condition-based PPM.

### Phase 4 · Enterprise Depth & Sector Packs

- [ ] **P4-01** Real estate & leases, critical dates, service charges, IFRS 16 outputs.
- [ ] **P4-02** Condition surveys → backlog → capital planning & lifecycle forecasting.
- [ ] **P4-03** Asset depth: depreciation and valuation, FMEA/RCM library, BIM/COBie import.
- [ ] **P4-04** Route optimisation for dispatch; punch-out catalogues and framework call-offs in procurement; CIS domestic reverse charge in client billing.
- [ ] **P4-05** Projects & minor works (Gantt, CDM, snagging, defects liability, handover/COBie).
- [ ] **P4-06** Health & safety: incidents, RIDDOR, investigations, CAPA, risk register, LOTO, lone worker, insurance claims.
- [ ] **P4-07** Soft services: cleaning specs & audits (NSHC 2021), on-demand cleaning, guard tours, mail room, grounds, lost property.
- [ ] **P4-08** Fleet; business continuity.
- [ ] **P4-09** **Sector packs**: housing (Awaab's Law, HHSRS, Decent Homes, voids, TSMs, resident portal), healthcare (HTM, PAM, ERIC), education (GEMS, MAT reporting), retail, commercial property, public sector.
- [ ] **P4-10** **AI suite**: triage, nameplate recognition, job summaries, Ask-the-estate, anomaly detection, predictive maintenance, invoice OCR, auto-schedule suggestions, repeat-failure insights, meter-photo checks, survey comment themes.
- [ ] **P4-11** Report builder + scheduled report packs; BI connector.
- [ ] **P4-12** Multi-client FM-provider edition: client dimension, client portal, per-client branding, client billing, contract profitability.
- [ ] **P4-13** Building Safety Act golden thread.
- [ ] **P4-14** **Cyber Essentials Plus**; first CREST penetration test before the first enterprise go-live.

### Phase 5 · Commercialise & Scale (starts during Phase 4)

- [ ] **P5-01** **Stripe billing** live: plans, seats, add-ons, metered usage, VAT, dunning, customer billing portal; migrate manually invoiced customers.
- [ ] **P5-02** **Marketing site expansion**: build on the public homepage and demo CTA with product pages, pricing, sign-up, blog/SEO, comparison pages and cookie consent (PECR).
- [ ] **P5-03** Self-serve sign-up, trial, onboarding wizard, industry template packs, personal demo clone.
- [ ] **P5-04** Platform admin console complete: health, revenue metrics, global template publishing, announcements.
- [ ] **P5-05** Customer support desk: in-app help widget/chat, help centre, feature-request voting.
- [ ] **P5-06** SSO (SAML/OIDC), SCIM, IP allow-lists, custom domains, white-label, sandbox + config promotion, data residency (UK/EU).
- [ ] **P5-07** Native mobile apps (Expo) to App Store / Play Store; remote assist video.
- [ ] **P5-08** Integration marketplace, Zapier/Make/Power Automate connectors; contractor marketplace beta.
- [ ] **P5-09** Enterprise connectors: SAP, Oracle, Dynamics 365, HR systems, access control, Autodesk (CAD/BIM), CTI telephony.
- [ ] **P5-10** Digital twin view; cross-tenant benchmarking (opt-in).
- [ ] **P5-11** Welsh-language interface (first additional language).
- [ ] **P5-12** **ISO 27001** certification (ISMS started in Phase 3); G-Cloud listing.

### Every phase

The cross-cutting work in doc 08 (accessibility audit, performance and security review, docs, demo data) is part of each item's Definition of Done, not a separate tick.
