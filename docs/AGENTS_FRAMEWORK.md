# Multi-Agent Framework

Define autonomous vault management agents as markdown files. Each agent gets its own vault (auto-deployed on first run), persistent memory across cron runs, and access to MCP tool servers for on-chain operations and market data. Prompt/body edits reuse the remembered vault unless the deployment context changes or memory is missing. No JavaScript required.

## Quick Start

The shipped agent is `vault-manager`. It uses OpenAI (or any OpenAI-compatible chat-completions endpoint) for inference and signs transactions directly with the keeper `PRIVATE_KEY` via `cast send`.

```bash
# Install MCP server deps (one-time)
npm --prefix apps/mcps/vault-manager install
npm --prefix apps/mcps/yfinance install

# Run the vault manager agent
LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent:vault

# Dry-run mode (observe only, no on-chain writes)
npm run agent:vault:dry

# Run any agent by name
npm run agent:run -- vault-manager

# Non-interactive auto-execute override (disabled by default)
AGENT_NON_INTERACTIVE_WRITE_EXECUTE=1 LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent:run -- vault-manager
```

On first run, the agent automatically deploys its own vault. Subsequent runs manage that vault using saved memory. Editing the agent `.md` prompt/body does not create a replacement vault on its own.

---

## Creating a New Agent

1. Create a markdown file at `agents/<name>.md`
2. Add YAML frontmatter with config (skills, MCP servers, vault name, fees, write tools)
3. Write the system prompt as the markdown body (identity, strategy, rules)
4. Add a `## User Prompt` section at the end with the initial task
5. Run it -- the runner handles skill injection, vault deployment, and memory automatically

### Agent File Format

```markdown
---
name: gold-trader
description: Trades gold and mining stocks
skills:
  - vault-manager
  - yfinance
mcpServers:
  - vault-manager-mcp
  - yfinance-mcp
writeTools:
  - wire_asset
  - create_vault
  - set_vault_assets
  - allocate_to_perp
  - withdraw_from_perp
  - open_position
  - close_position
vaultName: Gold Trading Vault
depositFeeBps: 50
redeemFeeBps: 50
maxTurns: 35
temperature: 0.3
autoAllocateTargetBps: 3000
entryMode: momentum_volume
entryMomentumPctMin: 2.0
entryVolumeMin: 500000
entryDirection: long_only
maxNewPositionsPerRun: 5
positionSizingMode: model_decides
---

You are a gold and mining stock trading agent.

Your job is to research gold prices and mining equities,
then manage positions in your vault accordingly.

## Rules

- Focus on gold (GC=F) and major gold miners
- Maximum 3 open positions at any time
- Only operate on your own vault

## User Prompt

Research current gold and mining stock prices. Manage
your vault positions based on market conditions.
```

### Frontmatter Fields

| Field | Required | Default | Description |
|---|---|---|---|
| `name` | no | filename | Agent identifier |
| `description` | no | -- | Short description for logs |
| `skills` | no | `[]` | List of skill names from `agents/skills/` (loaded as tool/API reference) |
| `mcpServers` | yes | -- | List of MCP server names from `agents/mcp-servers.json` |
| `writeTools` | no | `[]` | Tools blocked in dry-run mode |
| `vaultName` | no | agent name | Name for the auto-deployed vault |
| `depositFeeBps` | no | `50` | Vault deposit fee in basis points |
| `redeemFeeBps` | no | `50` | Vault redeem fee in basis points |
| `maxTurns` | no | `40` | Max agent loop iterations |
| `temperature` | no | `0.2` | LLM temperature |
| `autoAllocateTargetBps` | no | `0` | Auto-allocate this share (bps) of `availableForPerp` before summary |
| `entryMode` | no | `none` | Entry policy mode. One of `none`, `momentum_volume`, `ml_score`, or `quality_score` |
| `entryMomentumPctMin` | no | `0` | Minimum `dayChangePct` threshold for momentum gating (used by `entryMode: momentum_volume`) |
| `entryVolumeMin` | no | `0` | Minimum Yahoo quote volume threshold for entry gating (used by `entryMode: momentum_volume`) |
| `entryMlScoreMin` | no | `0` | Minimum Atlas ML score (0-100) required for a long entry (used by `entryMode: ml_score`) |
| `entryQualityScoreMin` | no | `0` | Minimum Quality Matrix composite score (0-100) required for a long entry (used by `entryMode: quality_score`) |
| `entryDirection` | no | `long_only` | Allowed entry direction. One of `long_only`, `short_only`, `long_short`. In `long_short` mode the runner gates long opens against the entry-mode eligibility set (Atlas top-N / Quality top-N / momentum+volume), but short opens are LLM-judged from news context and are not gated by that set. |
| `maxNewPositionsPerRun` | no | `0` | Hard cap on combined long+short new `open_position` writes per run |
| `maxNewShortsPerRun` | no | `0` | Hard cap on new short `open_position` writes per run (subset of `maxNewPositionsPerRun`). Must be `0` when `entryDirection: long_only`, must be `<= maxNewPositionsPerRun` otherwise. |
| `maxTrackedAssets` | no | `0` | Cap on the per-vault tracked-asset set when `rebalanceMode: track_top_n` is active |
| `rebalanceMode` | no | `none` | Auto-rebalance policy. `track_top_n` runs a deterministic pre-LLM pass before the agent loop that closes any long leg whose ticker dropped out of the latest top-N (works with `entryMode: ml_score` or `entryMode: quality_score`); shorts are never auto-closed in `long_short` mode. |
| `positionSizingMode` | no | `model_decides` | Position sizing policy (`model_decides`, `equal_weight`) |

