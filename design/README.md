# Design

The visual source of truth for the CAFM platform: design tokens, icon set, logo and 99 rendered screens.

- **Read first:** [docs/plan/11-design-system.md](../docs/plan/11-design-system.md) (decisions and rules) and [docs/plan/12-screen-catalogue.md](../docs/plan/12-screen-catalogue.md) (every screen).
- **Browse locally:** open `mockups/index.html` for a clickable gallery. Each screen's HTML is in `mockups/html/`. The HTML expects the Inter, Inter Display and JetBrains Mono fonts to be installed (free from Google Fonts); without them it falls back to system fonts.

## Layout

| Path | Contents |
|------|----------|
| `tokens/tokens.css` | Colour, type, spacing, radius, elevation, motion; light and dark themes |
| `tokens/tokens.json` | Same tokens as JSON (generated), for the Tailwind theme and mobile |
| `icons/svg/` | 172 icons, one SVG each (`currentColor`) |
| `icons/sprite.svg`, `icons/icons.json` | Symbol sprite and manifest (generated) |
| `icons/logo/` | Placeholder logomark variants |
| `mockups/src/` | Mockup stylesheet, HTML/SVG component builders, demo data |
| `mockups/screens/*.js` | One file per area; each exports its screens |
| `mockups/html/`, `mockups/png/` | Rendered output (generated) |
| `tools/` | Icon builder, renderer (Playwright), PNG compressor, contrast checker, catalogue generator |

## Commands

```bash
npm install
npm run icons      # rebuild icons, sprite, manifest and tokens.json
npm run render     # render all screens to HTML + PNG, then compress PNGs
npm run contrast   # WCAG contrast check of key colour pairs
node tools/catalogue.js   # regenerate docs/plan/12-screen-catalogue.md
```

`node tools/render.js <filter>` renders only screens whose id contains `<filter>`. The renderer warns when any screen or card overflows its container.

Icons from [Lucide](https://lucide.dev) are used under the ISC licence (`icons/LICENSE-lucide.txt`). Custom icons are original to this project.
