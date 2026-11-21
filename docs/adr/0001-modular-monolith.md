# ADR 0001: Modular monolith: NestJS API + Next.js web

- **Status:** Accepted (planning baseline) · 21 Nov 2026
- **Revisit:** if the context below changes

## Context

A small team (and later scheduled agents) must build ~35 modules quickly, with strong consistency and shared rules for permissions, tenancy and configuration.

## Decision

Build one NestJS API with strict module boundaries (`apps/api/src/modules/<module>`), one Next.js web app and one BullMQ worker in a pnpm/Turborepo monorepo, all in TypeScript. Modules talk through service interfaces and domain events (outbox), never through each other's tables.

## Consequences

- One deployable keeps local development, testing and releases simple.
- Module boundaries map 1:1 to agent ownership (doc 13).
- IoT ingestion or reporting can be split into separate services later, only if measurements show the need.
- The risk of a 'big ball of mud' is controlled by lint rules on imports between modules.
