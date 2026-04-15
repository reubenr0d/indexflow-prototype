# Multi-Agent Framework

Define autonomous vault management agents as markdown files. Each agent gets its own vault (auto-deployed on first run), persistent memory across cron runs, and access to MCP tool servers for on-chain operations and market data. Prompt/body edits reuse the remembered vault unless the deployment context changes or memory is missing. No JavaScript required.

## Quick Start

```bash
# Install MCP server deps (one-time)
npm --prefix apps/mcps/vault-manager install
npm --prefix apps/mcps/yfinance install

# Run the sample agent
LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent:run -- sample-vault-manager

# Dry-run mode (observe only, no on-chain writes)
AGENT_DRY_RUN=1 LLM_API_KEY=sk-... npm run agent:run -- sample-vault-manager

# Write confirmation is enabled by default (interactive TTY prompts)
LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent:run -- sample-vault-manager

# Non-interactive auto-execute override (disabled by default)
AGENT_NON_INTERACTIVE_WRITE_EXECUTE=1 LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent:run -- sample-vault-manager

# Backward-compatible shortcuts for the sample agent
LLM_API_KEY=sk-... npm run agent:dry
LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent
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
maxTurns: 15
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
| `maxTurns` | no | `20` | Max agent loop iterations |
| `temperature` | no | `0.2` | LLM temperature |
| `autoAllocateTargetBps` | no | `0` | Auto-allocate this share (bps) of `availableForPerp` before summary |
| `entryMode` | no | `none` | Entry policy mode (`none` or `momentum_volume`) |
| `entryMomentumPctMin` | no | `0` | Minimum `dayChangePct` threshold for momentum gating |
| `entryVolumeMin` | no | `0` | Minimum Yahoo quote volume threshold for entry gating |
| `entryDirection` | no | `long_only` | Allowed entry direction (currently `long_only`) |
| `maxNewPositionsPerRun` | no | `0` | Hard cap on new `open_position` writes per run |
| `positionSizingMode` | no | `model_decides` | Position sizing policy (`model_decides`) |

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

Each agent has persistent memory stored at `agents/memory/<agent-name>/`:

```
agents/memory/sample-vault-manager/
  state.json        # Current state (vault address, file hash, deployment fingerprint, timestamps)
  run-log.sepolia.jsonl  # Append-only history per network (one JSON line per run)
  run-log.local.jsonl    # Separate context stream for local runs
  archive/          # Auto-rotated stale state/log files from deployment changes
```

**state.json** tracks the vault address, file hash for change detection, deployment fingerprint metadata, and timestamps:
```json
{
  "vaultAddress": "0xabc...",
  "vaultName": "Mining Basket",
  "agentFileHash": "sha256:abc123...",
  "deploymentFingerprint": "sha256:def456...",
  "deploymentConfigPath": "/abs/path/to/sepolia-deployment.json",
  "deployedAt": "2026-04-11T10:00:00Z",
  "lastRunAt": "2026-04-11T16:00:00Z"
}
```

**run-log.<network>.jsonl** is appended after live runs (including failures) with tool calls, actions, and the agent's summary. Dry runs (`AGENT_DRY_RUN=1`) do not update run logs:
```json
{"timestamp":"...","agent":"sample-vault-manager","network":"sepolia","vault":"0x...","turns":5,"toolCalls":[...],"writeActions":[...],"errors":[],"summary":"..."}
```

The runner resolves `<network>` from `AGENT_NETWORK` when set, otherwise it infers it from `DEPLOYMENT_CONFIG` (for example `sepolia-deployment.json` -> `sepolia`).

On startup, the runner computes a deployment fingerprint from `(runNetwork, DEPLOYMENT_CONFIG contents, RPC_URL)`. If the fingerprint changed since the last saved state (or legacy state has no fingerprint), it invalidates stale context by rotating `state.json` and only the active network log (`run-log.<network>.jsonl`) into `agents/memory/<agent>/archive/`, then treats the run as fresh vault lifecycle.

Memory is committed to the repo. In CI, the workflow auto-commits memory changes after each run, making agent state durable, inspectable, and version-controlled.

---

## MCP Servers

Agents connect to MCP (Model Context Protocol) servers for tools. Servers are registered in `agents/mcp-servers.json` and referenced by name in agent frontmatter.

| Server | Purpose | Tools |
|---|---|---|
| `vault-manager-mcp` | On-chain vault reads and writes | `get_all_vaults`, `get_vault_state`, `get_all_vault_states`, `get_vault_pnl`, `get_oracle_assets`, `get_position_tracking`, `wire_asset`, `create_vault`, `set_vault_assets`, `allocate_to_perp`, `withdraw_from_perp`, `open_position`, `close_position` |
| `yfinance-mcp` | Market data lookups | `yfinance_search`, `yfinance_quote` |

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

### On-Chain Reads (vault-manager-mcp)

| Tool | Purpose | Key params |
|---|---|---|
| `get_all_vaults` | List vault addresses and names | -- |
| `get_all_vault_states` | Full snapshot of every vault (batch) | -- |
| `get_vault_state` | Detailed single vault state | `vault` |
| `get_vault_pnl` | Unrealised/realised PnL | `vault` |
| `get_oracle_assets` | All oracle assets with prices | -- |
| `get_position_tracking` | Single position details | `vault`, `assetId`, `isLong` |

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

# Sample vault manager shortcuts (backward compatible)
npm run agent
npm run agent:dry
```

