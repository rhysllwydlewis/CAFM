# ADR 0007: Design tokens and rendered mockups are the visual source of truth

- **Status:** Accepted (planning baseline) · 21 Nov 2026
- **Revisit:** if the context below changes

## Context

Many agents will build UI in parallel. Without a shared reference, screens drift apart.

## Decision

`design/tokens/tokens.css` (and the generated `tokens.json`) define every colour, size and radius. `design/mockups/` renders every screen from shared components, and `docs/plan/12-screen-catalogue.md` is generated from those definitions. The web app uses the same component stylesheet as the mockups (see [ADR 0009](0009-shared-component-stylesheet.md), which replaced the original plan of a Tailwind theme generated from the tokens). New UI patterns are drawn as mockups before they are built, and A92 compares built screens against them.

## Consequences

- One palette (Graphite + Petrol), checked for WCAG AA in light and dark themes.
- Mockups must be kept current: changing a design means changing the mockup source and re-rendering.
- Visual-regression testing has a clear baseline.