### Prompt Structure

The markdown body (everything after the frontmatter `---`) is the **system prompt** — the agent's "soul." It defines identity, strategy, and rules. Keep it focused on *what the agent cares about*, not tool API details.

The `## User Prompt` heading splits the body. Everything below it becomes the **initial user message** (the "heartbeat") that kicks off the agent loop. If omitted, a generic "execute your assigned task" message is used.

The runner assembles the final system prompt at runtime in this order:
1. **Agent body** (soul — identity, strategy, rules)
2. **Skill files** (generalised tool/API references from `agents/skills/`)
3. **Your Vault**: the vault address (or instructions to deploy one)
4. **Recent Run History**: summaries of the last 5 runs
5. **Dry Run Mode**: whether write tools are active

---

## Skills

Skills are reusable tool/API reference files that live in `agents/skills/`. They follow the convention from [Proof of Lobster](https://github.com/Theseuschain/proof-of-lobster/tree/master/agent): a skill describes *what tools are available and how to use them* (endpoints, parameters, units, workflows) without dictating strategy. Strategy-specific instructions (which assets to trade, risk thresholds, allocation limits) belong in the agent body.

### Convention

| Layer | File | Contains | Example |
|-------|------|----------|---------|
| Soul | `agents/<name>.md` body | Identity, strategy, rules, thresholds | "Max 50% to perp, close losers at 15%" |
| Skill | `agents/skills/<skill>.md` | Tool reference, units, generalised workflows | "open_position takes vault, assetId, isLong, size, collateral" |
| Heartbeat | `## User Prompt` section | The task for this run | "Check vault, research markets, manage positions" |

### Creating a Skill

Create a markdown file at `agents/skills/<name>.md`. The file is plain markdown (no frontmatter). Structure it as a tool/API reference:

```markdown
# My Skill Name

Your capabilities for doing X.

## Tools
(tool names, descriptions, key params)

## Units / Conventions
(data formats, scaling, companion fields)

## Workflows
(generalised step-by-step flows)

## Response Format
(success/error patterns)
```

### Available Skills

| Skill | File | Description |
|-------|------|-------------|
| `vault-manager` | `agents/skills/vault-manager.md` | On-chain vault reads/writes, units, position workflows |
| `yfinance` | `agents/skills/yfinance.md` | Yahoo Finance search and quote lookups |
| `atlas-quality` | `agents/skills/atlas-quality.md` | Quality Matrix scoring (8 categories × 52 signals + 58-signal drill sub-rubric) over Atlas-tracked mining companies |

Reference skills in agent frontmatter:

```yaml
skills:
  - vault-manager
  - yfinance
```

---

## Vault Lifecycle

Each agent manages exactly one vault. The runner handles deployment automatically:

- **First run**: no memory exists, the runner instructs the agent to create a vault via `create_vault`, then captures the new address from the `create_vault` `vaultAddress` response (with `get_all_vaults` fallback only if needed).
- **Subsequent runs**: the runner loads the vault address from memory and injects it into the system prompt.
- **Agent file changes**: the runner still computes a SHA-256 hash of the `.md` file and stores it in memory, but hash changes are treated as metadata only. If the remembered vault address is still present, the agent keeps managing the same vault after prompt or strategy edits.
- **Deployment changes**: when the deployment fingerprint changes (network key, `DEPLOYMENT_CONFIG`, or `RPC_URL`), the runner rotates stale memory into `archive/` and starts from a fresh vault context for that deployment.

---

## Memory

Agent memory is **file-backed under `agents/memory/<agent>/` and tracked in git**. The runner writes state and run-log entries directly to the working tree; CI (`.github/workflows/vault-agent.yml`) commits the deltas back to the default branch under the `vault-agent[bot]` identity via a `commit-results` job after every scheduled run. The next run's freshly-checked-out repo therefore already contains the prior state.

### Layout

| Path | Contents |
|---|---|
| `agents/memory/<agent>/state.json` | Vault address, vault name, agent-file hash, deployment fingerprint, deployed/last-run timestamps, current thesis |
| `agents/memory/<agent>/run-log.<network>.jsonl` | Append-only structured log of every run on a given network (one JSON line per run) |
| `agents/memory/<agent>/archive/` | Rotated state from a previous deployment fingerprint, kept for audit |
| `apps/web/public/agent-metadata/<vault>.json` | Per-vault "AI Operator" payload consumed by the web app via `useAgentMetadata` (`/agent-metadata/<vault>.json`) |

Per-network run logs prevent cross-network context bleed when an agent runs against multiple environments. Override the network tag with `AGENT_NETWORK`. Dry runs (`AGENT_DRY_RUN=1`) do not update run logs.

#### Web-facing metadata schema

`publishAgentMetadata` in `scripts/agent-runner.mjs` writes:

| Field | Type | Notes |
|---|---|---|
| `isAiManaged` | `true` | Drives the AI Operator badge / AI Activity section in the web app |
| `agentName` / `agentDescription` | string | Surfaced in the AI Activity header |
| `thesis` | string \| null | Parsed from the LLM's final `## Thesis` section; rendered as the Vault Thesis card on the basket detail page (`apps/web/src/components/baskets/vault-thesis-card.tsx`) with a quote-glyph hero treatment, markdown body, ticker auto-highlighting (e.g. `AHR.V`, `(CRML)`), and a "Read more" toggle for long write-ups. Header chips surface `signalSource` + `entryMode` + a relative "Updated …" timestamp. When `null`, the card falls back to the `latestRun.summary` so an empty thesis on a freshly-deployed agent (e.g. `quality-matrix-manager`) still has something to say. |
| `lastRunAt` | ISO timestamp | Drives the "Updated …" chip on the Vault Thesis card |
| `latestRun` | `{ runId, finishedAt, summary }` | `summary` is the 500-char truncated final agent message. Used by the Vault Thesis card as the fallback body when `thesis` is null, and by the run-grouping logic in the "Show all decisions" panel to label the most-recent run with a `Latest` pill. |
| `recentActions[]` | `{ tool, justification, timestamp, txHash, agentName, runId, params? }` | LLM-authored justifications attached to MCP write-tool calls. Deduplicated by `txHash` and capped (default 100, override with `AGENT_METADATA_ACTION_LIMIT`). The web app groups entries by `runId` and renders icon-driven cards in the collapsible "Show all decisions" panel, then joins entries by `txHash` to the on-chain Vault History rows. The Vault Thesis card additionally derives a "Top picks" chip rail from the latest run's `open_position` actions (long → success tone, short → danger tone). `params` is a per-tool params summary (asset id, side, size, collateral, amount, etc.) emitted by `summarizeActionParams`; see `apps/web/public/agent-metadata/README.md` for the per-tool shape. |

### Run lifecycle

1. Runner builds a deployment fingerprint from `(runNetwork, DEPLOYMENT_CONFIG contents, RPC_URL)`.
2. Runner spawns MCP servers.
3. Runner reads `state.json` and the tail of `run-log.<network>.jsonl` (last 5 entries).
4. If the fingerprint changed since the last saved state, the runner rotates the old `state.json` and `run-log.<network>.jsonl` into `archive/` and starts fresh.
5. After the LLM loop, the runner writes the new state, publishes `apps/web/public/agent-metadata/<vault>.json`, and appends the run summary to the run-log.
6. CI uploads both directories as `agent-output-<network>` artifacts, then the `commit-results` job pushes the deltas back to `main` with a `memory(agent): update agent memory and metadata` commit.

---

## MCP Servers

Agents connect to MCP (Model Context Protocol) servers for tools. Servers are registered in `agents/mcp-servers.json` and referenced by name in agent frontmatter.

| Server | Purpose | Tools |
|---|---|---|
| `vault-manager-mcp` | On-chain vault reads and writes | `get_all_vaults`, `get_vault_state`, `get_all_vault_states`, `get_vault_pnl`, `get_oracle_assets`, `get_position_tracking`, `list_open_positions`, `wire_asset`, `create_vault`, `set_vault_assets`, `allocate_to_perp`, `withdraw_from_perp`, `open_position`, `close_position` |
| `yfinance-mcp` | Market data lookups + news | `yfinance_search`, `yfinance_quote`, `yfinance_news` |
| `atlas-ml-mcp` | Atlas mining-stock ML engine | `get_ml_top_picks`, `get_ml_model_info`, `get_ml_basket`, `get_ml_thesis` |
| `atlas-quality-mcp` | Analyst-authored 8-category Quality Matrix scorer (drilling / resources / met / econ / permitting / offtake / capital raises / construction). Reads existing read-only Atlas endpoints and classifies tiers locally; never modifies Atlas. | `get_quality_top_picks`, `get_quality_company_card`, `get_quality_matrix_definition`, `get_quality_short_candidates`, `classify_drill_release_text` |

### Server Registry Format

```json
{
  "vault-manager-mcp": {
    "command": "node",
    "args": ["apps/mcps/vault-manager/index.js"],
    "envPassthrough": ["DEPLOYMENT_CONFIG", "RPC_URL", "PRIVATE_KEY"]
  },
  "yfinance-mcp": {
    "command": "node",
    "args": ["apps/mcps/yfinance/index.js"],
    "envPassthrough": []
  },
  "atlas-ml-mcp": {
    "command": "node",
    "args": ["apps/mcps/atlas-ml/index.js"],
    "envPassthrough": ["ATLAS_API_URL", "ATLAS_API_KEY", "ATLAS_REQUEST_TIMEOUT_MS"]
  },
  "atlas-quality-mcp": {
    "command": "node",
    "args": ["apps/mcps/atlas-quality/index.js"],
    "envPassthrough": ["ATLAS_API_URL", "ATLAS_API_KEY", "ATLAS_REQUEST_TIMEOUT_MS"]
  }
}
```

| Field | Description |
|---|---|
| `command` | Executable to spawn |
| `args` | Arguments (paths relative to project root) |
| `envPassthrough` | Env var names forwarded to the server process |

To add a new MCP server: add the server code under `apps/mcps/`, then add an entry to `agents/mcp-servers.json`.

---

## Tool Reference

### Market Data (yfinance-mcp)

| Tool | Purpose | Key params |
|---|---|---|
| `yfinance_search` | Find stocks, ETFs, indices by name/ticker | `query`, `limit` |
| `yfinance_quote` | Get live prices with USD conversion, day change, volume, and symbol-resolution metadata (`requestedSymbol`, `resolvedSymbol`, `isAmbiguous`, `candidates[]`) | `symbols[]` |
| `yfinance_news` | Recent news headlines per ticker (`{title, publisher, link, publishedAt, type, relatedTickers}`) backed by Yahoo Finance search; per-symbol errors are returned inline so a single bad symbol doesn't kill the call | `symbols[]` (max 10), `limitPerSymbol` (default 3, max 10) |

### Mining ML Signals (atlas-ml-mcp)

Wraps the Atlas mining-stock ML engine (default `https://atlas.minestarters.com`, override via `ATLAS_API_URL`). Every returned pick includes a derived `yahooSymbol` with the correct exchange suffix (e.g. `GSR` on TSXV becomes `GSR.V`) for direct use with `wire_asset` / `yfinance_quote`.

| Tool | Purpose | Key params |
|---|---|---|
| `get_ml_top_picks` | Ranked top mining stocks (`{ml_score, ml_predicted_return, primary_commodity, vault_fit_tier, yahooSymbol, ...}`) | `limit`, `minScore` |
| `get_ml_model_info` | Slim model metadata (horizon, Spearman IC, top features, score distribution, bundled top predictions) | -- |
| `get_ml_basket` | Top-N basket enriched with cash/debt/EV/jurisdiction | `n`, `tag` |
| `get_ml_thesis` | Claude-generated investment thesis on the current basket (use sparingly) | `n`, `tag` |

The agent runner's `entryMode: ml_score` policy uses `get_ml_top_picks` as the long-side eligibility signal. When `rebalanceMode: track_top_n` is set, a deterministic pre-LLM pass closes any **long** position whose underlying ticker has dropped out of the latest top-N. In `long_short` mode the pass only ever touches long legs — short legs are entirely owned by the LLM's TP/SL decisions, so the model can run a news-driven short overlay alongside the Atlas long basket.

### Mining Quality Matrix Signals (atlas-quality-mcp)

Wraps the analyst's 8-category Quality Matrix (Drilling / Resources / Met / Econ / Permitting / Offtake / Capital Raises / Construction) scored locally in JS from existing read-only Atlas endpoints. The full matrix lives verbatim in `apps/mcps/atlas-quality/scoring/matrix.json` (52 main signals + a 58-signal drill exploration-vs-resource sub-rubric, with per-signal tier breakpoints, `whatDrivesTheBadge`, `caveatDepositTypeNuance`, `sourceLinks[]`, `workbookAnchors[]`, `provenance` flag `EMPIRICAL` vs `PUBLISHED_REFERENCE_ONLY`, and `dataQualityWarnings[]`). Composite weights default to Drilling 35% / Resources 20% / Econ 15% / Met 10% / Permitting 5% / Offtake 5% / Capital Raises 5% / Construction 5%, with a configurable `provenanceDiscount` (default 0.7) applied to categories whose every signal is `PUBLISHED_REFERENCE_ONLY`. Three signals (Drill Hole Orientation, Drill Spacing, Location Context) are flagged `notInWorkbookSchema` and always return `Unknown` with a recovery hint; the composite scorer re-normalises across non-Unknown categories so junior explorers aren't penalised for missing producer-only data.

| Tool | Purpose | Key params |
|---|---|---|
| `get_quality_top_picks` | Composite-ranked top picks with per-category subscores, `yahooSymbol`, and provenance flags | `limit`, `minCompositeScore`, `commodity`, `exchange`, `watchlistOnly` |
| `get_quality_company_card` | Full per-signal tier card (every signal, tier, raw value, provenance, anchor, source link). Use as `justification` payload | `ticker`, `exchange` |
| `get_quality_matrix_definition` | Returns `matrix.json` verbatim (or a single section). Call once per run to ground in tier definitions | `section` |
| `get_quality_short_candidates` | Names outside the top-N with `criticalRedFlag` matrix signals (permit refused, dilution >30%, schedule blowout, capex >140%, grade-recon shortfall, failed raise). Agent must still confirm with a citable bearish headline before opening a short | `limit`, `excludeTickers[]` |
| `classify_drill_release_text` | Debug helper — pass a drill release headline + summary, returns the 58-signal sub-rubric breakdown and final exploration-vs-resource classification | `text` |

The agent runner's `entryMode: quality_score` policy uses `get_quality_top_picks` as the long-side eligibility signal. `entryQualityScoreMin` sets the minimum composite. With `rebalanceMode: track_top_n` the deterministic pre-LLM pass closes any long whose ticker dropped out of the latest Quality top-N (same long-only semantics as the `ml_score` mode). The Atlas backend itself is unchanged — all scoring happens in JS over existing read-only endpoints.

### On-Chain Reads (vault-manager-mcp)

| Tool | Purpose | Key params |
|---|---|---|
| `get_all_vaults` | List vault addresses and names | -- |
| `get_all_vault_states` | Full snapshot of every vault (batch) | -- |
| `get_vault_state` | Detailed single vault state | `vault` |
| `get_vault_pnl` | Unrealised/realised PnL | `vault` |
| `get_oracle_assets` | All oracle assets with prices | -- |
| `get_position_tracking` | Single position details | `vault`, `assetId`, `isLong` |
| `list_open_positions` | Structured list of all open positions for a vault (auto-rebalance friendly) | `vault` |

### On-Chain Writes (vault-manager-mcp)

All return `{success, transactionHash, next_steps}` with structured error recovery hints on failure.

| Tool | Purpose | Key params |
|---|---|---|
| `wire_asset` | Register new tradeable asset (rejects ambiguous unsuffixed equities like `BHP`) | `symbol`, `seedPriceUsd` |
| `create_vault` | Deploy new basket vault (returns `vaultAddress`) | `name`, `depositFeeBps`, `redeemFeeBps` |
| `set_vault_assets` | Set vault's tracked assets | `vault`, `assetIds[]` |
| `allocate_to_perp` | Move USDC to perp module | `vault`, `amount` (raw USDC) |
| `withdraw_from_perp` | Pull USDC back to vault | `vault`, `amount` (raw USDC) |
| `open_position` | Open/increase perp position | `vault`, `assetId`, `isLong`, `size`, `collateral` |
| `close_position` | Reduce/close perp position | `vault`, `assetId`, `isLong`, `sizeDelta`, `collateralDelta` |

### Units Cheat Sheet

| Concept | Raw value | Human example |
|---|---|---|
| 1 USDC | `1000000` | 6 decimals |
| $10,000 position size | `10000000000000000000000000000000000` | 1e30 per $1 |
| 0.5% fee | `50` bps | 100 bps = 1% |
| Asset ID | `keccak256("BHP.AX")` | `cast keccak "BHP.AX"` to compute |

Tool responses include `_usdc`, `_usd`, and `_pct` companion fields with human-readable conversions.

---

## Workflows

### Discover and wire a new asset

- [ ] `yfinance_search({ query: "Rio Tinto" })` -- find ticker
- [ ] `yfinance_quote({ symbols: ["RIO.AX"] })` -- get current USD price
- [ ] `wire_asset({ symbol: "RIO.AX", seedPriceUsd: 95.50 })` -- register on-chain
- [ ] If `yfinance_quote` returns `isAmbiguous=true`, retry with an exchange-suffixed symbol before wiring
- [ ] Unique unsuffixed equities (e.g. `AAPL`) and non-equity symbols (e.g. `GC=F`) are still valid
- [ ] `get_oracle_assets()` -- verify it appears with `active: true`
- [ ] `set_vault_assets({ vault: "<your vault>", assetIds: [...existing, ...new] })` -- add to your vault

### Routine position management

- [ ] `get_vault_state({ vault: "<your vault>" })` -- check your vault state
- [ ] `yfinance_quote({ symbols: [...] })` -- check live market prices
- [ ] Compare market prices vs on-chain oracle prices from vault state
- [ ] Decide: close losers (>15% loss), take profits (>20% gain), rebalance allocation
- [ ] Execute via `close_position`, `open_position`, `allocate_to_perp`, `withdraw_from_perp`
- [ ] `get_vault_state({ vault: "<your vault>" })` -- verify final state

### Risk Guardrails

- Max 50% of idle USDC allocated to perp
- Min 20% reserve (`minReserveBps` = 2000)
- Collateral >= 10% of position size (max ~10x leverage)
- Stop-loss: close at >15% collateral loss
- Take-profit: close at >20% collateral gain
- Oracle price updates are handled by a separate keeper, not the agent

---

## Running Agents

### Locally

```bash
# Any agent by name
npm run agent:run -- <agent-name>

# Vault manager shortcuts
npm run agent:vault       # full live run
npm run agent:vault:dry   # dry-run (no on-chain writes)
```

### Self-Improvement (PR + issues meta-loop)

After every vault-agent CI tick, a separate `self-improve` job in `.github/workflows/vault-agent.yml` runs the meta-loop. The job hosts **two parallel channels** that share the same checkout and concurrency slot but produce independent outputs:

- the **PR channel** (described below) is intentionally narrow — it only fires when a deterministic Layer A signal crosses a threshold and demands a literal `search`/`replace` diff with ≥2 cited run-log entries, and
- the **issues channel** (see [§ Self-Improvement issues channel](#self-improvement-issues-channel) further down) runs on every tick regardless of Layer A. It surfaces broader, more speculative observations ("we should wire up an Atlas news MCP", "this vault has a weird PnL pattern, worth a look") as GitHub Issues for human triage. Same risk-officer rigour with a softer rubric; never mutates code.

Both channels render their final outputs against the GitHub PR / issue templates shipped at [`.github/pull_request_template.md`](../.github/pull_request_template.md) and [`.github/ISSUE_TEMPLATE/agent-finding.yml`](../.github/ISSUE_TEMPLATE/agent-finding.yml). The PR channel's `buildPrBody` emits the template's eight top-level sections (Summary, Type of change, Linked issues, Test plan, Risk + rollback, Docs + ABIs + changelog, Agent metadata, Reviewer checklist) and auto-ticks `[x] Agent-authored self-improvement` (plus `[x] Infra / CI / build` when any edit has `requiresReviewKind` ∈ {`runner`, `mcp`, `shared`}). The issues channel's `formatIssueBody` emits the agent-finding form's field order (Category → Summary → Agent name → Justification → Conviction → Trigger signals → `<!-- self-improver-issue-id: <SHA-12> -->` marker footer), prefixes every title with `agent: ` to match the form's auto-applied prefix, and labels every issue with `agent-finding` + `needs-human-review` + `category:<x>` — the same labels the form applies, so bot-filed and human-filed agent findings share one triage queue and the same `gh issue list --label agent-finding` dedup catches duplicates from either source.

#### PR channel

Layer A runs the deterministic detector (`scripts/detect-self-improvement-signal.mjs`) over the freshly-committed `agents/memory/<agent>/run-log.<network>.jsonl` tails. The detector emits JSON for five trigger conditions:

| Signal | Condition |
|---|---|
| `recurring_losers` | Same `(ticker, side)` appears in `closedPositions[]` with `realizedPnlPctOfCollateral < -5%` ≥ 2 times in the last 7 days. |
| `new_error_code` | An MCP `error_code` in `errors[]` that did NOT appear in the prior 100 runs. |
| `cap_saturation` | `maxNewPositionsPerRun` / `maxNewShortsPerRun` hit on ≥ 3 consecutive most-recent runs. |
| `risk_officer_dissonance` | ≥ 3 risk-officer `veto` verdicts on the same vault in the last 24h. |
| `loss_streak` | ≥ 3 closed positions with `<-5%` PnL of collateral in the last 24h. |

When `shouldRun: false`, the meta-loop short-circuits before any LLM call — quiet ticks cost zero tokens. When at least one signal fires, the layered pipeline runs:

1. **Layer B — meta-agent.** `agents/self-improver.md` is invoked via `node scripts/agent-runner.mjs self-improver`. It connects to a single MCP server (`repo-editor-mcp`) and uses `propose_file_edit` / `propose_file_create` / `propose_file_rename` to draft a manifest at `.agent-self-improvement/proposed-edits.json`. **The meta-agent NEVER mutates the repo on disk** — the manifest is the only side-effect.
2. **Layer C — risk-officer review.** `scripts/run-self-improvement-risk-officer.mjs` reads the manifest, the trigger evidence, the current contents of every touched file, and recent verdicts, and asks the LLM (prompt body in `agents/risk-officer-self-improvement.md`) for `approve` / `downsize` / `veto`. A `veto` clears the manifest and short-circuits the PR. A `downsize` keeps only edits whose `convictionWeight ≥ threshold`.
3. **Layer E — dry-run replay.** `scripts/apply-self-improvement-proposals.mjs --apply-locally-only` mutates the working tree (re-checking the allowlist for every path, re-verifying every `search` string is present-and-unique). Then `AGENT_DRY_RUN=1 node scripts/agent-runner.mjs <agent>` runs for every agent whose `.md` was edited so a prompt that parses-but-errors is caught BEFORE the PR opens.
4. **Layer D — PR.** `scripts/apply-self-improvement-proposals.mjs --open-pr` creates a stable `agent-improve/<UTC date>-<signal hash>` branch (so two ticks firing the same signal set in the same UTC day collapse onto one branch), commits + pushes under the `vault-agent[bot]` identity, and runs `gh pr create --label agent-self-improvement --label needs-human-review --base main`. **No auto-merge** — a human reviews and merges. Housekeeping rotations (run-log entries older than 90 days → `agents/memory/<agent>/archive/`) emitted by the signal detector ride along on the same PR.

The MCP server is a thin wrapper around `apps/mcps/repo-editor/allowlist.js`. The allowlist is the load-bearing safety rail; both the MCP (when the meta-agent calls `propose_file_*`) and the PR-opener (before any disk mutation) re-check every proposed path. The list:

- **Allow**: `agents/*.md`, `agents/skills/*.md`, `agents/mcp-servers.json`, `scripts/agent-runner*.{mjs,js}` (flagged `requiresReviewKind=runner`), `apps/mcps/**/*.{mjs,js}` (flagged `requiresReviewKind=mcp`), `apps/shared/**/*.{mjs,js}` (flagged `requiresReviewKind=shared`).
- **Deny (always)**: every `*.sol`, `lib/**`, `src/**`, `script/**`, `test/**`, `.github/workflows/**`, `.github/actions/**`, `apps/web/src/abi/**`, `apps/envio/abis/**`, `apps/web/src/config/*-deployment.json`, `.env*`, `**/credentials*`, `**/*.secret*`, `*.pem`/`*.key`, `AGENTS.md`, `AGENT_DEPLOYMENT_MEMORY.md`, `CHANGELOG.md`, `.cursor/rules/**`, `agents/memory/**`, `apps/web/public/agent-metadata/**`, `node_modules/**`, `.git/**`, lockfiles, `scripts/agent-debug-log.jsonl`.
- **Default deny**: any path not on the allow-list.

The meta-agent's own memory lives at `agents/memory/self-improver/` (same shape as every other agent), and the same `commit-results` job that pushes the trading agents' memory back to `main` carries it along. The `self-improver-artefacts` workflow artefact preserves the per-tick `.agent-self-improvement/` scratch dir for 14 days for audit.

Local invocation (for testing the meta-loop without firing CI):

```bash
# 1. See whether a signal fires
node scripts/detect-self-improvement-signal.mjs | jq .

# 2. Run the meta-agent itself (writes a manifest only)
LLM_API_KEY=sk-... AGENT_NON_INTERACTIVE_WRITE_EXECUTE=1 node scripts/agent-runner.mjs self-improver

# 3. Risk-officer review of the manifest
LLM_API_KEY=sk-... node scripts/run-self-improvement-risk-officer.mjs

# 4. Apply to the working tree (no push) and inspect the diff
node scripts/apply-self-improvement-proposals.mjs --apply-locally-only
git diff
```

The PR creation step (`--open-pr`) requires a `gh` auth context and is intended for the CI workflow only.

#### Self-Improvement issues channel

The PR channel's narrow bar keeps the proposed-edit noise floor low but means **observations that aren't yet provable as code edits never reach humans**. The issues channel exists for that gap. It is **always-on**: every tick it runs a sibling meta-agent that brainstorms broader ideas (a new MCP, a strategy tweak, an investigation against a specific vault) and files them as GitHub Issues for human triage.

Components (all sibling-of-PR-channel; no shared state beyond the run log + the repo-editor MCP):

| Layer | File | Role |
|---|---|---|
| F | `agents/self-improver-issues.md` | Meta-agent that runs every tick. Calls `propose_issue` (a new MCP tool) to draft 1-3 issue ideas across five categories: `new_mcp_or_skill`, `strategy_idea`, `data_gap`, `refactor`, `investigation`. |
| F-MCP | `apps/mcps/repo-editor/index.js` (`propose_issue`, `list_open_issues`) | `propose_issue` writes to `.agent-self-improvement/proposed-issues.json`; `list_open_issues` shells out to `gh issue list` for dedup awareness. Both gated by the same `repo-editor-mcp` server. |
| F' | `agents/risk-officer-self-improvement-issues.md` + `scripts/run-self-improvement-issue-risk-officer.mjs` | Same `approve` / `downsize` / `veto` schema as the PR-side risk officer; softer rubric (issues don't change code). Vetoes when the per-period cap is full, when a proposal has zero run-log grounding, when an `investigation` issue lacks a target vault, or on title/id collisions with open issues. |
| F'' | `scripts/apply-self-improvement-issues.mjs` | Dedupes against open issues by id-marker (`<!-- self-improver-issue-id: <SHA-12> -->` baked into the body) and exact-title match; respects `MAX_OPEN_SELF_IMPROVER_ISSUES` (default 10); prefixes every title with `agent: ` and calls `gh issue create` with labels matching [`.github/ISSUE_TEMPLATE/agent-finding.yml`](.github/ISSUE_TEMPLATE/agent-finding.yml) verbatim (`agent-finding` + `needs-human-review`) plus a dynamic `category:<x>` label, so bot-filed and human-filed agent findings share the same triage queue. **Never edits existing issues, never assigns, never closes.** |

The issues channel honours the **same allowlist** as the PR channel for any `read_repo_file` calls; `propose_issue` has no path argument so the allow-list is N/A there. The five-category enum (`new_mcp_or_skill` / `strategy_idea` / `data_gap` / `refactor` / `investigation`) is the only knob shaping what kinds of suggestions the channel can file, and the title/body length caps (120 chars / 8 KB) are enforced in `apps/mcps/repo-editor/issue-manifest.js`.

Local invocation:

```bash
# Generate the issue manifest only (no LLM call to risk-officer, no gh)
LLM_API_KEY=sk-... GH_TOKEN=$(gh auth token) AGENT_NON_INTERACTIVE_WRITE_EXECUTE=1 \
  node scripts/agent-runner.mjs self-improver-issues

# Risk-officer review of the issue manifest
LLM_API_KEY=sk-... GH_TOKEN=$(gh auth token) \
  node scripts/run-self-improvement-issue-risk-officer.mjs

# Dry-run the opener (no gh issue create call)
node scripts/apply-self-improvement-issues.mjs --dry-run

# Open the issues (requires gh auth + issues:write permission)
node scripts/apply-self-improvement-issues.mjs --open-issues
```

The same `self-improver-artefacts` workflow artefact preserves `.agent-self-improvement/proposed-issues.json`, `issue-risk-officer-verdict.json`, and the issue meta-agent's `agents/memory/self-improver-issues/` memory for 14 days for audit.

### GitHub Actions

The workflow at `.github/workflows/vault-agent.yml` runs the full agent matrix (`vault-manager`, `mining-manager`, `quality-matrix-manager`) against Sepolia.

1. Go to Actions > "Vault Agent" > Run workflow
2. Optionally toggle dry-run mode, choose a single agent (`vault-manager` | `mining-manager` | `quality-matrix-manager` | `all`), or pin a one-off vault address override

The cron schedule runs the agent matrix **hourly at minute :18** (`18 * * * *`), serialized via a shared `keeper-key-serialized` concurrency group that also covers `keeper.yml` and `update-prices.yml` so the three workflows can never race on the same `KEEPER_PRIVATE_KEY` nonce. The off-hour minute is intentional: `update-prices.yml` runs `*/5 * * * *` and `keeper.yml` runs `2-59/5 * * * *`, so firing vault-agent at `:18` keeps it from starting on the same minute as either 5-min cron, which would force one of the queued runs to be cancelled by the next tick. `max-parallel: 1` inside the strategy matrix means the three agents run sequentially within a tick on the same keeper wallet.

The workflow also accepts a `repository_dispatch` event of type `vault-agent-tick`, which is the **primary** cadence driver — GitHub's `schedule` trigger is unreliable for this repo (historically delivers only ~one tick per ~100 min instead of every hour), so the cadence is driven by either the in-CI tick pusher workflow at [.github/workflows/cron-tick-pusher.yml](../.github/workflows/cron-tick-pusher.yml) (no PAT needed; runs `gh api dispatches` on a self-rescheduling 5-min loop using `GITHUB_TOKEN`) or an external scheduler hitting `POST /repos/<owner>/<repo>/dispatches` directly. Optional `client_payload.agent` ("vault-manager" | "mining-manager" | "quality-matrix-manager" | "all") restricts the matrix; absent payload runs the full matrix like a scheduled tick. See [KEEPER_OPERATIONS.md § External cron dispatch](./KEEPER_OPERATIONS.md#external-cron-dispatch) for both setup paths and the exact HTTP request shape. The workflow sets `AGENT_NON_INTERACTIVE_WRITE_EXECUTE=1` so the runner **executes** write tools in CI (no TTY; otherwise the confirmation layer would skip every on-chain call). The `commit-results` job in the same workflow pushes the updated `agents/memory/` and `apps/web/public/agent-metadata/` directories back to the default branch under the `vault-agent[bot]` identity using `permissions: contents: write`. Required secrets are documented in [§ GitHub Actions Secrets](#github-actions-secrets).

> **Note on branch protection.** The commit-results job requires the default branch to accept pushes from the `GITHUB_TOKEN` identity. If the branch is protected, either add `vault-agent[bot]` to the bypass list, route through a PAT, or disable the commit job and accept that state will not survive across runs.

### Write Confirmation Mode

Write confirmation is enabled by default. Whenever an assistant turn proposes one or more write tools, the runner requires approval in interactive terminals.

- The runner pauses and shows the proposed write batch.
- Commands:
  - `approve` (or press `Enter`): execute the full batch in order (including any read calls in that same batch)
  - `reject`: skip the write batch and ask the model to propose an alternative
  - any other text: treated as operator feedback; the model revises its proposed calls, and the approval loop repeats
- If no interactive TTY is available (for example CI), write calls are skipped by default and read calls still run.
- Set `AGENT_NON_INTERACTIVE_WRITE_EXECUTE=1` to explicitly allow non-interactive write execution without prompts.
- Set `AGENT_CONFIRM_WRITES=0` to disable confirmation logic entirely.
- `AGENT_DRY_RUN=1` still takes precedence and skips write execution entirely.

---

## Environment Variables

Set variables in your shell, or create a **repo-root** `.env` or `.env.local` (gitignored). The agent runner loads those files on startup if present; values already set in the environment are not overwritten. Full list: [`.env.example`](../.env.example) (root — agents, Foundry, scripts) and [`apps/web/.env.example`](../apps/web/.env.example) (Next.js / Playwright).

### Agent Runner

| Variable | Default | Description |
|---|---|---|
| `LLM_API_KEY` | (required) | OpenAI (or compatible) API key |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | API endpoint |
| `LLM_MODEL` | `gpt-4o` | Model name |
| `AGENT_MAX_TURNS` | from agent config | Override max turns |
| `AGENT_DRY_RUN` | -- | `1` to skip write tools |
| `AGENT_CONFIRM_WRITES` | `1` | Write confirmation gate; set `0` to disable confirmation logic |
| `AGENT_NON_INTERACTIVE_WRITE_EXECUTE` | -- | `1` to auto-execute writes in non-interactive runs when confirmation is enabled |
| `AGENT_MAX_TOOL_RESPONSE` | `6000` | Max chars per tool response sent to LLM |
| `AGENT_NETWORK` | inferred | Optional run-log namespace override |

### Vault Manager MCP Server

| Variable | Default | Description |
|---|---|---|
| `DEPLOYMENT_CONFIG` | `apps/web/src/config/sepolia-deployment.json` | Deployment addresses |
| `RPC_URL` | `sepolia` | Chain RPC |
| `PRIVATE_KEY` | -- | Required for write tools |

### Yahoo Finance MCP Server

No env vars required. Works out of the box.

### GitHub Actions Secrets

Required: `LLM_API_KEY`, `KEEPER_PRIVATE_KEY`, `SEPOLIA_RPC_URL`.

Optional secrets: `LLM_BASE_URL`, `LLM_MODEL`.

No repository variables are required for the vault agent.

---

## Architecture

```
agents/
  vault-manager.md        # OpenAI-powered vault manager (the shipped agent)
  skills/                 # Reusable skill files (tool/API references)
    vault-manager.md      # Vault MCP tool reference, units, workflows
    yfinance.md           # Yahoo Finance search + quote reference
  mcp-servers.json        # MCP server registry (spawn commands)
  memory/                 # Tracked-in-git agent state and run logs (CI commits updates)

scripts/
  agent-runner.mjs        # Generic runner (parses .md, loads skills, memory, vault lifecycle, LLM loop)

apps/
  mcps/
    vault-manager/        # MCP server (on-chain vault reads + writes via cast)
    yfinance/             # MCP server (Yahoo Finance search + quotes)
  web/
    public/agent-metadata/  # Static <vault>.json files consumed by useAgentMetadata
```
