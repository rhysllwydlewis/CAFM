# ADR 0008: Build with scheduled agents that own paths, with human merge

- **Status:** Accepted (planning baseline) · 21 Nov 2026
- **Revisit:** if the context below changes

## Context

The product owner wants each element built, fixed and improved by its own scheduled agent.

## Decision

Use the agent model in doc 13: one agent per element with owned paths, one small draft PR at a time, a standard run protocol, a conductor for sequencing, and guardian agents for quality. Agents never merge; the product owner merges (D13).

## Consequences

- Parallel progress with low conflict risk.
- Requires a reliable test environment for agents (D15) and good test coverage from Phase 0.
- Run volume and cost are reviewed fortnightly (D14).
