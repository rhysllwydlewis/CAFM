# 14 · Glossary

Terms used across the plan, screens and code. When a term appears in the UI it uses the wording here, unless the tenant has renamed it (terminology overrides, doc 03).

## Facilities and maintenance

| Term | Meaning |
|------|---------|
| **FM Stead** | The product's name. **FMS** is its short form, for tight spaces such as a collapsed menu or an app icon |
| **CAFM** | Computer-Aided Facilities Management: software to run buildings, assets and services |
| **IWMS** | Integrated Workplace Management System: CAFM plus real estate, space and projects |
| **CMMS** | Computerised Maintenance Management System: maintenance-focused subset of CAFM |
| **FM / TFM** | Facilities management / Total facilities management (hard and soft services under one contract) |
| **Hard FM / soft FM** | Building fabric and services (HVAC, electrical, plumbing, fire) / people services (cleaning, security, catering, porterage) |
| **Request** | Something reported by a requester through the helpdesk, portal, QR code or email; may become one or more work orders |
| **Work order (WO)** | A unit of work assigned to people or a contractor; reactive, planned, project or inspection |
| **Reactive** | Unplanned work responding to a fault |
| **PPM** | Planned preventive maintenance: scheduled work to keep assets safe and working |
| **SFG20** | UK industry standard library of maintenance task schedules (licensed separately) |
| **Fixed vs floating schedule** | Fixed: next due date stays on the calendar anchor. Floating: next due date counts from the last completion |
| **Nested visits** | A longer-interval visit (e.g. annual) replaces the shorter ones due at the same time (e.g. monthly) |
| **Asset** | A maintainable item (boiler, lift, fire panel) in a location, possibly with child components |
| **Serves** | Relationship showing which spaces or assets an asset supplies (e.g. AHU-1 serves Levels 2–4) |
| **Condition grade** | A (as new) to D (failing); drives lifecycle and capital planning |
| **MTBF / MTTR** | Mean time between failures / mean time to repair |
| **Backlog maintenance** | Work needed to bring assets up to the required condition, with cost and risk |
| **Uniclass 2015 / NRM** | UK classification systems for building elements and products / cost measurement |
| **COBie / IFC / BIM** | Standard formats for handing over building information and 3D models |
| **AHU** | Air handling unit |
| **BMS** | Building management system: controls and monitors plant |
| **AMR** | Automatic meter reading |

## Service levels and commercial

| Term | Meaning |
|------|---------|
| **SLA** | Service level agreement: response, attendance and fix targets by priority |
| **Priority (P1–P4)** | P1 Emergency, P2 Urgent, P3 Routine, P4 Planned; set from the impact × urgency matrix |
| **SLA clock / pause** | Timer against a target in business hours; paused for logged reasons (e.g. no access) |
| **KPI** | Key performance indicator, measured monthly per contract |
| **Service credit / deduction** | Money returned to the client when KPIs are failed (performance mechanism) |
| **NTE** | Not-to-exceed: spend limit on a job before approval is needed |
| **SOR** | Schedule of rates: price list for standard work items |
| **RFQ** | Request for quote sent to several contractors |
| **Three-way match** | Purchase order, goods received and invoice agree before payment |
| **FM-provider edition** | Product edition for FM companies serving several client organisations |
| **Full / mobile / requester / contractor / read-only licence** | User licence types (doc 07); requesters and contractors are free |
| **Entitlement** | A feature or limit a tenant's plan unlocks |

## Compliance and safety (UK)

| Term | Meaning |
|------|---------|
| **Statutory compliance** | Inspections and tests required by law (gas, electrical, fire, water, lifts, asbestos…) |
| **Compliant with actions** | Certificate in date but remedial actions still open |
| **Remedial action** | Work raised from a certificate, inspection or risk assessment |
| **EICR** | Electrical Installation Condition Report (BS 7671), with codes C1 (danger present), C2 (potentially dangerous), C3 (improvement recommended), FI (further investigation) |
| **PAT** | Portable appliance testing |
| **GSIUR** | Gas Safety (Installation and Use) Regulations 1998 |
| **ACoP L8 / HSG274** | HSE guidance on controlling legionella in water systems |
| **LOLER / PSSR** | Lifting Operations and Lifting Equipment Regulations / Pressure Systems Safety Regulations |
| **CAR 2012** | Control of Asbestos Regulations |
| **F-Gas** | Regulations for refrigerant gases in air conditioning and refrigeration |
| **FRA** | Fire risk assessment (Regulatory Reform (Fire Safety) Order 2005) |
| **Golden thread** | Building Safety Act 2022 requirement to keep accurate, up-to-date building safety information for higher-risk buildings |
| **HRB** | Higher-risk building (Building Safety Act) |
| **RAMS** | Risk assessment and method statement |
| **Permit to work (PTW)** | Formal authorisation for hazardous work (hot works, height, confined space, electrical) |
| **LOTO** | Lock-out/tag-out: isolating energy sources before work |
| **RIDDOR** | Reporting of Injuries, Diseases and Dangerous Occurrences Regulations |
| **CAPA** | Corrective and preventive action |
| **COSHH** | Control of Substances Hazardous to Health |
| **CDM 2015** | Construction (Design and Management) Regulations |
| **Awaab's Law** | Social housing duty to investigate and fix damp, mould and other hazards within set timescales |
| **HHSRS** | Housing Health and Safety Rating System |
| **Void** | Empty rented property being prepared for re-letting |
| **TSM** | Tenant Satisfaction Measures (Regulator of Social Housing) |
| **HTM / PAM / ERIC** | Health Technical Memoranda / Premises Assurance Model / Estates Returns Information Collection (NHS) |
| **NSHC 2021** | National Standards of Healthcare Cleanliness; functional risk categories FR1–FR6 |
| **GEMS** | DfE Good Estate Management for Schools |
| **DBS** | Disclosure and Barring Service check (safeguarding) |

## Energy and sustainability

| Term | Meaning |
|------|---------|
| **Scope 1 / 2 / 3** | Direct emissions / purchased energy / other indirect emissions |
| **SECR / ESOS** | Streamlined Energy and Carbon Reporting / Energy Savings Opportunity Scheme |
| **DEC / EPC** | Display Energy Certificate / Energy Performance Certificate |
| **Baseload** | Energy used when the building should be idle |

## Product and platform

| Term | Meaning |
|------|---------|
| **Tenant** | One customer organisation's isolated instance of the platform |
| **Super User** | The tenant's lead administrator, with full control of their instance |
| **Platform admin** | Vendor staff; no tenant data access without a tenant-approved grant |
| **Account / membership** | A person's global login / their role and licence in one tenant |
| **RLS** | Row-level security in PostgreSQL |
| **Magic link** | Single-use, expiring link to approve or sign off without a full login |
| **Sector pack** | Templates, workflows and reports for a sector, layered on core modules |
| **Demo mode** | Environment setting that shows demo accounts and sandboxes outbound messages |
| **Agent** | A scheduled AI agent that owns one element of the build (doc 13) |
| **Conductor** | Agent A00, which coordinates the others |
| **ADR** | Architecture Decision Record (`docs/adr/`) |
