# ADR 0004: Global accounts with per-tenant memberships

- **Status:** Accepted (planning baseline) · 21 Nov 2026
- **Revisit:** if the context below changes

## Context

People (especially contractors and consultants) work for several organisations. One email in several tenants made password checks ambiguous in the first draft of the plan.

## Decision

Use a global `account` (email, password, MFA, sessions) with one `membership` per tenant (roles, licence, settings). The web app uses cookie sessions on the same site as the API. Mobile, offline PWA and API clients use OAuth 2.0 with PKCE and rotating refresh tokens. Username-only accounts are tenant-scoped and sign in at the tenant's own URL. SSO/SCIM come in Phase 5, and an SSO-enforcing tenant redirects its members.

## Consequences

- Contractors get one login across customers (§8).
- The strictest tenant policy (MFA, timeouts) applies on entry.
- Most foreign keys point to `membership`, not `account`.
