# Lessons learned: setting up the build loop

Written on 23 Nov 2026, the day the three routines (Builder, Reviewer, Steward) were set up and first run. It records what the owner asked for, whether each request is really delivered, what went wrong and what changed. Agents read it to avoid repeating the mistakes. The owner reads it to see what is still open.

## 1. What the owner asked for, and what delivers it

| What was asked | What delivers it | Status |
|---|---|---|
| A few routines (1 to 3), not dozens, each with a comprehensive prompt | Builder, Reviewer and Steward. The 45-agent roster in doc 13 was never run, so it is parked. | Done |
| Agents work through the phases and sub-phases without being told "continue" | The Builder works the approved phase in order. The Steward opens an "Approve Phase N" PR when a phase is complete. | Done. The owner still merges each phase approval. |
| Usage limits: carry on afterwards, don't lose work | Push after every slice, state in the PR Status block, a frequent schedule that resumes, a 90-minute heartbeat takeover. | Built and partly proven (a clean takeover worked). A real mid-run cut-off has not happened yet. |
| A separate pass after the work: look for anything missing, broken, wrong, low quality or buggy, **fix and improve it, and update the PR**, then end that session | The Reviewer, a different session, up to 2 rounds, fixing on the same branch. | Built. Its first real review is due. The prompt now says "fix and improve" explicitly. |
| No schedule where an agent never finishes and nothing finishes it | Caps on runs, rounds and retries; the Steward flags stalls at 24 and 48 hours; retries become `[owner]` after 3. | Done |
| The owner is not a coder: no review clicks that add nothing, no editing prompts by hand | The Reviewer merges when it is safe. Whole prompts are given as files to paste. Decisions are made by the Builder with safe defaults and recorded. | Done |
| No supervisor agent | The Steward's daily push is the heartbeat. If it doesn't arrive, look at the routines page. | Done. The first push is due on 24 Nov. |

## 2. What went wrong, and what changed

