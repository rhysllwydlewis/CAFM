# 02 · Feature Catalogue

The complete list of capabilities the Platform will provide, benchmarked against leading CAFM, IWMS, CMMS and workplace products. Each module states:

- **Phase**: when it is built (see [08-roadmap](08-roadmap.md)).
- **Tier**: lowest plan that includes it (see [07-monetisation](07-monetisation.md)). `F` Free · `S` Starter · `P` Professional · `E` Enterprise · `A` paid Add-on. Inline tags override the module default.

Every module is built on the shared platform services in §0, so every module automatically gets custom fields, configurable statuses and workflows, permissions, audit, attachments, comments, notifications, search, import/export, saved views and API access.

---

## 0. Shared platform services (apply to every module)

**Phase 0–1 · Tier F**

- **Custom fields** on every entity: text, number, currency, date/time, picklist, multi-select, lookup, user, location, asset, checkbox, file, signature, formula/calculated, geo-point. Field validation, defaults, conditional visibility, required-by-status.
- **Form designer**: drag-and-drop layouts per entity, per role, per request type; sections, tabs, conditional logic.
- **Configurable statuses and workflow** per entity type: states, transitions, guards (who and under what conditions), required fields per transition, side effects.
- **Automation rules** (when → if → then): triggers on create/update/status change/schedule/date reached/SLA breach/IoT event; actions such as assign, notify, set field, create linked record, call webhook, start approval. `[P]`
- **Approvals engine**: single, multi-stage, parallel, threshold-based (spend limits), delegation, out-of-office. `[P]`
- **Attachments**: photos, video, documents; drag-drop; mobile camera; image annotation; virus scanning; versioning.
- **Comments and activity timeline** with @mentions, internal vs external (requester-visible) notes.
- **Full audit trail**: who changed what, when, before/after values; immutable; exportable.
- **Notifications**: in-app, email, push, SMS `[A: SMS credits]`, MS Teams/Slack `[P]`; per-user preferences; digest mode; templated content with merge fields.
- **Global search**: across all records, with typo tolerance, filters and recent items.
- **List views**: filter, sort, group, column chooser, saved and shared views, bulk edit, bulk actions, inline edit, kanban, calendar, map and timeline views.
- **Import/export**: CSV/XLSX templates per entity, field mapping, validation preview, error report, rollback; scheduled exports.
- **Numbering sequences**: configurable prefixes and formats (e.g. `WO-{SITE}-{YYYY}-{00000}`).
- **Tags, favourites, watchers/followers**.
- **Record linking**: any record can link to any other (e.g. incident → work order → asset → certificate).
- **QR/barcode labels**: generate and print labels for assets, locations and parts; scanning deep-links into the record or a request form.
- **Localisation**: multi-language UI, tenant terminology overrides, multi-currency, time zones, date/number formats.
- **Accessibility**: WCAG 2.2 AA, keyboard navigation, screen-reader support, high-contrast mode.
- **Dark/light theme**, responsive layout, keyboard shortcuts, command palette (Ctrl/Cmd-K).
- **Offline support** for mobile workflows (see §21).
- **Help and onboarding**: contextual help, guided tours, setup checklist, in-app changelog.
- **Recycle bin and soft delete** with restore; retention policies.

---

## 1. Location & Property Hierarchy

**Phase 1 · Tier F**

- Configurable hierarchy: Portfolio → Region → Site → Building → Floor → Zone → Room/Space (levels renameable, add or remove levels).
- Location attributes: address, geo-coordinates, gross/net area, use class, listed status, opening hours, contacts, photos, documents.
- Site map view (MapLibre/OSM), clustering, filter by status/compliance RAG.
- Location QR codes for "report a fault here".
- Location-based access scoping (users see only their sites).
- Site access info: parking, key safes, access codes (permission-protected), hazards, asbestos warnings shown before attendance.
- Business hours and holiday calendars per site (used by SLA clocks).
- Site status (open/closed/mothballed/sold) and history.

