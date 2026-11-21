# 08 · Delivery Roadmap

Seven phases (Phase 2 is split into 2A and 2B). Each ends with a deployable, demo-able increment on the demo environment, with the demo seed data extended to show the new modules. Durations are indicative for a small team assisted by AI, and are re-estimated at the start of each phase.

**Indicative total: about 14–17 months** to deliver the full feature catalogue. The product becomes sellable to pilot customers at the end of Phase 1 (about month 3), and commercially strong for mid-market at the end of Phase 2B (about month 7).

| Phase | Weeks | Cumulative (approx.) |
|-------|-------|----------------------|
| 0 Foundations | 4 | Month 1 |
| 1 Core CAFM MVP | 8–10 | Month 3 |
| 2A Comply | 8 | Month 5 |
| 2B Commercial operations | 8–10 | Month 7 |
| 3 Workplace & sustainability | 10 | Month 9–10 |
| 4 Enterprise depth & sectors | 12–14 | Month 13 |
| 5 Commercialise & scale | 10–12 (starts during Phase 4) | Month 14–17 |

## Phase 0 · Foundations

**Goal:** a working, secure skeleton. The login page with demo credentials lands on an (empty-ish) app shell.

- Monorepo (pnpm + Turborepo), lint/format, TypeScript strict, commit conventions.
- Docker Compose local stack (Postgres, Redis, MinIO, Mailpit).
- CI: typecheck, lint, unit, API, e2e (Playwright), build, container images; preview deploys.
- Database: Prisma schema for platform + identity + config tables, **RLS policies** with transaction-local tenant context, separate DB roles, migration pipeline.
- **Auth**: global accounts + tenant memberships, login, logout, organisation picker, sessions, password reset, invite acceptance, terms acceptance, lockout, rate limiting, audit events.
- **Login page with demo credentials panel and autofill** (gated by `DEMO_MODE`), demo guard rails (locked credentials, captured outbound email).
- Tenancy: tenant resolution, tenant context middleware, platform-admin bootstrap CLI (create tenant, set plan/entitlements).
- RBAC: permission registry, roles, scopes, API guards, `can()` helper in UI, no-privilege-escalation rule.
- **Entitlements** model and `feature()` gating.
- Config engine v1: field definitions + custom field storage/validation, numbering sequences, config versioning (every change stored as a version).
- App shell: navigation, command palette, theming (light/dark), user menu, notifications bell, responsive layout, i18n framework (en-GB).
- Design system in code: Tailwind theme generated from `design/tokens/tokens.json`, icon sprite, and the core components from [doc 11](11-design-system.md), matched against the [screen catalogue](12-screen-catalogue.md).
- Audit log infrastructure; outbox + worker skeleton.
- Deterministic demo seed + nightly reset job.
- ADRs 0001–0008 reviewed and confirmed (written during planning).

**Done when:** you can open the demo site, click "Super User" under demo accounts, sign in, see the app shell, and every API call is tenant-isolated and permission-checked (automated tests prove it).

## Phase 1 · Core CAFM MVP

- Location hierarchy + site map; UK bank holiday calendars by nation; QR codes and label printing.
- Asset register, classes and attributes, "serves" relationships, tags, meters, warranties, attachments.
- Helpdesk: request catalogue, priority matrix, triage, portal, QR reporting, email-to-ticket (inbound mailboxes), queue, duplicate detection, CSAT.
- Reactive work orders: lifecycle, assignment (including contractors by magic link), SLA clocks and escalation, labour/parts/costs, checklists, photos, signatures, job-sheet PDFs.
- PPM: task library, schedules (calendar + meter), generator, 52-week planner, compliance KPI.
- Mobile PWA for technicians (offline work packs, mutation queue sync, checklists, photos, signatures, scan) with OAuth tokens.
- Notifications (in-app, email, push) with templates.
- List views: filters, saved views, bulk actions, kanban and calendar views.
- Super User admin console v1: users and invites, username-only accounts, roles matrix, teams, scopes, delegated admin, impersonation, modules on/off, terminology, branding (logo/colours), custom fields, statuses, SLA/calendars, categories, password policy, MFA enforcement, session timeout, audit log viewer.
- Standard reports + role default dashboards (fixed widgets).
- Import/export for locations, assets, users, PPM schedules.
- MFA (TOTP).
- First design-partner tenants live, invoiced manually.

**Done when:** a pilot customer could run day-to-day reactive and planned maintenance end to end.

## Phase 2A · Comply

- Statutory compliance register, jurisdiction-aware UK templates, certificates, remedial actions, compliance matrix.
- Inspections/audits builder, building rounds with checkpoints.
- Contractor management, accreditations/insurance, auto-suspension, **contractor portal**, quotes/RFQ, contractor site sign-in.
- **Permit to Work and RAMS** (moved forward from Phase 4: contractor work needs them).
- Documents module (versions, expiry, previews, external sharing).
- Workflow builder UI + automation rules + approvals engine; form designer.
- Config history UI with diff and rollback; config export/import.
- Data retention policies, legal hold, DSAR export/erasure tools.
- Public REST API v1 + API keys + webhooks.
- Passkeys (WebAuthn); SMS notifications; Teams/Slack notifications.
- AI certificate reading (early AI feature, because it directly supports compliance).
- **Cyber Essentials** certification.

## Phase 2B · Commercial Operations

