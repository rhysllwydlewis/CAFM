# CAFM Platform: Master Plan

> Status: **Draft v1**, 21 Nov 2026. Working title: "the Platform" until the product is named.

This folder is the single source of truth for what we are building, how, in what order, and how it makes money. Every build phase should start by reading the relevant document here, and every significant decision should be written back here.

## Documents

| # | Document | What it answers |
|---|----------|-----------------|
| 01 | [Product vision & market](01-product-vision.md) | Who it's for, what problem it solves, the competition, how we win |
| 02 | [Feature catalogue](02-feature-catalogue.md) | **Every** feature, grouped into 35 modules (including sector packs), with phase and pricing tier |
| 03 | [Roles, permissions & Super User](03-roles-permissions-admin.md) | The permission model, default roles, everything the Super User can configure, platform admin |
| 04 | [Architecture & tech stack](04-architecture.md) | Stack, multi-tenancy, configuration/workflow engines, integrations, hosting |
| 05 | [Data model](05-data-model.md) | Core entities and relationships |
| 06 | [Login page & demo environment](06-login-and-demo.md) | The first screen: basic login, demo credentials with autofill, the seeded demo tenant |
| 07 | [Monetisation strategy](07-monetisation.md) | Pricing, packaging, add-ons, billing system, go-to-market, unit economics |
| 08 | [Delivery roadmap](08-roadmap.md) | Phases, milestones, and the definition of done for each |
| 09 | [Quality, security & compliance](09-quality-security-compliance.md) | NFRs, security, testing, DevOps, certifications |
| 10 | [Risks & open decisions](10-risks-and-decisions.md) | Risks, mitigations, and decisions the product owner needs to make |
| 11 | [Design system](11-design-system.md) | Colour research and palette, typography, icons, logo, components, how the build uses them |
| 12 | [Screen catalogue](12-screen-catalogue.md) | 99 rendered screens covering every module, desktop, tablet, mobile and dark theme |

## Executive summary

**What:** A cloud-based, multi-tenant CAFM (Computer-Aided Facilities Management) platform delivered through the browser and a mobile app. It covers the whole facilities lifecycle: helpdesk, reactive and planned maintenance, assets, statutory compliance, contractors, inventory, purchasing, finance, space, workplace booking, visitors, energy and sustainability, real estate, capital planning, health & safety, soft services, IoT, analytics and AI.

**Who:** UK mid-market and enterprise organisations to start with: in-house estates teams (education/MATs, healthcare, housing, retail, commercial property, local government) and **FM service providers** who manage many client estates from one system. Sector packs (housing, healthcare, education and others) tailor the product to each.

**How it's different:**
1. **Configurable without code.** The tenant Super User can reshape their instance (fields, forms, workflows, SLAs, terminology, branding, roles, modules) without a consultant.
2. **Compliance-first for the UK.** Statutory compliance, golden-thread records (Building Safety Act), SFG20-aligned PPM, and auditable certificates are core features, not add-ons.
3. **Modern UX and mobile offline-first.** Technicians and contractors get a fast, offline-capable app. Requesters log a job in seconds by scanning a QR code.
4. **AI built in.** Auto-triage, certificate reading (OCR → expiry dates and remedial actions), predictive maintenance, and natural-language reporting.
5. **Transparent pricing.** Self-serve tiers for SMB, sales-led enterprise deals, free unlimited requesters.

**Build approach:** A TypeScript modular monolith (Next.js web + NestJS API + PostgreSQL), multi-tenant with row-level security, built so every module sits on a shared **configuration engine** (custom fields, forms, workflows, permissions). We build the foundations first, then deliver modules in priority order. The **first thing users see is a basic login page with one-click demo credentials**; the marketing homepage comes later.

**Delivery:** seven phases over roughly 14–17 months, sellable to pilots after about 3 (see [08-roadmap](08-roadmap.md)):

| Phase | Outcome |
|-------|---------|
| 0. Foundations | Monorepo, CI/CD, auth, tenancy, RBAC, audit log, config engine, design system, **login page + demo credentials**, seeded demo tenant |
| 1. Core CAFM (MVP) | Locations, assets, helpdesk, work orders, PPM, mobile PWA (offline), notifications, core reports, Super User admin console |
| 2A. Comply | Compliance, inspections, contractors & portal, permits/RAMS, documents, workflow & form builders, public API & webhooks |
| 2B. Commercial operations | Contracts/SLAs, dispatch, inventory & tools, purchasing, finance & budgets, dashboards, communications |
| 3. Workplace | Space & CAD/BIM floor plans, room/desk booking, visitors, moves, outages, energy & sustainability, IoT/BMS |
| 4. Enterprise depth | Real estate & leases, capital planning & projects, H&S, soft services, sector packs, AI suite, report builder, FM-provider edition |
| 5. Commercialise & scale | Stripe billing live, marketing homepage, self-serve onboarding, platform admin, SSO/SCIM, marketplace, native apps, ISO 27001 |

Billing *entitlements* (which plan unlocks which feature) are built into Phase 0 so that each module is gated by plan from day one. Self-serve payments go live in Phase 5; until then, pilot customers are invoiced manually, so revenue starts from Phase 1.
