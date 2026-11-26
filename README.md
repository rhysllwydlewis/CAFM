# FM Stead

A cloud-based, multi-tenant Computer-Aided Facilities Management platform: helpdesk, reactive and planned maintenance, assets, statutory compliance, contractors, inventory, purchasing, finance, space, workplace booking, visitors, energy, real estate, capital planning, H&S, IoT, analytics and AI.

**Where the build is:** [docs/PROGRESS.md](docs/PROGRESS.md) has the current phase, a checklist for every phase and what's next.

**The plan:** [docs/plan/README.md](docs/plan/README.md) is the master plan (vision, full feature catalogue, roles and Super User capabilities, architecture, data model, login and demo, monetisation, roadmap, quality/security, risks).

**Design:** [design/](design/) holds the design tokens, 174 icons and 122 rendered screens. See [docs/plan/12-screen-catalogue.md](docs/plan/12-screen-catalogue.md).

**Working in this repo:** read [CLAUDE.md](CLAUDE.md), the rules for every agent and person. Codex and other agents start from [AGENTS.md](AGENTS.md), which points to the same rules. `source scripts/agent-setup.sh` sets up a working environment in one step. Architecture decisions are in [docs/adr/](docs/adr/README.md); the scheduled-agent build strategy is [docs/plan/13-agent-schedules.md](docs/plan/13-agent-schedules.md).

**Status:** Phase 0 (foundations) is done. That covers sign-in, roles and permissions, plans, audit, the worker, the app shell, the configuration engine and CI/CD. The live demo is at https://cafm-production.up.railway.app. Phase 1 is next; see [docs/PROGRESS.md](docs/PROGRESS.md) and [CHANGELOG.md](CHANGELOG.md).

**Run it locally:** Node 22, pnpm 10 and Postgres 16 (or `docker compose up -d`), then follow the commands in [CLAUDE.md](CLAUDE.md#commands) and open http://localhost:3000. Pick any demo account on the login page; the password for all of them is shown there.
