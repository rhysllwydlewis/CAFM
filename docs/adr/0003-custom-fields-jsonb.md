# ADR 0003: Custom fields stored as JSONB with a metadata registry

- **Status:** Accepted (planning baseline) · 21 Nov 2026
- **Revisit:** if the context below changes

## Context

The Super User must add fields to any entity without code changes or migrations (§0, doc 03).

## Decision

Each configurable entity has a `custom` JSONB column. Field definitions (type, validation, visibility, required-by-status) live in `field_definition`. Validation uses the same Zod schemas generated from definitions on the API, web and mobile. Frequently filtered fields get expression indexes, created automatically when a field is marked filterable.

## Consequences

- No per-tenant schema changes.
- Reporting reads JSONB through typed views.
- Plan limits on field counts are enforced by entitlements.
- Very large custom datasets may need a column-promotion path later.
