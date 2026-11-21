# 07 · Monetisation Strategy

## Model in one line

**SaaS subscription, priced per paid user by licence type, packaged in four tiers, with paid add-on modules, usage-based extras, and professional services.** Requesters, contractors, clients and auditors are always free. They drive adoption and network effects but don't cost the customer a seat.

## Why this model

- Per-user pricing is what the CAFM/CMMS market expects, so it is easy to budget and compare.
- **Free requesters** remove the biggest objection ("we have 2,000 staff who need to log jobs") and put our portal in front of every occupant.
- **Free contractor users** turn every customer's supply chain into a distribution channel: contractors see the product and work across multiple customers, which seeds a future contractor marketplace.
- **Mobile-only technician licences** at a lower price keep large field teams affordable.
- **Tiered modules** give a natural upgrade path: start with maintenance, then add compliance, then the workplace and ESG modules.

## Licence types

| Licence | Who | Price basis |
|---------|-----|-------------|
| **Full user** | Office-based staff using the back office (managers, helpdesk, planners, finance, admins) | Full tier price |
| **Mobile user** | Technicians who mainly use the app | ~50% of full price |
| **Requester** | Anyone logging requests, booking rooms, registering visitors, and approving items routed to them | **Free, unlimited** |
| **Contractor** | External contractor company users | **Free** |
| **Client viewer** | Clients of FM providers | **Free** (included in FM-provider edition) |
| **Read-only** | View-only users such as executives and auditors (auditor links can be time-limited) | Free up to 5 (Starter), 20 (Professional) or 50 (Enterprise); then £5/user/mo |

## Tiers (indicative GBP excluding VAT, per user per month, billed annually; monthly billing +20%)

| | **Free** | **Starter** | **Professional** | **Enterprise** |
|---|---|---|---|---|
| Full user | £0 (max 3) | **£29** | **£59** | **from £89** (custom) |
| Mobile user | £0 (max 3) | £15 | £29 | from £45 |
| Sites / assets | 1 site / 100 assets | 10 sites / 2,500 assets | Unlimited | Unlimited |
| File storage included | 2 GB | 50 GB | 250 GB | 1 TB |
| Helpdesk, reactive WOs, assets, locations, mobile app, requester portal | ✓ | ✓ | ✓ | ✓ |
| PPM, task libraries, documents, basic compliance certificates | | ✓ | ✓ | ✓ |
| Standard reports | Basic | ✓ | ✓ | ✓ |
| Assign jobs to contractors by email/magic link | ✓ | ✓ | ✓ | ✓ |
| Full compliance & inspections, contractors & portal, inventory, tools & calibration, purchasing, finance & budgets, contracts/SLAs, scheduling/dispatch, H&S, permits, keys, soft services, sector packs | | | ✓ | ✓ |
| Form designer | | | ✓ | ✓ |
| Custom fields & forms | 5 fields | 25 fields | Unlimited | Unlimited |
| Workflow builder, automation, approvals | | | ✓ | ✓ (advanced) |
| Dashboards & report builder | | | ✓ | ✓ |
| API & webhooks | | Read-only API | ✓ | ✓ (higher limits) |
| Space & floor plans, moves, capital planning, projects, real estate & leases, business continuity, Building Safety Act golden thread | | | | ✓ |
| Multi-client (FM-provider features) | | | | ✓ |
| SSO/SCIM, IP allow-list, custom domain, white-label, sandbox, data residency, BI connector | | | | ✓ |
| AI credits included | — | 100/mo | 1,000/mo | 5,000/mo (custom) |
| Support | Community/docs | Email, next business day | Email + chat, 4h response | Named CSM, phone, 99.9% uptime SLA |
| Minimum annual commitment | — | — | — | **£12,000/yr** |

**Downgrades:** data in modules no longer included becomes read-only (never deleted) for 90 days, with export available, and returns in full on re-upgrade.

Prices are a starting hypothesis to validate (see "Validation" below). Market reference points: modern CMMS tools list roughly £15–£70 per user per month; enterprise CAFM/IWMS contracts typically run £20k–£250k+ per year plus implementation.

## Add-ons (any paid tier unless noted)

