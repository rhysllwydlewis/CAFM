# 10 · Risks & Open Decisions

## Key risks

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|-----------|------------|
| R1 | **Scope is enormous** ("every feature"), so delivery stalls before anything is sellable | High | High | Strict phase gates; Phase 1 MVP is sellable on its own; the config engine makes later modules faster; the feature catalogue is the backlog, not a single release |
| R2 | Configurability makes the product complex and slow | High | Medium | Config engine designed and performance-tested in Phase 0–1; sensible defaults and industry templates; limits on rules per entity |
| R3 | Tenant data leakage | Critical | Low | RLS with transaction-local tenant context, non-owner DB role, app-level guards, automated cross-tenant tests on every endpoint, pen tests |
| R4 | Offline mobile sync conflicts corrupt data | High | Medium | Mutation queue with idempotency keys and versions; server-authoritative status changes; conflict UI; extensive offline tests |
| R5 | Incumbents compete on price / bundle | Medium | Medium | Differentiate on UX, speed to value, UK compliance depth, FM-provider features, transparent pricing |
| R6 | SFG20 / third-party content licensing | Medium | Medium | Customer brings own SFG20 licence; pursue official integration partnership; ship own generic task library |
| R7 | AI costs erode margins | Medium | Medium | Credit-based metering, caching, smaller models for simple tasks, per-tenant cost monitoring |
| R8 | Enterprise procurement demands certifications we lack | High | High (enterprise) | Cyber Essentials in Phase 2A; ISO 27001 by Phase 5; security pack and DPA ready from first sale |
| R9 | CAD/BIM import complexity | Medium | High | Start with PDF/SVG overlays and DXF; DWG via a conversion service; IFC via open-source viewer |
| R10 | Data migration from legacy systems is slow | Medium | High | Import toolkit with mapping templates per common competitor export; paid migration service |
| R11 | Demo credentials leak into production, or the shared demo is vandalised or used to spam | High | Low | `DEMO_MODE` enforced server-side and absent from prod config; automated test; demo guard rails (locked credentials, captured email, nightly reset); personal demo clones in Phase 5 |
| R12 | **Compliance templates are wrong or out of date** (legislation changes, nation differences), and a customer relies on them | High | Medium | Templates reviewed by a qualified person (e.g. chartered building-services engineer or H&S consultant) before publishing; legislation reference and review date on every template; annual review cadence plus alerts on major law changes; terms make clear that the customer remains the duty holder |
| R13 | No revenue until Phase 5 billing | High | Medium | Manually invoiced design partners from Phase 1 (doc 07); pilots priced, not free |
| R14 | Key-person dependency (small team) | High | Medium | Everything documented here and in ADRs; infrastructure as code; automated tests as the safety net |
| R15 | Regulatory shifts in target sectors (e.g. Awaab's Law phases, Building Safety Act secondary legislation) | Medium | High | Configurable timescales and templates, not hard-coded rules; watch list of upcoming changes reviewed quarterly |
| R16 | Scheduled agents collide (two agents edit the same files) or drift from the plan and designs | High | Medium | Path ownership per agent, one open PR per agent, conductor agent sequences shared changes, design-fidelity agent compares against the mockups; see [doc 13](13-agent-schedules.md) |
| R17 | Agent runs cost more than they deliver, or produce large low-quality changes | Medium | Medium | Small PRs only (size cap), human review before merge, run budget per agent per week, agents paused when their PR is waiting on review |
| R18 | Design and plan diverge over time (docs say one thing, renders and code another) | Medium | High | Screen catalogue generated from the screen definitions; docs agent checks numbers and names each week; this doc set is the single source of truth |

## Decisions needed from the product owner

Each has a recommended default so work can continue if no answer is given.

| # | Decision | Recommendation (default) |
|---|----------|--------------------------|
| D1 | **Product name and domain** | Use the placeholder "CAFM" and the reserved `demo.example` demo addresses until named; rename is cheap if done before Phase 5 |
| D2 | **First target segment**: in-house estates teams or FM service providers? | Build for both from the data model up (client dimension exists from Phase 0), market to **in-house mid-market first**, and launch the FM-provider edition in Phase 4 |
| D3 | **Hosting**: Railway or AWS from day one? | Railway now (speed, cost); AWS London when the first public-sector/NHS or enterprise contract, or ISO 27001, requires UK-only hosting |
| D4 | **Pricing hypothesis** in [07](07-monetisation.md) | Accept as a working hypothesis; validate with design partners before Phase 5 |
| D5 | **Design partners**: do you have early customers/contacts? | Recruit 3–5 for Phase 1 feedback, on paid (discounted) pilots |
| D6 | **Branding**: colours, logo, tone | Neutral professional palette until branded |
| D7 | **AI provider and on/off by default** | AI features on by default in demo, opt-in for customer tenants |
| D8 | **Native mobile timing** | PWA first; native in Phase 5 (earlier if customers demand app-store presence) |
| D9 | **Languages beyond English** | en-GB at launch; Welsh as first additional language (public sector in Wales) |
| D10 | **Team**: solo with AI assistance, or hiring? | Plan assumes a small team with AI assistance; estimates re-baselined per phase |
| D11 | **Which sector pack first** (housing, healthcare, education)? | Education or housing, whichever the first design partners come from |
| D12 | **Compliance content reviewer** | Engage a qualified consultant part-time before Phase 2A templates are published |
| D13 | **Agent autonomy**: may agents merge their own pull requests? | No. Agents open draft PRs; the product owner (or a named reviewer) merges. Revisit after Phase 1 for low-risk changes (docs, tests) |
| D14 | **Agent cadence and budget** | Start with the Stage 1 agents in [doc 13](13-agent-schedules.md) (about 30 runs a week), review cost and output after two weeks, then add agents stage by stage |
| D15 | **Agent environment**: how agents get Postgres and Redis for tests | A cloud environment with a setup script that installs Postgres 16 and Redis, created in Phase 0 and shared by all agent schedules |

## Immediate next steps

1. Review this plan and answer (or accept defaults for) D1–D15.
2. Start **Phase 0**: scaffold the monorepo, CI, database with RLS, auth, and the **login page with demo credentials**.
3. Generate the Phase 0–1 GitHub issues from the feature catalogue.
4. Review ADRs 0001–0008 in `docs/adr/`.
5. Set up the agent prerequisites in [doc 13](13-agent-schedules.md) §6, then switch on Stage 0 agents.
