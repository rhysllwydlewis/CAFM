# Screen review pack

An annotated Word document of every rendered screen, for reviewing the design offline.

```bash
node docs/review/build-review-doc.js   # writes docs/review/CAFM-screen-review.docx
```

- `annotations.js`: what each screen shows and does (one entry per screen id; the build fails if a screen has no annotation).
- `build-review-doc.js`: builds the document from `design/mockups/screens.json` and `design/mockups/png/`.

The `.docx` is not committed (about 17 MB, and it duplicates the PNGs). Re-run the script after `npm run render` in `design/`.