| Add-on | Price (indicative) | Notes |
|--------|--------------------|-------|
| **Workplace** (room & desk booking, visitors, kiosks, room panels, floor-plan viewer for booking) | £2 per bookable desk/room/mo, or £1.50 per employee/mo | Common workplace-app pricing |
| **Sustainability & Energy** (meters, AMR, carbon, SECR/ESOS packs) | From £150/site/mo, falling with volume (e.g. £60/site above 25 sites); a "Lite" version (manual meter readings and carbon report) at £30/site/mo for small estates | Keeps it affordable for multi-site schools and retailers |
| **IoT & Condition Monitoring** | £3 per device/mo | Plus partner hardware margin |
| **AI Pro** (extra credits, predictive maintenance, Ask-the-estate) | £10 per full user/mo, or credit packs (£50 / 1,000 credits) | Credits cover LLM costs with ≥ 70% margin |
| **SFG20 Connector** | £50/mo integration fee | Customer holds their own SFG20 licence |
| **Fleet** | £5 per vehicle/mo | |
| **SMS credits** | Pass-through + 30% | |
| **Extra storage** | £10 per 100 GB/mo | Included amounts are in the tier table |
| **Additional sandbox** | £500/mo | Enterprise |
| **Premium support / dedicated environment / UK data-residency guarantee** | Quoted | Enterprise |

## Discounts and commercial terms

| Term | Policy |
|------|--------|
| Education, charity and NHS | 20% off subscription (verified) |
| Multi-year | 2-year prepaid −5%, 3-year prepaid −10% |
| Design partners | 50% off Professional for year 1 (first 5 customers) |
| Annual price change | Price list reviewed yearly; existing contracts uplift by no more than CPI at renewal |
| Contract | Monthly plans cancel anytime; annual plans are 12-month commitments, no refunds mid-term; seats can be added anytime (pro-rated), reduced at renewal |
| Currency | GBP at launch; EUR and USD price lists when selling internationally |
| VAT | All prices exclude VAT; Stripe Tax applies UK VAT and handles reverse charge for EU business customers |

## FM-Provider Edition

FM providers' revenue scales with the clients they serve, so their pricing does too:

- Enterprise features + multi-client + client portal + performance deductions + client billing.
- **Platform fee** £750/mo + full/mobile users at Professional rates + **£40 per client contract per month** (client viewers free).
- Partner programme: a provider bringing clients onto the platform earns a discount or revenue share.

## Professional services (one-off revenue, also improves retention)

| Service | Indicative price |
|---------|------------------|
| QuickStart onboarding (remote, templates, 2 workshops) | £1,500 fixed |
| Standard implementation (data migration, config, training) | £5k–£25k |
| Enterprise implementation | Day rate £950, scoped |
| Data migration from legacy CAFM | £2.5k+ per source system |
| Asset tagging & survey (via partners) | Partner rate + margin |
| Custom integrations | Day rate |
| Training & certification ("Certified Super User" course) | £295 per person, online |

Target: services ≤ 20% of revenue. Services exist to make subscriptions succeed, not as a profit centre.

## Future revenue streams (Phase 5+)

1. **Contractor marketplace**: customers find and book vetted contractors; we take a **3–8% transaction fee** on jobs paid through the platform, or contractors pay a **Pro listing** (£39/mo) for visibility, lead alerts and multi-customer dashboard.
2. **Embedded payments**: pay contractor invoices in-platform (Stripe Connect); revenue from payment margin and early-payment financing partners.
3. **Integration marketplace**: partner-built apps with 20–30% revenue share.
4. **Benchmarking data product**: anonymised, aggregated, opt-in benchmarks (cost/m², PPM compliance by sector) sold as a premium insight add-on.
5. **Hardware bundles**: QR/NFC tags, kiosks, sensors via partners at a margin.

## Early revenue (before self-serve billing)

Payments through Stripe go live in Phase 5, but revenue should not wait that long. From Phase 1, design partners and pilot customers sign a simple order form and are **invoiced manually** (annual or quarterly). Their entitlements are set by platform admin, and they move onto Stripe when it launches.

## Billing implementation

