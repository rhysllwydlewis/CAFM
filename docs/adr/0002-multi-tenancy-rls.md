# ADR 0002: Shared-schema multi-tenancy with PostgreSQL row-level security

- **Status:** Accepted (planning baseline) · 21 Nov 2026
- **Revisit:** if the context below changes

## Context

Tenant data leakage is the highest-impact risk (R3). We need cheap onboarding of thousands of tenants, with optional dedicated databases for enterprise customers.

## Decision

Use a shared database and schema with `tenant_id` on every tenant-owned table. RLS policies use a transaction-local setting (`set_config('app.tenant_id', $1, true)`) applied by a Prisma client extension for every request. The application connects as a non-owner role so RLS cannot be bypassed. Queries with no tenant context return nothing (fail closed). Migrations and platform admin use separate roles.

## Consequences

- Defence in depth: app-level guards plus database enforcement.
- Must stay compatible with PgBouncer transaction pooling (no session-level SET).
- Every new table needs a policy; A91 checks this weekly.
- Dedicated-database tenants use the same code with a different connection.
