# Homepage v1: the flight over a demo estate

The first FM Stead homepage, archived on 27 Nov 2026 when it was replaced by the London film homepage. Nothing here is built or served: it is kept so the work is not lost and can be brought back.

## What it was

One flight over a demo estate (a city square, up a tower, over the roof plant and across a twelve-site district at night), played by scrolling. The flight was 200 WebP frames drawn on a canvas, with chapters, callouts, an altitude readout and a stage rail laid over it.

| File | What it is |
| --- | --- |
| `homepage.tsx`, `home.module.css` | The page markup and styles |
| `film.ts` | The scroll engine: scroll position to frame, plus everything laid over it |
| `film-content.ts` | The words, stops and callouts, and where the frames were |
| `frames/` | The 200 frames (`f0001.webp` to `f0200.webp`), about 11 MB |
| `homepage.spec.ts` | Its end-to-end tests |

## Bringing it back

1. Move `homepage.tsx`, `home.module.css`, `film.ts` and `film-content.ts` into `apps/web/app/(marketing)/`.
2. Move `frames/` to `apps/web/public/homepage/frames/` and `homepage.spec.ts` to `apps/web/e2e/`.
3. Remove the new homepage's files there first (`scroll-scrub.tsx`, `home-content.ts`) and restore the old `page.tsx` from git history (`git show c0a7b0b:'apps/web/app/(marketing)/page.tsx'`: that is the last commit that changed it before the replacement).
4. In `apps/web/e2e/login.spec.ts`, change `page.locator('#ground')` back to `page.locator('[data-hero]')`.

The design mockups for it were `marketing-02-homepage` and `marketing-03-homepage-flight` in `design/mockups/screens/13-marketing.js`.