- **Stripe Billing**: products/prices per tier, licence type and add-on; quantity-based subscriptions for seats; metered usage for AI credits, SMS and devices; UK VAT via Stripe Tax; invoices and card/BACS Direct Debit payment.
- **Enterprise**: invoiced annually (bank transfer) via Stripe invoices, PO numbers supported.
- **In-house entitlements service** (built Phase 0) is the source of truth for what a tenant can use; Stripe webhooks update it.
- **Seat counting**: active users by licence type per billing period. Prorated mid-term additions and true-up at renewal for annual plans. Admin UI shows seat usage.
- **Trials**: 14-day Professional trial with demo data option; no card required; convert to Free if not upgraded (data retained).
- **Dunning**: automated retries + emails → read-only mode after 14 days → suspension after 30 days → data retention 90 days → deletion (with export offered).
- **In-app upgrade prompts**: locked features visible with "Available on Professional" and a one-click trial of that tier.
- **Revenue metrics dashboard** (platform admin): MRR/ARR, new/expansion/contraction/churn, NRR, ARPA, trial conversion, seat growth.

## Go-to-market

| Motion | Segment | Tactics |
|--------|---------|---------|
| **Product-led** | SMB / Starter–Pro | Free tier, self-serve sign-up, public demo login, templates, SEO content on UK compliance ("legionella logbook template", "EICR codes explained"), comparison pages, free tools (compliance calendar generator) |
| **Sales-led** | Mid-market / Enterprise / FM providers | Outbound to estates directors and FM providers, demos, pilots (paid 90-day pilot credited to year 1), procurement-ready security pack |
| **Partner/channel** | All | FM consultancies, surveyors, IoT/BMS integrators, accountants (Xero ecosystem) resell/refer for 15–20% first-year commission |
| **Public sector** | Education, NHS, councils | **G-Cloud** listing (Crown Commercial Service), education frameworks, Cyber Essentials Plus as baseline |
| **Contractor network effect** | Contractors | Free portal → contractors invite their other customers → referrals |

## Unit economics targets

| Metric | Target |
|--------|--------|
| Gross margin (subscription) | ≥ 80% |
| CAC payback | < 12 months (SMB < 6) |
| LTV : CAC | ≥ 3 : 1 |
| Net Revenue Retention | ≥ 110% (driven by seats and add-ons) |
| Logo churn | < 1%/month SMB, < 8%/yr enterprise |
| Trial → paid conversion | ≥ 15% |
| Infrastructure cost | < 8% of revenue |

## Illustrative revenue scenario (for planning, not a forecast)

| Customer type | Example | ARR |
|---------------|---------|-----|
| Small school trust | 4 full + 6 mobile on Starter | 4×£29×12 + 6×£15×12 = **£2,472** |
| Mid-size commercial estate | 15 full + 25 mobile on Pro + Workplace (300 desks) | £10,620 + £8,700 + £7,200 = **£26,520** |
| FM provider | 60 full + 200 mobile, 40 client contracts | £9,000 + £42,480 + £69,600 + £19,200 = **£140,280** |
| Enterprise (university) | 80 full + 150 mobile on Enterprise + Energy (20 sites) + AI Pro | £85,440 + £81,000 + £36,000 + £9,600 = **£212,040** |

Year-3 aspiration (to validate), built bottom-up from the customer mix rather than a headline number:

| Segment | Customers | Average ARR | ARR |
|---------|-----------|-------------|-----|
| Small (Free → Starter) | 150 | £4,000 | £0.6m |
| Mid-market (Professional) | 100 | £25,000 | £2.5m |
| FM providers | 10 | £120,000 | £1.2m |
| Enterprise | 3 | £200,000 | £0.6m |
| **Total** | **~263** | | **~£4.9m** |

The plan should still work at half this (≈ £2.5m). That is the planning case for hiring and spend.

## Validation plan (before Phase 5 pricing goes live)
1. 15–20 discovery interviews across target segments; run Van Westendorp price-sensitivity questions.
2. Design-partner programme: 5 customers get Professional at 50% for year 1 in exchange for feedback and case studies.
3. A/B test pricing page presentation (not prices) once traffic exists.
4. Review pricing every 6 months against win/loss data.