- Contracts, SLAs, KPIs, performance deductions; schedule of rates.
- Scheduling & dispatch board, skills/qualifications, shifts/leave/on-call, timesheets.
- Inventory & stores, van stock, tools and test-equipment calibration.
- Procurement (requisition → PO → receipt → invoice match).
- Finance: cost centres, budgets, quotes (with magic-link approval), job costing; Xero/QuickBooks/Sage connectors.
- Keys register.
- Configurable dashboards.
- Communications: broadcast messages, announcements, knowledge base, surveys.
- Requester appointment self-booking.
- Basic platform admin UI (tenants, plans, overrides, support-access grants).

## Phase 3 · Workplace & Sustainability

- Floor plans (DWG/DXF/PDF → SVG; IFC viewer), space inventory, allocation, chargeback, occupancy analytics, stacking/blocking and scenarios, wayfinding.
- Room/desk/resource booking + Microsoft 365/Google calendar sync + check-in + room panels.
- Visitor management + kiosk + evacuation roll-call.
- Moves (MAC).
- Planned outage management (uses floor plans and "serves" relationships).
- Energy & sustainability: meters, readings, bills, AMR import, carbon (Scope 1–2–3), SECR/ESOS packs, waste.
- IoT ingestion, device registry, alert rules → auto work orders, condition-based PPM.

## Phase 4 · Enterprise Depth & Sector Packs

- Real estate & leases, critical dates, service charges, IFRS 16 outputs.
- Condition surveys → backlog → capital planning & lifecycle forecasting.
- Asset depth: depreciation and valuation, FMEA/RCM library, BIM/COBie import.
- Route optimisation for dispatch; punch-out catalogues and framework call-offs in procurement; CIS domestic reverse charge in client billing.
- Projects & minor works (Gantt, CDM, snagging, defects liability, handover/COBie).
- Health & safety: incidents, RIDDOR, investigations, CAPA, risk register, LOTO, lone worker, insurance claims.
- Soft services: cleaning specs & audits (NSHC 2021), on-demand cleaning, guard tours, mail room, grounds, lost property.
- Fleet; business continuity.
- **Sector packs**: housing (Awaab's Law, HHSRS, Decent Homes, voids, TSMs, resident portal), healthcare (HTM, PAM, ERIC), education (GEMS, MAT reporting), retail, commercial property, public sector.
- **AI suite**: triage, nameplate recognition, job summaries, Ask-the-estate, anomaly detection, predictive maintenance, invoice OCR, auto-schedule suggestions, repeat-failure insights, meter-photo checks, survey comment themes.
- Report builder + scheduled report packs; BI connector.
- Multi-client FM-provider edition: client dimension, client portal, per-client branding, client billing, contract profitability.
- Building Safety Act golden thread.
- **Cyber Essentials Plus**; first CREST penetration test before the first enterprise go-live.

## Phase 5 · Commercialise & Scale (starts during Phase 4)

- **Stripe billing** live: plans, seats, add-ons, metered usage, VAT, dunning, customer billing portal; migrate manually invoiced customers.
- **Marketing site expansion**: build on the public homepage and demo CTA with product pages, pricing, sign-up, blog/SEO, comparison pages and cookie consent (PECR).
- Self-serve sign-up, trial, onboarding wizard, industry template packs, personal demo clone.
- Platform admin console complete: health, revenue metrics, global template publishing, announcements.
- Customer support desk: in-app help widget/chat, help centre, feature-request voting.
- SSO (SAML/OIDC), SCIM, IP allow-lists, custom domains, white-label, sandbox + config promotion, data residency (UK/EU).
- Native mobile apps (Expo) to App Store / Play Store; remote assist video.
- Integration marketplace, Zapier/Make/Power Automate connectors; contractor marketplace beta.
- Enterprise connectors: SAP, Oracle, Dynamics 365, HR systems, access control, Autodesk (CAD/BIM), CTI telephony.
- Digital twin view; cross-tenant benchmarking (opt-in).
- Welsh-language interface (first additional language).
- **ISO 27001** certification (ISMS started in Phase 3); G-Cloud listing.

## Cross-cutting, every phase

- Accessibility audit of new screens (axe + manual).
- Performance budget checks; load test of new heavy endpoints.
- Security review of new modules (threat model, authZ and cross-tenant tests).
- Docs: user guide pages, API reference, changelog.
- Demo seed updated so every new feature has realistic demo data.
- Feature catalogue ([02](02-feature-catalogue.md)) ticked off as features ship. **Every catalogue feature must map to a phase above.** When a feature is added to the catalogue, add it here too.

## Definition of Done (per feature)

1. Meets acceptance criteria; behind correct permission and entitlement checks.
2. Tenant isolation verified by automated test.
3. Unit + API tests; e2e test for the primary journey.
4. Responsive and keyboard accessible; no axe violations.
5. Audit events emitted; custom fields/workflow supported where the entity is configurable.
6. Import/export and API coverage where applicable.
7. Demo data added; help text written; changelog entry.

## Working method

- Each phase is broken into GitHub issues (epics per module, stories per feature) generated from the feature catalogue, each linking to its screens in the screen catalogue.
- Short iterations; each merged PR deploys to staging; demo environment updated at the end of each iteration.
- Product owner reviews on the demo site at each iteration boundary.
- Build work is carried out by scheduled agents, one per element, as described in [doc 13](13-agent-schedules.md). The roadmap phase decides which agents are active.
