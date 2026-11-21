# CAFM

A cloud-based, multi-tenant Computer-Aided Facilities Management platform: helpdesk, reactive and planned maintenance, assets, statutory compliance, contractors, inventory, purchasing, finance, space, workplace booking, visitors, energy, real estate, capital planning, H&S, IoT, analytics and AI.

**Start here:** [docs/plan/README.md](docs/plan/README.md) is the master plan (vision, full feature catalogue, roles and Super User capabilities, architecture, data model, login and demo, monetisation, roadmap, quality/security, risks).

**Design:** [design/](design/) holds the design tokens, 172 icons and 106 rendered screens. See [docs/plan/12-screen-catalogue.md](docs/plan/12-screen-catalogue.md).

**Working in this repo:** read [CLAUDE.md](CLAUDE.md). Architecture decisions are in [docs/adr/](docs/adr/README.md); the scheduled-agent build strategy is [docs/plan/13-agent-schedules.md](docs/plan/13-agent-schedules.md).

Status: Phase 0 under way. The monorepo, Postgres with row-level security, sign-in and the login page with demo accounts are built; see [CHANGELOG.md](CHANGELOG.md).

**Run it locally:** Node 22, pnpm 10 and Postgres 16 (or `docker compose up -d`), then follow the commands in [CLAUDE.md](CLAUDE.md#commands) and open http://localhost:3000. Pick any demo account on the login page; the password for all of them is shown there.
