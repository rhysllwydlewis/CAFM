# Agents

Working files for the scheduled agents described in [docs/plan/13-agent-schedules.md](../plan/13-agent-schedules.md).

| Path | Owner | Purpose |
|------|-------|---------|
| `status.md` | A00 Conductor | Points to the live status board, a pinned GitHub issue the conductor updates daily |
| `notes/<ID>.md` | That agent only | The agent's notebook. Each run starts with no memory, so the notebook carries decisions, gotchas and the next candidate items between runs |
| `notes/_template.md` | A00 | Template for a new notebook |
| `labels.md` | A00 | GitHub labels the agents use |

Agents never edit each other's notebooks. Anything another agent needs to know goes in an issue with that agent's label.
