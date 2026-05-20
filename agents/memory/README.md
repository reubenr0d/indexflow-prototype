# Agent memory

This folder is the **source of truth** for agent state across runs. The
contents are tracked in git and CI commits updates back to the default
branch after every scheduled run — see
`.github/workflows/vault-agent.yml` for the `commit-results` job.

Layout:

- `<agent>/state.json` — last known vault address, deployment
  fingerprint, current thesis, and timestamps. The agent runner is the
  sole writer.
- `<agent>/run-log.<network>.jsonl` — append-only structured log of
  every run on a given network (e.g. `run-log.sepolia.jsonl`). One JSON
  object per line containing the agent's summary, thesis and actions
  taken. Useful for audit and for prompting future runs with `recent
  runs` context.
- `<agent>/archive/` — rotated state from a previous deployment
  fingerprint. The runner moves the old `state.json` here when the
  deployment context changes so we never silently lose history.

See `docs/AGENTS_FRAMEWORK.md` for the full lifecycle.
