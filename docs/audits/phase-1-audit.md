# Phase 1 audit

Done on 27 Nov 2026 against `main` at commit 1afc3a8 (PR 119), at the product owner's request, before Phase 2A is approved. The question was whether everything Phase 1 was meant to hold is really there, whether anything was ticked or merged too early, and whether anything is broken, wrong or low quality.

## Result in one paragraph

Phase 1 is in better shape than the tracker alone could show. Every ticked item I checked has working code, an API test file and, for screens, an end-to-end test. The whole build and test suite passes. The audit found one real bug (the phone scanner could never start), several wrong notes in the docs, and a set of things the plan asks for that nothing tracked. The bug and the notes are fixed in the mop-up PR. The rest are issues for you to decide on or for the Builder to pick up.

## What was checked, and what passed

| Check | Result |
|---|---|
| `pnpm format:check`, `lint`, `typecheck`, `build` | All pass |
| `pnpm test` | 489 API tests (53 files), 44 database tests, 18 worker tests and 13 config-engine tests, all pass |
| `node scripts/progress.mjs check` | Consistent |
| CI on `main` | The last four runs were green |
| Skipped or disabled tests | None. Three tests skip on purpose for one screen size only (a keyboard shortcut on desktop, the phone layout on a phone) |
| Row-level security | `rls.test.ts` checks every table in the database and it passes, so no tenant table is missing a policy |
| Permissions on API endpoints | 252 routes. 205 carry a permission or feature check. Of the other 47, I read the ones that touch tenant data (saved views, the home summary, asset scan, notifications) and each is guarded in its own code. The rest are sign-in, password reset, invitations, the contractor magic links and the person's own account, which are meant to be open to that person only |
| Ticked items against the plan | For P1-01 to P1-08, P1-10, P1-11 and P1-12 I checked that each has code, API tests, an end-to-end spec where it has screens, and a guide. I did not trace every sub-item to a line of code. P1-09 and P1-13 are rightly left unticked |
| Merged without a Reviewer sign-off | PR 43, 69, 82 and 106. Re-read against current `main` and listed in issue 126. PR 69 changed one tracker row only, so there was nothing to review. PR 82 is clean apart from one cosmetic note. PR 106 had two problems, already fixed by PR 107. PR 43 (the mobile API) has one decision (who sees site access notes on the phone) and a few smaller items, all in issue 126 |

## Found and fixed in the mop-up PR

1. **The phone scanner could never start.** The site sent a header that switches the camera off for the whole site, but the phone app's scan screen needs it to read QR labels. People would only ever have seen the "type the number" fallback. The header now allows the camera for this site only. An end-to-end test checks it.
2. **Wrong "not built yet" notes in the guides.** The admin guide said scoping by team and enforcing MFA were not built (both are), and still described itself as a first part. The planned maintenance guide said the calendar view was not built (it is). A comment in the database schema said the same about MFA. All corrected.

## Found and raised as issues

3. **"Allow view as user" is missing.** The security screen mockup has an organisation setting that switches "view as user" on or off. The admin guide said it would come with the security settings, but it did not. Today anyone with the impersonate permission can use it. It needs a small database change, so it goes through the Builder and Reviewer.
4. **Security work that the plan asks for from Phase 1 is not there.** A content security policy on the web app, automated dependency updates, code scanning (CodeQL), the OWASP ZAP scan in CI, and request IDs in the API logs. The plan (doc 09) lists these. Some of this lives in `.github/`, which the routines can't change, so you will need to merge those parts.

## Needs your decision

5. **Features the feature catalogue marks Phase 1 that are in neither the roadmap's Phase 1 list nor the tracker.** None of these were ever claimed, so nothing says they were skipped on purpose:
   - Helpdesk: automatic assignment rules, guided triage scripts, announcements to requesters, logging a request on behalf of someone and VIP requesters, a knowledge base to answer before logging.
   - Work orders: job templates and bulk create across sites, follow-on works, recall and callback tracking, root cause and failure codes, a quote-required flag, sub-tasks and multi-resource jobs, geo-verified arrival, risk assessment and RAMS acknowledgement as a step.
   - Locations: site photos and documents.
   - Assets: transfers, loans and check-out, linked documents such as O&M manuals, reliability figures (MTBF and MTTR), and the F-Gas refrigerant fields.
   - Planned maintenance: combining tasks into one visit, grouping by route, missed-visit reasons, recording asset condition at each visit, and drag to reschedule.

   For each one, say build now, defer to a named later phase, or drop. The deferred ones then go on the list in `docs/PROGRESS.md`.
6. **Parts used on the technician's complete screen.** The phone app cannot record parts because technicians don't hold the cost permission. The guide says this waits for an owner decision. It is now on the "Waiting on the product owner" list.

## Already open

- Issue 120: force a password change at first sign-in for generated passwords (a known gap on P1-09f).
- Issue 104: people who import data can't find the import screen (needs a mockup first).

## Not checked

- I did not read every one of the 252 routes, and I did not confirm that each endpoint has its own cross-tenant denial test. The tests that exist pass, and the database-level policies are checked for every table, but the plan asks for a denial test per endpoint and that is not proven here.
- I did not open every screen next to its mockup at phone and desktop width in light and dark. The end-to-end suite and its axe checks cover a lot of that, but not every screen.
- Nothing was checked on the live demo or on Railway, so the deployment's health is unchecked.