## 2. Helpdesk & Service Requests

**Phase 1 · Tier F**

- Multi-channel intake: self-service web portal, mobile app, **QR code scan** (location/asset pre-filled), **email-to-ticket** with parsing and threading, phone logging by helpdesk, MS Teams/Slack app `[P]`, chatbot/AI assistant `[A: AI]`, public anonymous reporting form (optional), API.
- Request catalogue: categories → problem codes → request types, each with its own form, priority, SLA, routing, and auto-response.
- **Priority matrix** (impact × urgency) with configurable response/attendance/fix targets.
- Guided triage scripts (questions that set priority and route).
- Duplicate detection (same location + category within a time window) with merge.
- Auto-assignment rules: by category, location, skills, contract, round-robin, load-balancing.
- Requester portal: log requests, track status, add comments/photos, rate the job, see knowledge-base answers before logging.
- Requester notifications at every key stage (configurable).
- Knowledge base / FAQ for self-help deflection. `[P]`
- Helpdesk queue with live SLA countdown, colour-coded breach risk, quick filters, keyboard-driven quick-log.
- Call logging timer and CTI integration (click-to-call, screen pop) `[E]`.
- Convert request → work order (one or many), quote request, incident, project, or reject with reason.
- Customer satisfaction (CSAT) survey on completion; NPS campaigns `[P]`.
- Announcements/banner messages to requesters (e.g. "Lift 2 out of service").

## 3. Reactive Work Orders

**Phase 1 · Tier F**

- Full lifecycle with configurable statuses (e.g. Logged → Assigned → Accepted → Travelling → On site → Paused/Awaiting parts → Completed → Verified → Closed → Invoiced).
- Assign to individuals, teams, internal trades or contractors; multi-resource jobs; sub-tasks.
- **SLA clocks**: response, attendance, temporary fix, permanent fix; business hours aware; pause reasons; breach alerts and escalation chains.
- Scheduling: appointment slots, requester-agreed times, access windows.
- Labour time capture (start/stop, travel, on-site, overtime codes), parts used, materials, sub-contract costs, expenses.
- **Not-to-exceed (NTE)** spend limits with approval for variations; quote-required flag.
- Job checklists, risk assessment and RAMS acknowledgement before start, permit-to-work link.
- Before/after photos, annotated images, video, voice notes (transcribed `[A: AI]`).
- Customer sign-off with signature and name capture; technician sign-off; supervisor verification.
- Follow-on works, recall/callback tracking (re-attendance within N days flags first-time-fix failure).
- Root cause and resolution codes; failure codes (problem/cause/remedy).
- Job sheets: PDF generation, emailed to customer/requester, branded.
- Work order costing: labour × rates, parts × cost/markup, contractor invoices; charge-out to client/cost centre.
- Bulk create (e.g. same job across 50 sites), templates for common jobs.
- Linked asset history updated automatically (downtime, cost, failure history).

## 4. Planned Preventive Maintenance (PPM)

**Phase 1 · Tier S**

