# 08 · Delivery Roadmap

Six phases. Each ends with a deployable, demo-able increment on the demo environment, with the demo seed data extended to show the new modules. Durations are indicative for a small team assisted by AI, and are re-estimated at the start of each phase.

## Phase 0 · Foundations (≈ 3–4 weeks)

**Goal:** a working, secure skeleton: the login page with demo credentials, landing on an (empty-ish) app shell.

- Monorepo (pnpm + Turborepo), lint/format, TypeScript strict, commit conventions.
- Docker Compose local stack (Postgres, Redis, MinIO, Mailpit).
- CI: typecheck, lint, unit, API, e2e (Playwright), build, container images; preview deploys.
- Database: Prisma schema for platform + identity + config tables, **RLS policies**, migration pipeline.
- **Auth**: login, logout, sessions, password reset, invite acceptance, lockout, rate limiting, audit events.
- **Login page with demo credentials panel and autofill** (gated by `DEMO_MODE`).
- Tenancy: tenant resolution, tenant context middleware, platform-admin bootstrap CLI.
- RBAC: permission registry, roles, scopes, API guards, `can()` helper in UI.
- **Entitlements** model and `feature()` gating.
- Config engine v1: field definitions + custom field storage/validation, numbering sequences.
- App shell: navigation, command palette, theming (light/dark), user menu, notifications bell, responsive layout, design tokens + core components.
- Audit log infrastructure; outbox + worker skeleton.
- Deterministic demo seed + nightly reset job.
- ADRs 1–6 written.

**Done when:** you can open the demo site, click "Super User" under demo accounts, sign in, see the app shell, and every API call is tenant-isolated and permission-checked (tests prove it).

## Phase 1 · Core CAFM MVP (≈ 8–10 weeks)

- Location hierarchy + site map; QR codes.
- Asset register, classes and attributes, tags, meters, warranties, documents.
- Helpdesk: request catalogue, priority matrix, portal, QR reporting, email-to-ticket, queue.
- Reactive work orders: lifecycle, assignment, SLA clocks and escalation, labour/parts/costs, checklists, photos, signatures, job-sheet PDFs.
- PPM: task library, schedules (calendar + meter), generator, 52-week planner, compliance KPI.
- Mobile PWA for technicians (offline my-jobs, checklists, photos, signatures, scan).
- Notifications (in-app, email, push) with templates.
- Super User admin console v1: users, invites, roles matrix, teams, scopes, modules on/off, terminology, branding (logo/colours), custom fields, statuses, SLA/calendars, categories.
- Standard reports + role default dashboards (fixed widgets).
- Import/export for locations, assets, users.
- MFA (TOTP).

**Done when:** a pilot customer could run day-to-day reactive and planned maintenance end to end.

## Phase 2 · Operate & Comply (≈ 10–12 weeks)

- Statutory compliance register, UK templates, certificates, remedial actions, compliance matrix, inspections/audits builder.
- Contractor management, accreditations/insurance, **contractor portal**, quotes/RFQ.
- Contracts, SLAs, KPIs, performance deductions; schedule of rates.
- Scheduling & dispatch board, skills/qualifications, shifts/leave, timesheets.
- Inventory & stores, van stock.
- Procurement (requisition → PO → receipt → invoice match), approvals engine.
- Finance: cost centres, budgets, quotes, job costing; Xero/QuickBooks/Sage connectors.
- Workflow builder UI + automation rules + approval chains.
- Form designer.
- Documents module; keys register.
- Dashboards (configurable widgets).
- Public REST API v1 + API keys + webhooks; Teams/Slack notifications.
- Communications: broadcast messages, CSAT surveys.

## Phase 3 · Workplace & Sustainability (≈ 10 weeks)

- Floor plans (DWG/DXF/PDF → SVG; IFC viewer), space inventory, allocation, chargeback, occupancy analytics.
- Room/desk/resource booking + Microsoft 365/Google calendar sync + check-in + room panels.
- Visitor management + kiosk + evacuation roll-call.
- Moves (MAC).
- Energy & sustainability: meters, readings, bills, AMR import, carbon (Scope 1–2–3), SECR/ESOS packs, waste.
- IoT ingestion, device registry, alert rules → auto work orders, condition-based PPM.

## Phase 4 · Enterprise Depth (≈ 10–12 weeks)

- Real estate & leases, critical dates, service charges, IFRS 16 outputs.
- Condition surveys → backlog → capital planning & lifecycle forecasting.
- Projects & minor works (Gantt, CDM, snagging).
- Health & safety: incidents, RIDDOR, investigations, CAPA, risk register, RAMS, permits to work, LOTO, lone worker.
- Soft services: cleaning specs & audits (NSHC 2021), on-demand cleaning, guard tours, mail room, grounds.
- Fleet; business continuity.
- **AI suite**: triage, certificate OCR, nameplate recognition, job summaries, Ask-the-estate, anomaly detection (some of these can move earlier where they support Phase 1–2 modules).
- Report builder + scheduled report packs; BI connector.
- Multi-client FM-provider edition: client dimension, client portal, per-client branding, client billing.
- Building Safety Act golden thread.

## Phase 5 · Commercialise & Scale (≈ 8–10 weeks, overlaps Phase 4)

- **Stripe billing** live: plans, seats, add-ons, metered usage, VAT, dunning, customer billing portal.
- **Marketing homepage** (in front of `/login`): product pages, pricing, demo CTA, sign-up, blog/SEO, comparison pages.
- Self-serve sign-up, trial, onboarding wizard, template packs per industry, personal demo clone.
- Platform admin console: tenants, plans, overrides, support access, health, revenue metrics.
- SSO (SAML/OIDC), SCIM, IP allow-lists, custom domains, white-label, sandbox + config promotion, data residency.
- Native mobile apps (Expo) to App Store / Play Store.
- Integration marketplace, Zapier/Make connectors; contractor marketplace beta.
- Security certifications: Cyber Essentials Plus → ISO 27001 (→ SOC 2 Type II for international).
- G-Cloud listing.

## Cross-cutting, every phase

- Accessibility audit of new screens (axe + manual).
- Performance budget checks; load test of new heavy endpoints.
- Security review of new modules (threat model, authZ tests).
- Docs: user guide pages, API reference, changelog.
- Demo seed updated so every new feature has realistic demo data.
- Feature catalogue ([02](02-feature-catalogue.md)) ticked off as features ship.

## Definition of Done (per feature)

1. Meets acceptance criteria; behind correct permission and entitlement checks.
2. Tenant isolation verified by automated test.
3. Unit + API tests; e2e test for the primary journey.
4. Responsive and keyboard accessible; no axe violations.
5. Audit events emitted; custom fields/workflow supported where the entity is configurable.
6. Import/export and API coverage where applicable.
7. Demo data added; help text written; changelog entry.

## Working method

- Each phase is broken into GitHub issues (epics per module, stories per feature) generated from the feature catalogue.
- Short iterations; each merged PR deploys to staging; demo environment updated at the end of each iteration.
- Product owner reviews on the demo site at each iteration boundary.
