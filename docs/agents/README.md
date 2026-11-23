# Agents

Working files for the scheduled routines. The build runs on three of them (Builder, Reviewer, Steward): see [build-loop.md](build-loop.md). The long-term many-agent design is in [docs/plan/13-agent-schedules.md](../plan/13-agent-schedules.md).

| Path | Owner | Purpose |
|------|-------|---------|
| `lessons-learned.md` | Product owner | What was asked for, whether each request is delivered, what went wrong on day one and what changed. Read before changing the loop |
| `build-loop.md` | Product owner | The playbook all three routines read first: stages, resuming after a usage limit, limits, the Reviewer's pass, phase gate |
| `status.md` | A00 Conductor | Points to the live status board, a pinned GitHub issue the conductor updates daily |
| `notes/<ID>.md` | That agent only | The agent's notebook. Each run starts with no memory, so the notebook carries decisions, gotchas and the next candidate items between runs |
| `notes/_template.md` | A00 | Template for a new notebook |
| `labels.md` | A00 | GitHub labels the agents use |
| `routines.md` | Product owner | Copy-paste setup for the three routines (name, schedule, prompt) |

Agents never edit each other's notebooks. Anything another agent needs to know goes in an issue with that agent's label.
