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
| The Builder skipped the owner's `priority:now` issue | The prompt ranked "continue a claimed item" above it | The owner's label now outranks everything except a red `main`, owner comments and in-flight PRs |
| A signed-off PR could sit unmerged for ever | The Reviewer can't wait for CI after it pushes a fix | `[retry]` lines, retried by a later run, capped at 3, then `[owner]` |
| The Builder skipped the mockup comparison and some Definition of Done basics | Nothing made it check its own work before review | A short own-check before every review, listing gaps honestly |
| Routines made from a chat session came with the wrong settings | A chat can't attach the repository or pick the environment, and attached 7 connectors by default | Create routines in the Routines form, with the repository and environment chosen. Remove connectors that aren't needed. |
| A prompt contained my own "create this task" wrapper text | I gave a message for a setup chat, and it was saved as the prompt | Give the whole prompt as a file, never a wrapper |
| A routine said "the CAFM service" but Railway has nine projects | Ambiguous name | The Railway project is named CAFM, and the prompt names it |
| An intermittent CI failure (the database package generating its client twice at once) | A race in the CI setup, not in the change | Passed on one re-run. If it recurs, open an issue. |
| Setup script failure on the first Steward run | Ubuntu's package mirror timed out | Not yet fixed: needs the script, so apt retries |
| I told the owner a prompt was old when it had already been updated, and misjudged times more than once | I answered from memory instead of checking | Check the saved state and the clock before stating either |

## 3. Rules these lessons give us

1. **Trace every request to a mechanism.** Before calling a design finished, list what the owner asked for and point at what delivers each item.
2. **Test the first run of every routine, and fix before it runs for days.** Most problems above were found within two hours.
3. **Prompts must have one clear priority order.** Check every pair of rules for conflicts, as in the 3b-before-4 mistake.
4. **A prompt is a promise, not a lock.** Where it matters, add a real control: connector tool permissions, GitHub branch protection.
5. **Anything an agent needs to say must go where the owner looks:** the PR body, an issue, or the Steward's push. Never only a chat message.
6. **Never leave a state that can't finish.** Every wait needs a cap and an owner.
7. **Whole files to paste, never edits inside a prompt.**
8. **Check the clock and the saved state before stating them.**

## 4. Still open

- **Branch protection on `main`** requiring the main checks to pass. The one control that can't be talked around. Owner setting.
- **The environment setup script** needs a retry for `apt`, so a mirror outage can't stop every routine.
- **Tool-level limits on the Reviewer's Railway and DeepSource connectors** (read-only). Owner setting, if the connector settings allow it.
- **The first real Reviewer review and merge** (PR #46), then the first real usage-limit cut-off and takeover.
- **The Steward's first morning push** on 24 Nov at 07:45.
- **Cadence and usage.** A Builder run costs about $1.2 to $1.4 of usage at list price. At every 2 hours that is a lot of the owner's allowance. Decide whether to slow it down.
- **Owner-only items** are skipped by the Builder: P1-13, P2A-12, the penetration test in P4-14, P5-12 and the live Stripe switch-over in P5-01. They are listed under "Waiting on the product owner" in `docs/PROGRESS.md`.
