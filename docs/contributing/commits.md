# Commits, branches and pull requests

Short rules so the history on `main` reads as a plain list of what changed.

## Commit messages and PR titles

- **Say what the change does, in the imperative and sentence case:** "Add reference numbering", "Fix the phone menu hiding Sign out".
- **Keep the subject to 72 characters or fewer, with no full stop at the end.**
- **An area prefix is fine when it helps:** "Phase 0: sign-in API with cookie sessions", "Config engine: roll back a field". Don't use type prefixes such as `feat:` or `fix:`.
- **Use the body for the why:** what was wrong or missing, and anything a reviewer should check. Wrap it at about 72 characters.
- **Reference issues** in the PR description, with `Closes #17` for the issue it finishes.
- **Use UK English and plain wording** (doc 11 "Voice"). Don't add model or tool names to commit messages or code.

PRs are squash-merged, so the PR title becomes the commit on `main`. The **PR title** check in CI enforces the first two rules and the prefix rule. Mark unfinished work as a draft PR rather than putting "WIP" in the title.

## Branches

- **Agents:** `agent/<ID>-<short-slug>` (doc 13), for example `agent/A12-sla-pause-reasons`.
- **People:** `<name>/<short-slug>`.
- **Never** push to `main` or force-push a shared branch.

## Pull requests

- **Fill in the template** (`.github/pull_request_template.md`): plan references, screenshots against the mockup for UI changes, and the checks you ran.
- **Include a `Progress:` line**, which the **Progress** check requires: `Progress: P1-02 done`, `Progress: P1-02 in progress` or `Progress: none - <reason>`, with `docs/PROGRESS.md` updated to match. See [AGENTS.md § Progress rules](../../AGENTS.md#3-progress-rules-mandatory-checked-by-ci).
- **Keep the scope cohesive.** Phase 1 PRs deliver a capability together with its tests and docs. Use focused commits and list the roadmap items in the PR.
- **Add a CHANGELOG line** under "Unreleased" for anything people using CAFM will notice.
- **CI must be green:** lint, format, typecheck, tests, build, e2e with axe, design checks, the container image, the PR title and progress. Never skip or weaken a test to get there.
