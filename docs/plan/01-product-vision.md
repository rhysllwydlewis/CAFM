# 01 · Product Vision & Market

## Vision

> One place to run every building, asset and service an organisation is responsible for, so that buildings stay safe, compliant, cost-effective and pleasant to work in.

## Problem

- Facilities teams juggle spreadsheets, email inboxes, paper job sheets, contractor portals and legacy on-premise CAFM systems.
- Statutory compliance (gas, electrical, fire, water hygiene, lifts, asbestos and more) is high-stakes, and the evidence is scattered. Missed inspections create legal, insurance and life-safety risk.
- Legacy CAFM tools are powerful but slow, dated, expensive to configure (consultant-dependent) and weak on mobile.
- Modern CMMS tools such as MaintainX, UpKeep and Limble have good UX but are maintenance-only. They lack space, compliance depth, contracts, finance and multi-client FM-provider features.

## Target customers

### Beachhead (first 12–18 months): UK mid-market

| Segment | Why | Typical size |
|---------|-----|--------------|
| **FM service providers** (hard/soft/TFM) | Need multi-client, contractor and SLA/penalty features; high willingness to pay; each provider brings many sites | 20–500 users |
| **Education** (multi-academy trusts, independent schools, FE/HE) | Many sites, heavy compliance, small teams, budget-conscious → strong fit for self-serve tiers | 5–100 users |
| **Commercial property / managing agents** | Tenants, service charges, lease dates, contractors | 10–200 users |
| **Housing associations** (repairs, voids, compliance "Big 6") | Regulator pressure, Awaab's Law, Building Safety Act | 20–500 users |
| **Healthcare (private, primary care)**, **retail & hospitality estates** | Multi-site reactive and compliance | 10–300 users |

### Expansion: enterprise and public sector
NHS trusts, local authorities, universities, central government via **G-Cloud** (Crown Commercial Service), and international (EU, ANZ, Middle East).

## Personas

| Persona | Goal | Key screens |
|---------|------|-------------|
| **Super User / Tenant Owner** | Configure the system to match how the organisation works; control access | Admin console, workflow builder, roles, branding |
| **FM / Estates Manager** | Keep estate safe, compliant, on budget; report to leadership | Dashboards, compliance matrix, budgets, KPIs |
| **Helpdesk Operator** | Log, triage and dispatch requests quickly | Helpdesk queue, quick-log, dispatch board |
| **Supervisor / Planner** | Plan and balance work across teams | Scheduler, PPM planner, capacity view |
| **Technician / Engineer** | Know what to do next, record it fast, even offline | Mobile app: my jobs, checklists, parts, sign-off |
| **Contractor (external)** | Receive work, quote, attend, upload certificates, invoice | Contractor portal and mobile |
| **Requester / Occupant** | Report a problem and see progress; book a desk or room | Self-service portal, QR reporting, booking |
| **Compliance / H&S Officer** | Prove compliance; manage risk and incidents | Compliance register, audits, incidents |
| **Finance / Procurement** | Control spend; match invoices; recharge clients | POs, approvals, invoices, budgets |
| **Space Planner / Workplace Lead** | Optimise space and occupancy | Floor plans, occupancy analytics, moves |
| **Client (of an FM provider)** | See performance against contract | Client portal, SLA reports |
| **Resident (housing)** | Report a repair, book an appointment, know when it will be fixed | Resident portal, appointment booking |
| **Visitor** | Sign in quickly and know where to go | Pre-registration email, kiosk |
| **Executive** | Headline performance, risk and cost | Executive dashboard, scheduled PDF packs |

## Competitive landscape

| Category | Examples | Strengths | Gaps we exploit |
|----------|----------|-----------|-----------------|
| Enterprise IWMS/CAFM | Planon, Eptura (Archibus), Concept Evolution, IBM Maximo, Spacewell, Trimble Manhattan | Deep functionality | Expensive, slow to implement, consultant-led, dated UX |
| UK mid-market CAFM / compliance | QFM, Elogbooks, Concerto, Agility | UK compliance familiarity, FM-provider and managing-agent workflows | Patchy UX/mobile, limited self-configuration, limited AI |
| Field service management | Joblogic, Simpro, BigChange | Job scheduling and invoicing for contractors | Built for contractors, not estate owners; thin on assets, space and compliance oversight |
| Housing repairs & compliance | Specialist housing platforms | Housing workflows | Housing-only |
| Modern CMMS | MaintainX, UpKeep, Limble, Fiix, Facilio | Great UX, self-serve | Maintenance-only; weak UK compliance, space, contracts, multi-client |
| Workplace apps | Robin, Envoy, Condeco | Booking and visitors | Not CAFM |

Competitor names and ownership change often (there has been a lot of consolidation). Verify this list during the Phase 0 discovery interviews before it is used in any sales or marketing material.

## Differentiators (how we win)

1. **Breadth of an IWMS, usability of a modern CMMS.** One login covers everything; modules switch on per plan.
2. **No-code configurability** so the Super User can change fields, forms, workflows, SLAs, roles, terminology and branding themselves.
3. **UK compliance engine**: statutory templates, certificate OCR, remedial-action tracking, golden thread, auditor read-only access.
4. **FM-provider edition**: multi-client, per-client SLAs and branding, client portal, penalty/deduction calculation, recharging.
5. **Offline-first mobile** for technicians and contractors.
6. **AI that saves real time**: triage, certificate reading, job summaries, predictive maintenance, "ask the estate" Q&A.
7. **Fast onboarding**: importers, templates, demo data, guided setup, so a customer is live in days, not months.
8. **Open platform**: full public REST API, webhooks, integration marketplace.

## Success metrics (product)

- Time to log a request: < 30 seconds (portal/QR).
- Time to first value for a new tenant: first work order logged within 1 day of sign-up.
- PPM compliance shown in-product, with customers reaching > 95%.
- Technician app DAU/MAU > 70%.
- Net Revenue Retention > 110%; logo churn < 8%/yr.
