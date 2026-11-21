# AGENTS.md

Instructions for AI coding agents (Codex, Claude and others) and people working in this repository.

**The rules live in [CLAUDE.md](CLAUDE.md). Read it in full: it applies to every agent, not only Claude.** This file only gets you started.

## Start here

1. Read [docs/PROGRESS.md](docs/PROGRESS.md). It shows where the build is, what's next, what's in progress and what's waiting on the product owner.
2. Read [CLAUDE.md](CLAUDE.md): sources of truth, non-negotiable rules, commands and the Definition of Done.
3. Run `source scripts/agent-setup.sh` for a working database, Redis, dependencies and demo data. It's safe to run again.
4. Check your branch and any open PR before you change anything.

## Before you stop

- **Checks:** run `pnpm lint && pnpm typecheck && pnpm test`, plus `pnpm build && pnpm e2e` for UI changes.
- **Progress:** tick finished items in `docs/PROGRESS.md` in the same PR. If you stop part-way, leave a note under "In progress" saying what's done, what's next and the branch.
- **Push:** commit and push your branch, and open a draft PR. Follow [docs/contributing/commits.md](docs/contributing/commits.md) for the title and commit messages.
- **Never** push to `main`, force-push a shared branch or merge your own PR.
