# Architecture Decision Records

Significant technical decisions, one file each. To change a decision, add a new ADR that supersedes the old one (don't edit accepted ADRs other than their status).

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](0001-modular-monolith.md) | Modular monolith: NestJS API + Next.js web | Accepted |
| [0002](0002-multi-tenancy-rls.md) | Shared-schema multi-tenancy with PostgreSQL row-level security | Accepted |
| [0003](0003-custom-fields-jsonb.md) | Custom fields stored as JSONB with a metadata registry | Accepted |
| [0004](0004-identity-accounts-memberships.md) | Global accounts with per-tenant memberships | Accepted |
| [0005](0005-pwa-first-mobile.md) | PWA first, native mobile later | Accepted |
| [0006](0006-entitlements-independent-of-billing.md) | Entitlements are independent of Stripe | Accepted |
| [0007](0007-design-source-of-truth.md) | Design tokens and rendered mockups are the visual source of truth | Accepted |
| [0008](0008-scheduled-agents.md) | Build with scheduled agents that own paths, with human merge | Accepted |

Template: copy any ADR and keep the headings: Status, Context, Decision, Consequences.