### GitHub Actions

The workflow at `.github/workflows/vault-agent.yml` supports manual dispatch with an `agent_name` parameter:

1. Go to Actions > "Vault Agent" > Run workflow
2. Enter the agent name (default: `sample-vault-manager`)
3. Optionally toggle dry-run mode

The cron schedule runs `sample-vault-manager` every 6 hours by default. After each run, the workflow commits any memory changes (`agents/memory/`) back to the repo automatically.

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
| `LLM_API_KEY` | (required) | LLM provider API key |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | API endpoint |
| `LLM_MODEL` | `gpt-4o` | Model name |
| `AGENT_MAX_TURNS` | from agent config | Override max turns |
| `AGENT_DRY_RUN` | -- | `1` to skip write tools |
| `AGENT_CONFIRM_WRITES` | `1` | Write confirmation gate; set `0` to disable confirmation logic |
| `AGENT_NON_INTERACTIVE_WRITE_EXECUTE` | -- | `1` to auto-execute writes in non-interactive runs when confirmation is enabled |
| `AGENT_MAX_TOOL_RESPONSE` | `6000` | Max chars per tool response sent to LLM |
| `AGENT_NETWORK` | inferred | Optional run-log namespace override; controls which `run-log.<network>.jsonl` file is read/written |

### Vault Manager MCP Server

| Variable | Default | Description |
|---|---|---|
| `DEPLOYMENT_CONFIG` | `apps/web/src/config/sepolia-deployment.json` | Deployment addresses |
| `RPC_URL` | `sepolia` | Chain RPC |
| `PRIVATE_KEY` | -- | Required for write tools |

### Yahoo Finance MCP Server

No env vars required. Works out of the box.

### GitHub Actions Secrets

Required: `LLM_API_KEY`, `KEEPER_PRIVATE_KEY`, `SEPOLIA_RPC_URL`

Optional: `LLM_BASE_URL`, `LLM_MODEL`

---

## Architecture

```
agents/
  sample-vault-manager.md # Agent definition (soul + heartbeat)
  skills/                 # Reusable skill files (tool/API references)
    vault-manager.md      # Vault MCP tool reference, units, workflows
    yfinance.md           # Yahoo Finance search + quote reference
  mcp-servers.json        # MCP server registry (spawn commands)
  memory/                 # Per-agent persistent memory (committed to repo)
    sample-vault-manager/
      state.json
      run-log.sepolia.jsonl

scripts/
  agent-runner.mjs        # Generic runner (parses .md, loads skills, memory, vault lifecycle, LLM loop)
  vault-agent.mjs         # Backward-compatible wrapper for sample-vault-manager

apps/
  mcps/
    vault-manager/        # MCP server (on-chain vault reads + writes)
    yfinance/             # MCP server (Yahoo Finance search + quotes)
```
