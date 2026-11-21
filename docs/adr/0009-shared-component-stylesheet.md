# ADR 0009: The web app uses the mockups' component stylesheet, not Tailwind

- **Status:** Accepted · 22 Nov 2026 (product owner may revisit; see issue #18)
- **Amends:** ADR 0007 (the sentence "The web app's Tailwind theme is generated from the tokens") and doc 04 § Stack (UI row)

## Context

The plan said the web app would use Tailwind CSS and shadcn/ui, with a Tailwind theme generated from `design/tokens/tokens.json`. Phase 0 instead built the login page, choose organisation and the app shell on `packages/ui`, which imports the mockups' own component stylesheet (`design/mockups/src/styles.css`, built on `tokens.css`) and exposes React components using the same class names.

Keeping two styling systems (mockup CSS for the designs, Tailwind for the app) means two places to keep in line, and the design-fidelity checks (A92) compare screens built two different ways.

## Decision

- The web app styles components with the shared component stylesheet from `design/`, through `packages/ui`. No Tailwind.
- `design/mockups/src/styles.css` stays the single source for component styles; `packages/ui/src/styles.css` imports it and adds only interaction states the static mockups can't show (focus, hover, disabled, real form controls), using tokens only.
- Behaviour that is hard to get right (menus, dialogs, popovers, comboboxes) may use unstyled Radix primitives, styled with the shared classes.
- A new component starts as a mockup component in `design/mockups/src/lib.js` and `styles.css`, then gets a React wrapper in `packages/ui`.

## Consequences

- A screen and its mockup share one stylesheet, so they can't drift; A92's comparisons are like for like.
- No utility-class shortcuts in app code: layout helpers come from the shared stylesheet (`row`, `col`, `grid`, `stack`…), and one-off styles stay banned (CLAUDE.md).
- Fewer ready-made components than shadcn/ui; each new pattern costs a mockup first, which the design rules already require.
- If the product owner reverses this, the switch is contained to `packages/ui` and the screens built so far.
