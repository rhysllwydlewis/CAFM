# ADR 0006: Entitlements are independent of Stripe

- **Status:** Accepted (planning baseline) · 21 Nov 2026
- **Revisit:** if the context below changes

## Context

Modules must be plan-gated from day one, but payments only go live in Phase 5. Pilots are invoiced manually.

## Decision

An in-house entitlements service (plan → feature keys and limits, plus tenant overrides and add-ons) is the source of truth, checked with `feature()` in the API, UI and workers. Stripe updates entitlements through webhooks in Phase 5; it never gates features directly.

## Consequences

- Manual invoicing works before Stripe.
- Custom enterprise deals are overrides, not new Stripe products.
- Billing outages cannot lock customers out of features.