| What happened | Why | What changed |
|---|---|---|
| The Builder stopped after one slice of six | The prompt said to stop when unsure how much usage was left, and an agent is always unsure | "Not knowing is not a reason to stop. Everything pushed is safe." |
| The first PR failed CI on formatting | `pnpm format:check` ran in CI but was missing from the checks agents run before pushing | Added everywhere the checks are listed |
| The Builder wrote a heartbeat time that hadn't happened yet | Agents guess the time | All timestamps come from `date -u` |
| The Steward sent nothing on its first run | Nothing needed the owner, but silence looks like failure | It always sends a push, with "All quiet" on a quiet day |
| A half-built PR grew to about 2,400 lines | One PR per item | Batches of about 1,500 lines, one claim shared across the item's PRs |
| The Builder stopped to ask a product question that nobody saw | The question was left in a chat message | It picks the safest default, records it under "Decisions made", and keeps going. Only questions with no safe default become a `decision-needed` issue. |
| The owner merged a big PR before any review | The owner's instruction, reasonable given they can't read code | A `priority:now` issue (#45) for a post-merge review. Rule: if the owner overrides the loop, open that issue. |
| A PR could reach `main` with no review at all (an owner merge, or a missed run) | Nothing noticed | The Steward opens a `priority:now` review issue for any merged PR with no Review log. The Builder un-drafts a PR when it is ready, and the Reviewer reviews, fixes, improves and merges, usually in one pass. |
| The Builder skipped the owner's `priority:now` issue | The prompt ranked "continue a claimed item" above it | The owner's label now outranks everything except a red `main`, owner comments and in-flight PRs |
| A signed-off PR could sit unmerged for ever | The Reviewer signs off just after its last push, while CI is still running | `[retry]` lines, retried by a later run, capped at 3, then `[owner]` |
| Two PRs were signed off and green but waited 1 to 2 hours each (PRs 56 and 57, 23 Nov) | The Reviewer did not wait for CI after sign-off, merged one PR per run, and stopped when the first PR on its list was busy, so a merge-ready PR behind it was never looked at | The Reviewer waits up to 20 minutes for CI and merges in the same run, moves on to the next PR when one is busy, and may merge several clean, non-overlapping PRs in one run |
| The Builder skipped the mockup comparison and some Definition of Done basics | Nothing made it check its own work before review | A short own-check before every review, listing gaps honestly |
| Routines made from a chat session came with the wrong settings | A chat can't attach the repository or pick the environment, and attached 7 connectors by default | Create routines in the Routines form, with the repository and environment chosen. Remove connectors that aren't needed. |
| A prompt contained my own "create this task" wrapper text | I gave a message for a setup chat, and it was saved as the prompt | Give the whole prompt as a file, never a wrapper |
| A routine said "the CAFM service" but Railway has nine projects | Ambiguous name | The Railway project is named CAFM, and the prompt names it |
| An intermittent CI failure (the database package generating its client twice at once) | A race in the CI setup, not in the change | Passed on one re-run. If it recurs, open an issue. |
| Setup script failure on the first Steward run | Ubuntu's package mirror timed out | Not yet fixed: needs the script, so apt retries |
| I told the owner a prompt was old when it had already been updated, and misjudged times more than once | I answered from memory instead of checking | Check the saved state and the clock before stating either |
| A clean PR (#46) was stuck on "waiting for DeepSource" for over an hour | DeepSource was never switched on for this repository, so the merge condition could never be met | A merge condition now applies only while its tool is switched on, and the Reviewer says so once in the Review log |
| Two PRs (#56, #57) signed off and green waited one to two hours each | The Reviewer did not wait for CI after sign-off, merged one PR per run, runs are hourly, and it stopped when the first PR on its list was busy | The Reviewer waits up to 20 minutes for CI and merges in the same run, moves on when a PR is busy, and may merge several clean PRs per run |
| PR #57 went from merge-ready to conflicting after PR #56 merged first, and was on retry 2 of 3 | Every PR edits `docs/PROGRESS.md` and `CHANGELOG.md`, so any two PRs ready together conflict | The Reviewer resolves a tracker-only conflict itself and carries on to the merge. A conflict in a code file goes back to the Builder, which resolves it by reading both sides and returns the PR to review |
| A red CI run on a ready PR (#51) had no owner | Found by reading the rules, not by a failure: the Builder stops at its first check when two PRs are waiting, before it reaches its "fix a failing PR" rule, and the Reviewer cannot re-run CI. The owner re-ran it by hand | A ready PR with red checks is waiting on the Builder, not the owner. A setup failure is re-run once, then fixed at the cause |
| Agents' comments looked like the owner's | The routines run as the owner, so every reply or comment they post shows the owner's name. The rules "owner comments outrank everything" and "no unanswered owner comment before merging" could not tell the two apart | Agent comments end with the Claude Code footer, and the rules say a comment with that footer is never an owner comment |
| The Steward's unreviewed-merge check would have opened up to four false `priority:now` issues on its first run (for PRs 41, 44 and 55, which the owner directed, and a duplicate for 43, whose review issue was already closed) | It looked at every merged PR, not just loop PRs, and treated a closed issue as no issue. The owner's own PRs about the routines and CI have no Reviewer pass by design | It checks loop PRs (branch `claude/build-*`) only, and an issue that already mentions the PR number, open or closed, counts as handled |
| A signed-off PR could be missed for ever if the Reviewer was cut off right after signing off | The Reviewer only looked at ready PRs that already had a "retry" line | It also takes a ready PR with no "Not merged because" line, and leaves any marked for the owner alone |
| I told the owner about stale open Phase 0 issues and a demo database that needed seeding, and both were wrong | I listed issues without filtering to open ones (the list included closed issues), and I had not read the deploy script, which reseeds the demo on every deploy | Both removed. Re-checked every claim against the data before the owner pasted anything |
| Two finished PRs (#77, #78) sat unmerged for about six hours and nothing was merged from 10:00 to 16:00 on 24 Nov, though six PRs had merged overnight | A flaky browser test turned `main` red. The Reviewer retried, and each event-started run raised the retry count, so both PRs reached 3 of 3 within an hour and were marked for the owner, who was away. `main` went green again at 12:34 after a re-run, but the Reviewer's list skips every [owner] PR. The Builder stopped at its first check (two PRs waiting) and never reached its "fix main" rule | A retry counts only for the PR's own CI, at most once an hour. A PR held only because `main` is red is marked [waiting], never [owner], and is picked up again when `main` is green. The Builder goes straight to fixing a red `main`. The Steward resets a stale [owner], re-runs a red `main` once, reports ready PRs older than 3 hours, and now runs every three hours, pushing only when something is wrong (plus a morning digest) |
| An intermittent typecheck failure ("PrismaClient has no exported member") on two PRs | One CI step regenerated the Prisma client while others were reading it | Fixed at the cause in PR 55 (issue 53). Typecheck waits for the one build that generates the client |

## 3. Rules these lessons give us

1. **Trace every request to a mechanism.** Before calling a design finished, list what the owner asked for and point at what delivers each item.
2. **Test the first run of every routine, and fix before it runs for days.** Most problems above were found within two hours.
3. **Prompts must have one clear priority order.** Check every pair of rules for conflicts, as in the 3b-before-4 mistake.
4. **A prompt is a promise, not a lock.** Where it matters, add a real control: connector tool permissions, GitHub branch protection.
5. **Anything an agent needs to say must go where the owner looks:** the PR body, an issue, or the Steward's push. Never only a chat message.
6. **Never leave a state that can't finish.** Every wait needs a cap and an owner.
7. **Whole files to paste, never edits inside a prompt.**
8. **Check the clock and the saved state before stating them.**
9. **Whatever reaches `main` gets reviewed.** A tripwire (the Steward) catches anything that skipped the Reviewer.
10. **Test a platform feature before designing around it.** "Start the Reviewer when a PR is taken out of draft" looked doubtful, so we read the documentation and then tested it on a throwaway PR. It works, and so do labels and pushes. See "How each routine starts" in the playbook.
11. **Every condition in a loop must be satisfiable.** Check each merge condition against the real world, not the design. DeepSource looked like a safety check and was a dead end, because it was never switched on.
12. **Measure idle time, not just work.** The loop was built to be safe, and was slow in the gaps: waiting for the next hourly run, one merge per run, a busy PR blocking a ready one. Time from "done" to "merged" is the number to watch.
13. **Give every conflict an owner.** Files every PR touches (the tracker and changelog) will conflict. Say who resolves it, and keep mechanical conflicts away from full re-reviews.
14. **Keep two independent reviewers.** The Codex bot found real problems (a teams list that ignored a role's data scope, a deactivated member who could not be removed, a printed label that could not be scanned), and the Reviewer found others itself (a double tap that queued a sign-off twice, a previous person's jobs left on a shared phone). The Reviewer verifies each Codex finding before acting. Neither alone is enough.
15. **A cancelled run is not a red one.** When two merges land minutes apart, GitHub cancels the first CI run on `main` (it happened twice). "Main is green" means the newest run that finished.
16. **Everything posted by a routine carries the owner's name.** Sign what agents write, and write rules about "the owner's words" in terms of the signature, not the account.
17. **Re-check your own claims before the owner acts on them.** Query the same state you would act on, with the same filters, and read the code that decides the answer. Two of this evening's claims failed that test.
18. **A cap that counts attempts must not count cheap ones.** Runs are cheap and frequent (every event starts one), so three retries were used up in under an hour. Count per hour and per cause, and never turn a problem outside the PR into the owner's job.

## 4. What the first evening of running showed (23 Nov 2026)

Measured from the repository after about twelve hours of the loop running, about five of them with the later prompts.

| Measure | Result |
|---|---|
| Loop PRs merged | 11 (mobile app complete, saved views API and view bar, admin console users, roles and teams) |
| Time from PR opened to merged | 1 to 3 hours for the first four (#43, #46, #51, #56). Since the Reviewer began waiting for CI, 26 to 57 minutes for #54 and #59 to #63. The one outlier since then, #57 at 3 hours, was a conflict |
| Real defects found by review before merge | By the Reviewer: a previous person's jobs staying on a shared phone, a sign-off queued twice by a double tap. By the Codex bot, verified and fixed by the Reviewer: a teams list ignoring a role's data scope, a deactivated team member who could not be removed, an admin layout that blocked read-only roles, printed labels that could not be scanned |
| A Builder run with nothing to do | The one seen (22:17) exited in 21 seconds, so the two-hour schedule costs little when two PRs are waiting on review |
| CI failures that were not the change | 2 (the Prisma race), fixed at the cause |
| Main CI runs cancelled by back-to-back merges | 2 (the later run covers them) |

What this says: the loop works and the independent review is catching real problems. The remaining waste was in the gaps between steps, which is what rules 12 and 13 are about.

## 5. Still open

- **Branch protection on `main`** requiring the main checks to pass. The one control that can't be talked around, and more urgent now: about a dozen merges have reached `main` and the live demo with no person in the loop, and every merge shows the owner as the merger, because the routines run as the owner. Owner setting.
- **The environment setup script** needs a retry for `apt`, so a mirror outage can't stop every routine.
- **Tool-level limits on the Reviewer's Railway and DeepSource connectors** (read-only). Owner setting, if the connector settings allow it.
- **The first real usage-limit cut-off and takeover.** Not seen yet: every run so far has finished.
- **A second Steward run.** One digest a day is thin when about ten PRs merge in five hours. An evening run costs little.
- **The Steward's first morning push** on 24 Nov at 07:45.
- **Cadence and usage.** A Builder run costs about $1.2 to $1.4 of usage at list price. At every 2 hours that is a lot of the owner's allowance. Decide whether to slow it down.
- **Owner-only items** are skipped by the Builder: P1-13, P2A-12, the penetration test in P4-14, P5-12 and the live Stripe switch-over in P5-01. They are listed under "Waiting on the product owner" in `docs/PROGRESS.md`.
