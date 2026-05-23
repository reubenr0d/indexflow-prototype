# Shared agent memory

Cross-agent blackboard used by every trading agent + their MCP servers. The
files in this directory are written from multiple processes (the agent
runner, the `yfinance-mcp` server, and the `vault-manager-mcp` server) and
committed back to `main` by the `commit-results` job in
[`.github/workflows/vault-agent.yml`](../../../.github/workflows/vault-agent.yml).

## Files

| Path | Owner | TTL | Purpose |
|---|---|---|---|
| `news-cache.<agentName>.json` | `yfinance-mcp` (called by agent runner) | 30 min (`NEWS_CACHE_TTL_MS_DEFAULT`) | Cached Yahoo news headlines per Yahoo symbol. Per-agent file so concurrent CI artifact uploads can never overwrite another agent's cache content. `yfinance_news` reads the union of all `news-cache.*.json` and only re-fetches symbols whose freshest cache entry is older than the TTL. |
| `recently-closed.<vaultAddress>.json` | `agent-runner.mjs` (every successful `close_position`) | 4 hours (`CHURN_GUARD_WINDOW_MS`) | List of `(assetId → {ticker, closedAt, closedReason, isLong})` entries the auto-exit / LLM-judged close just removed. Consulted by `plan_open_position` so the agent does not re-open a ticker the rank-swap pass just rotated out. |

All writes go through helpers in
[`apps/shared/agent-shared-memory.mjs`](../../../apps/shared/agent-shared-memory.mjs)
which:

- Filter expired entries on read so files cannot grow unboundedly.
- Use atomic write-temp-then-rename so a process kill mid-write cannot leave
  partial JSON behind.

## CI lifecycle

The `commit-results` job's pre-extract cleanup wipes per-agent memory
directories so a missing artifact cannot resurrect stale state, but it
explicitly **skips this `shared/` directory** so cache state survives the
fresh checkout that every CI matrix job starts from. Each agent's upload
step also includes `agents/memory/shared/` so per-agent contributions to
the cache make it into the merged commit.