- **Task library**: maintenance task templates with steps, checklists, frequency, skills, estimated duration, parts kits, safety notes.
- **SFG20 integration** `[A: SFG20, customer brings licence]`: import SFG20 schedules and keep them updated; map to asset classes; record criticality (statutory/mandatory/optimal/discretionary).
- Schedule types: calendar (daily…every N years), meter-based (hours, cycles, miles), condition-based (sensor thresholds), seasonal, and fixed vs floating (next due from completion vs from schedule).
- Grouping: by site, route, asset group, contractor; combine tasks into single visits (nested frequencies, e.g. a 12-monthly visit replaces that month's monthly visit).
- **Forecasting**: 52-week (or multi-year) planner, labour-hours and cost forecast, Gantt/calendar views, drag to reschedule with rules.
- Auto-generation of PPM work orders N days ahead; batching to contractors.
- PPM compliance KPIs: % completed on time by site/contract/discipline; overdue list; missed-visit reasons.
- Reactive-from-PPM: defects found during PPM raise linked reactive jobs/quotes.
- Seasonal and shutdown planning (e.g. school holidays).
- Asset-condition update captured at each PPM visit.

## 5. Asset Management

**Phase 1 · Tier F** (lifecycle and capital features `[P]`/`[E]`)

- Asset register with unlimited hierarchy (system → asset → component), parent/child, linked to location.
- Asset classification: **Uniclass 2015**, **NRM 3**, **SFG20** classes, or custom; class-specific attribute templates.
- Attributes: make, model, serial, install date, supplier, cost, warranty, expected life, criticality, condition, refrigerant type/charge (F-Gas), capacity, nameplate photo.
- Tags: QR, barcode, **NFC**, RFID; bulk label printing; scan to view/raise job/record reading.
- **Asset onboarding by photo**: AI reads nameplate → make/model/serial `[A: AI]`.
- Meter readings (manual, mobile, IoT), meter types, rollover handling.
- Warranty tracking with claims and alerts before expiry.
- Condition surveys: condition grades (A–D / 1–5), remaining life, photos, defects, cost to remedy; survey mode on mobile. `[P]`
- Criticality and risk scoring (likelihood × consequence).
- Reliability metrics: MTBF, MTTR, availability, downtime log, failure history, cost of ownership.
- **Failure mode and RCM analysis** (FMEA library) `[E]`.
- Lifecycle replacement planning and capital forecasting (see §16) `[P]`.
- Depreciation (straight-line, reducing balance) and asset valuation `[E]`.
- Asset transfers between sites, loans and check-in/check-out of portable equipment.
- Disposal/decommissioning workflow with WEEE/waste record.
- Linked documents: O&M manuals, drawings, certificates, warranties.
- **BIM/COBie import** to populate assets from digital models `[E]`.
- IT/AV and portable equipment register, including PAT testing.

## 6. Statutory Compliance & Inspections

**Phase 2 · Tier P** (core certificate tracking `[S]`)

- **Compliance register**: what is required where (by location and asset), frequency, responsible person, contractor, legislation reference.
- Pre-built UK templates: gas safety (Gas Safety (Installation and Use) Regulations), fixed-wire electrical (EICR / BS 7671), PAT, fire risk assessment (Regulatory Reform (Fire Safety) Order 2005), fire alarms (BS 5839), emergency lighting (BS 5266), sprinklers, dry/wet risers, fire doors, extinguishers, **legionella/water hygiene (ACoP L8, HSG274)**, **asbestos (CAR 2012)** register and re-inspection, **LOLER** (lifts and lifting equipment), **PSSR** (pressure systems), **F-Gas**, TM44 air-con inspections, EPC/DEC, lightning protection, playground equipment, kitchen extract (TR19), radon, gutter/roof safety, fall-arrest systems, and more. Templates are editable and the Super User can add their own.
- Certificate upload with **AI extraction**: issue date, expiry, result (pass/fail/C1/C2/C3/FI), defects → automatic remedial actions `[A: AI]`.
- Remedial action tracking with priority by severity code (e.g. EICR C1 = immediate).
- **Compliance matrix**: sites × compliance types, RAG status, drill-down to evidence.
- Expiry alerts and automatic PPM/work order generation ahead of due dates.
- Audits and inspections: configurable inspection forms (scoring, pass/fail, N/A, photos, comments, mandatory evidence), scheduled or ad hoc, mobile capture, actions from failed items.
- **Building Safety Act 2022 golden thread** `[E]`: structured, versioned, auditable building information for higher-risk buildings; safety case evidence; mandatory occurrence reporting.
- Logbooks: digital fire logbook, water hygiene logbook (temperature readings, flushing), asbestos register with locations on floor plans.
- Auditor/insurer read-only access with time-limited links.
- Compliance score history and trend reporting.

## 7. Health, Safety & Risk

**Phase 4 · Tier P**

- Incident, accident, near-miss and hazard reporting (web/mobile/QR, anonymous option).
- **RIDDOR** classification and report data capture.
- Investigation workflow, root cause analysis (5 whys, fishbone), witness statements.
- CAPA (corrective and preventive actions) tracking.
- Risk register and risk assessments (templates, scoring matrix, controls, review dates).
- **RAMS** management: submission by contractors, review/approval, versioning.
- **Permit to Work** `[P]`: hot works, working at height, confined spaces, electrical isolation, roof access; issue → accept → suspend → close; conflicts check; **LOTO** (lock-out/tag-out) records.
- Lone-worker check-in timers and escalation `[E]`.
- Toolbox talks and safety briefings with attendance sign-off.
- COSHH register and data sheets.
- First-aider/fire-warden rosters.

## 8. Contractor & Supplier Management

**Phase 2 · Tier P**

- Supplier/contractor database: trades, coverage areas, rates, contacts, banking (permission-protected).
- **Accreditation and compliance**: insurance certificates (PL/EL/PI) with expiry, CHAS, SafeContractor, Constructionline, Gas Safe, NICEIC and similar; auto-suspend non-compliant contractors.
- Onboarding workflow with document requests and approval.
- **Contractor portal** (web and mobile): receive and accept/reject jobs, update status, upload photos and certificates, submit quotes, submit invoices, see own performance. Contractor users are free.
- Contractor site sign-in/sign-out (geo-fenced) with induction check.
- RFQ/tender: send to multiple contractors, compare quotes, award.
- Performance scorecards: SLA %, first-time fix, quote accuracy, CSAT, compliance.
- Preferred supplier lists by trade/site; contractor ranking for auto-allocation.
- Self-billing and invoice validation against job and PO.
- **Contractor marketplace** (find vetted contractors in an area) `[Phase 5]`.

## 9. Contracts, SLAs & Performance (incl. FM-provider features)

**Phase 2 · Tier P** (multi-client `[E]` or FM-provider edition)

- Contract register: client contracts (for FM providers) and supplier contracts; value, term, renewal/break dates, notice periods, scope, documents.
- Contract-specific SLAs, priority matrices, rates, business hours, escalation contacts.
- **Multi-client**: one tenant manages many client organisations with data separation, per-client branding on portal and job sheets, per-client users.
- **Client portal**: clients view jobs, PPM compliance, SLA performance, approve quotes, download reports.
- KPI framework: define KPIs, targets, measurement rules, monthly scorecards.
- **Performance mechanism**: automatic service-credit/deduction calculation for SLA failures.
- Contract renewal alerts and critical-date tracking.
- Schedule of rates (SOR) libraries: NHF, M3 or custom; price jobs from SOR codes.

## 10. Scheduling, Dispatch & Workforce

**Phase 2 · Tier P** (basic assignment `[F]`)

- **Dispatch board**: drag-and-drop jobs onto people/time, live map of technicians (GPS from app, opt-in), colour-coded by SLA risk.
- Skills, trades and certification matching; availability, shifts, rotas, on-call rotas, leave/absence.
- **Route optimisation** and travel-time estimates `[E]`.
- Capacity planning: demand vs available hours by trade/region.
- Workforce records: employees, trades, labour rates (normal/overtime/call-out), cost centres.
- **Qualifications and training records** with expiry alerts (e.g. Gas Safe, 18th Edition, IPAF, PASMA, asbestos awareness); block assignment if expired.
- Timesheets from job time plus non-job time; approval; export to payroll.
- Overtime and call-out tracking.
- Vehicle/van assignment (see §24).

## 11. Inventory, Stores & Parts

**Phase 2 · Tier P**

- Part catalogue with categories, manufacturer part numbers, alternates, suppliers, prices, photos.
- Multiple stores, bins and **van stock**; stock levels per location.
- Min/max, reorder points, automatic replenishment requests.
- Stock movements: receive, issue to job, return, transfer, adjust, write-off; full ledger.
- Serialised and batch-tracked parts; rotables (repairable spares).
- Kits/BOMs (bill of materials) linked to assets and PPM tasks.
- Stock takes / cycle counts with mobile scanning.
- Valuation (FIFO, weighted average) and stock reports.
- Parts reservations for scheduled work.

## 12. Procurement & Purchasing

**Phase 2 · Tier P**

- Purchase requisitions → approval → purchase orders (from job, from stock replenishment, or standalone).
- Approval rules by value, cost centre, category, site; delegation of authority matrix.
- PO issue by email/PDF/portal; supplier acknowledgement.
- Goods receipt (full/partial), receipt against job.
- Supplier invoice capture (portal, email, OCR `[A: AI]`), **three-way match** (PO–receipt–invoice), discrepancy handling.
- Punch-out catalogues / approved catalogues `[E]`.
- Framework agreements and call-off tracking `[E]`.

## 13. Finance, Budgets & Billing

**Phase 2 · Tier P**

- Cost centres, GL codes, budget lines by site/discipline/year.
- Budgets vs commitments (open POs) vs actuals, with forecasts and variance alerts.
- Job costing roll-up (labour, parts, subcontract, expenses).
- **Quotes/estimates**: build from SOR/labour/parts, send for approval, convert to job.
- **Client billing** (FM providers): recharge rules, markups, fixed-price vs time & materials, consolidated monthly invoicing, credit notes, VAT handling incl. domestic reverse charge (CIS) `[E]`.
- Rate cards per client/contract.
- Finance integrations: **Xero, Sage, QuickBooks**, and enterprise **SAP, Oracle, Microsoft Dynamics** `[E]`.
- Cost dashboards: cost per m², per asset, per site, reactive vs planned ratio.

## 14. Documents & Drawings

**Phase 2 · Tier S**

- Document library linked to any record; folders and metadata; version control; check-in/out.
- Document types with mandatory metadata and **expiry/review dates**.
- O&M manuals, H&S files, drawings, warranties, policies.
- In-browser preview (PDF, images, Office files) and markup.
- Document request workflows (e.g. ask contractor for certificate).
- Secure external sharing with expiring links.

## 15. Space Management & Floor Plans

**Phase 3 · Tier E** (basic room list `[F]`)

- **Interactive floor plans**: import DWG/DXF (converted to SVG), PDF overlays, or **IFC/BIM**; pan/zoom; layers.
- Space inventory: room types, areas (gross/net/usable per RICS IPMS), capacity, departments.
- Plot assets, jobs, incidents, sensors, desks and asbestos locations on plans; click a room to raise a request.
- Space allocation and chargeback by department/cost centre.
- Occupancy and utilisation analytics (from bookings, badge data, or sensors).
- Stacking and blocking diagrams; scenario planning (what-if reorganisations).
- Space standards and benchmarking (m² per person, desk ratio).
- Wayfinding (find a room/desk/colleague) `[E]`.

## 16. Capital Planning & Lifecycle

**Phase 4 · Tier E**

- Backlog maintenance register (from condition surveys) with risk-adjusted prioritisation.
- Lifecycle replacement forecast (10–30 years) from asset life and condition.
- Capital project requests, scoring and approval (business cases).
- Funding scenarios and budget constraint modelling.
- Whole-life cost modelling.

## 17. Projects & Minor Works

**Phase 4 · Tier E**

- Projects with phases, tasks, Gantt, milestones, dependencies.
- Budgets, commitments, variations/change orders, cash-flow.
- Link to work orders, POs, contractors, documents, risks.
- CDM 2015 roles and documentation (client, principal designer, principal contractor; F10 notification data).
- Snagging lists with mobile capture; practical completion and handover packs.

## 18. Room, Desk & Resource Booking (Workplace)

**Phase 3 · Tier A (Workplace add-on)**

- Room booking with floor-plan picker, capacity and equipment filters.
- **Desk booking / hot-desking**, neighbourhoods, team days, recurring bookings.
- Resource booking (parking spaces, lockers, equipment, vehicles).
- Outlook/Microsoft 365 and Google Calendar sync; Teams add-in `[E]`.
- Check-in (QR/NFC), auto-release of no-shows.
- Catering and services orders attached to bookings, routed to providers.
- Booking rules: lead times, max duration, approval for certain spaces, user-group restrictions.
- Room-panel displays (tablet outside room).
- Utilisation analytics feeding space management.

## 19. Visitor Management

**Phase 3 · Tier A (Workplace add-on)**

- Pre-registration by hosts; email invite with QR code and directions.
- Kiosk/tablet sign-in, badge printing, photo capture, NDA/e-signature, H&S briefing acknowledgement.
- Host notifications (email/SMS/Teams).
- Contractor sign-in tied to permits and inductions.
- **Evacuation roll-call** (live on-site list on mobile).
- Watch-lists and visitor data retention (UK GDPR).

## 20. Moves, Adds & Changes (MAC)

**Phase 3 · Tier E**

- Move requests and approval; individual and bulk/team moves.
- Move planning on floor plans; scenario comparison.
- Generated task lists (IT, furniture, keys, signage, cleaning) as work orders.
- Move history and churn rate reporting.

## 21. Mobile App (Technician, Contractor, Requester)

**Phase 1 (PWA) → Phase 5 (native) · Tier F**

- **Offline-first**: download my jobs, assets, checklists, forms, plans; queue changes; conflict resolution on sync.
- My jobs list, map, and calendar; accept/reject; status updates in one tap; navigation hand-off.
- Barcode/QR/NFC scanning to open an asset or start a job.
- Checklists and inspection forms, photos with annotation, video, voice notes, signatures.
- Parts usage from van stock; request parts.
- Time capture (auto start/stop on status), travel time, timesheet.
- Create a reactive job or defect on the fly; capture a meter reading.
- Push notifications for new/urgent jobs; SLA countdown.
- Requester mode: report a fault (QR), track jobs, book desk/room.
- Biometric login, device management (remote wipe of app data) `[E]`.
- Native iOS/Android (React Native) with background location (opt-in) and better offline storage in Phase 5.

## 22. Energy, Utilities & Sustainability

**Phase 3 · Tier A (Sustainability add-on)**

- Meter hierarchy (electricity, gas, water, heat, renewables, sub-meters).
- Readings: manual/mobile, file import, **AMR/smart meter** and half-hourly data feeds, BMS.
- Utility bill capture and validation (bill vs consumption), tariff management.
- Consumption analytics: profiles, baseload, out-of-hours waste, degree-day normalisation, benchmarks (kWh/m²).
- Anomaly detection and alerts `[A: AI]`.
- **Carbon reporting**: Scope 1, 2 (location- and market-based) and selected Scope 3; UK government conversion factors (DESNZ) updated annually.
- Reporting packs for **SECR**, **ESOS**, DEC/EPC tracking, NABERS UK, BREEAM-In-Use evidence; ESG dashboards.
- Net-zero targets and decarbonisation project tracking (link to capital plan).
- Waste management: waste streams, collections, weights, recycling rate, waste transfer notes.

## 23. Soft Services

**Phase 4 · Tier P**

- Cleaning schedules and specifications per area; frequency and output-based specs.
- Cleaning audits (incl. **National Standards of Healthcare Cleanliness 2021** scoring, star ratings, functional risk categories) `[E]`.
- **On-demand cleaning** triggered by usage/sensors/QR feedback ("this washroom needs attention").
- Security: guard tours/patrol checkpoints (NFC/QR), incident logs, key holding.
- Porterage and task requests; mail room (parcel logging and collection notifications).
- Grounds maintenance and winter gritting schedules; pest control logs.
- Reception and front-of-house tasks.

## 24. Fleet & Vehicles

**Phase 4 · Tier A (Fleet add-on)**

- Vehicle register, assignment to drivers/teams.
- MOT, tax, insurance, service schedules and reminders.
- Mileage logs, fuel cards import, defect checks (daily walk-around via mobile).
- Driver licence checks record.

## 25. Keys & Access Control

**Phase 2 · Tier P**

- Key/fob/access-card register, key safes, master-key hierarchies.
- Issue/return with signature; overdue alerts; lost-key workflow.
- Integration with access-control systems for card provisioning `[E]`.

## 26. IoT, BMS & Condition Monitoring

**Phase 3 · Tier A (IoT add-on)**

- Device registry linked to assets/spaces.
- Ingestion via MQTT/HTTP webhooks/LoRaWAN network servers; BMS integration via gateways (BACnet/Modbus through partner edge devices).
- Live telemetry dashboards and time-series charts.
- Threshold and pattern rules → alerts → **automatic work orders** (e.g. temperature out of range, leak detected, filter differential pressure).
- Condition-based PPM triggers; runtime-hours → meter readings.
- Occupancy sensors → space utilisation and on-demand cleaning.
- Legionella temperature sensors to automate water-hygiene logbooks.
- **Predictive maintenance** models (anomaly and failure prediction) `[A: AI]`.

## 27. Real Estate & Lease Management

**Phase 4 · Tier E**

- Property portfolio: owned/leased, tenure, title details, valuations.
- Leases (landlord and tenant side): parties, terms, rent, rent reviews, breaks, expiries, options, dilapidations, clauses.
- **Critical-date** alerts (break notices, reviews, expiries).
- Rent schedules and payments; service-charge budgets and reconciliations; recharges to occupiers.
- **IFRS 16 / FRS 102** lease accounting outputs (right-of-use asset, liability schedules) `[E]`.
- Occupier/tenant portal for managing agents.

## 28. Reporting, Dashboards & Analytics

**Phase 1 (core) → Phase 4 (builder) · Tier F (standard reports) / P (dashboards) / E (BI)**

- Standard report library per module (100+ out of the box): SLA performance, PPM compliance, open jobs by age, cost analysis, asset history, compliance status, contractor performance, CSAT, energy and carbon.
- **Dashboards**: drag-and-drop widgets (KPI tiles, charts, tables, maps, gauges), role-based default dashboards, filters, drill-down, TV/wallboard mode.
- **Report builder** `[P]`: pick entity, fields, filters, grouping, charts; save, share, schedule.
- Scheduled report packs (PDF/XLSX) emailed weekly/monthly (e.g. monthly client report).
- Natural-language questions ("how many P1 jobs breached SLA at Cardiff last month?") `[A: AI]`.
- **BI connectors**: Power BI/Tableau via read-only OData/SQL replica, data warehouse export (e.g. Snowflake/BigQuery) `[E]`.
- Benchmarking across sites, and anonymised cross-tenant benchmarks (opt-in) `[Phase 5]`.

## 29. AI Suite

**Phase 4 (some earlier) · Tier A (AI add-on), with fair-use credits included in higher tiers**

- **Smart triage**: suggest category, priority, location, asset and assignee from free text/photo; flag duplicates.
- **Certificate and document reading**: extract dates, results, defects → remedial actions.
- **Nameplate/asset photo recognition** to create asset records.
- **Job summaries**: summarise long job histories; auto-write completion notes from voice/photos.
- **"Ask the estate" assistant**: natural-language Q&A over tenant data, permission-aware; can draft reports and create records with confirmation.
- **Predictive maintenance and anomaly detection** (IoT, energy, failure patterns).
- **PPM optimisation** suggestions (over-maintained assets, consolidation of visits).
- Invoice/quote OCR and validation.
- Translation of requests and job notes.
- All AI features: tenant-level on/off, usage metering, human-in-the-loop for actions, no training on customer data, audit of AI actions.

## 30. Communications & Engagement

**Phase 2 · Tier P**

- Notification template editor (email/SMS/push) with merge fields and branding.
- Broadcast and mass notifications (e.g. site closure, emergency) by site/group.
- Occupant surveys and feedback forms; pulse surveys on workplace.
- Public status page per site (planned outages).

## 31. Business Continuity & Emergency Management

**Phase 4 · Tier E**

- Emergency plans per site, critical contacts, escalation trees.
- Critical incident mode: dashboard, mass notification, roll-call, tasking.
- Business impact data (critical assets and spaces).

## 32. Integrations & Developer Platform

**Phase 2 (API, webhooks) → Phase 5 (marketplace) · Tier P (API) / E (enterprise connectors)**

- **Public REST API** (OpenAPI 3.1 documented), API keys and OAuth2 client credentials, rate limits, sandbox tenants `[E]`.
- **Webhooks** for all record events, with retries and signing.
- Zapier/Make/Power Automate connectors.
- Identity: **SAML 2.0/OIDC SSO** (Entra ID/Azure AD, Okta, Google), **SCIM** user provisioning `[E]`.
- Calendar: Microsoft 365, Google Workspace.
- Collaboration: MS Teams app, Slack app.
- Finance/ERP: Xero, Sage, QuickBooks, SAP, Oracle, Dynamics 365.
- HR: employee sync (e.g. via SCIM/CSV, Workday/BambooHR connectors).
- BMS/IoT platforms; access control; CAD/BIM (Autodesk Platform Services).
- SFG20 API; e-signature; payment (Stripe) for contractor payments/marketplace.
- Data import from common CAFM/CMMS exports (migration toolkit).
- **Integration marketplace** with partner-built apps `[Phase 5]`.

## 33. Super User Administration & Configuration

**Phase 0–2 · Tier F (core) / P / E (advanced)**. Full detail in [03-roles-permissions-admin](03-roles-permissions-admin.md).

- User management: invite, create, bulk import, deactivate, reset password/MFA, impersonate ("view as") with audit, licences/seat types.
- Roles and permissions builder; teams and groups; data scoping by location/client/contract.
- Module on/off and navigation customisation; terminology overrides.
- Branding / white-label: logo, colours, custom domain, email sender domain, branded PDFs `[E]`.
- All configuration objects: fields, forms, statuses, workflows, automation, SLAs, calendars, priorities, categories, templates, numbering, picklists.
- Security settings: password policy, MFA enforcement, SSO, session timeout, IP allow-lists `[E]`, data retention, audit log export.
- **Sandbox/test environment** and config promotion (copy config sandbox → production) `[E]`.
- Config export/import as JSON (templates between tenants).
- Subscription and billing self-management (Phase 5).

## 34. Platform (Vendor) Administration

**Phase 0 (basic) → Phase 5 · internal only**

- Tenant lifecycle: create, trial, activate, suspend, delete (with grace period and data export).
- Plans, entitlements, feature flags, usage limits per tenant.
- Billing overview (MRR, invoices, failed payments).
- Support tools: consented support access to a tenant (time-boxed, fully audited), tenant health metrics, error logs.
- Global templates library (compliance templates, task libraries, forms) published to tenants.
- System announcements, maintenance windows, release notes.
- Data residency assignment per tenant (UK/EU) `[E]`.

---

## Feature count summary

| Area | Modules |
|------|---------|
| Core operations | Helpdesk, Reactive, PPM, Assets, Locations, Mobile, Scheduling |
| Compliance & risk | Statutory compliance, H&S, Permits, Golden thread |
| Commercial | Contractors, Contracts/SLAs, Procurement, Inventory, Finance, Billing |
| Workplace | Space, Floor plans, Booking, Visitors, Moves |
| Strategic | Capital planning, Projects, Real estate, Energy/ESG |
| Services | Soft services, Fleet, Keys, Business continuity |
| Platform | Config engine, Workflow, Automation, Reporting, AI, Integrations, Admin, Billing |

When a new feature request arrives, add it to the relevant module here with phase and tier before building it.
