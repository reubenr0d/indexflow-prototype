# Multi-Agent Framework

Define autonomous vault management agents as markdown files. Each agent gets its own vault (auto-deployed on first run), persistent memory across cron runs, and access to MCP tool servers for on-chain operations and market data. No JavaScript required.

## Quick Start

```bash
# Install MCP server deps (one-time)
npm --prefix apps/vault-manager-mcp install
npm --prefix apps/yfinance-mcp install

# Run the sample agent
LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent:run -- sample-vault-manager

# Dry-run mode (observe only, no on-chain writes)
AGENT_DRY_RUN=1 LLM_API_KEY=sk-... npm run agent:run -- sample-vault-manager

# Backward-compatible shortcuts for the sample agent
LLM_API_KEY=sk-... npm run agent:dry
LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent
```

On first run, the agent automatically deploys its own vault. Subsequent runs manage that vault using saved memory.

---

## Creating a New Agent

1. Create a markdown file at `agents/<name>.md`
2. Add YAML frontmatter with config (MCP servers, vault name, fees, write tools)
3. Write the system prompt as the markdown body
4. Add a `## User Prompt` section at the end with the initial task
5. Run it -- the runner handles vault deployment and memory automatically

### Agent File Format

```markdown
---
name: gold-trader
description: Trades gold and mining stocks
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
| `mcpServers` | yes | -- | List of MCP server names from `agents/mcp-servers.json` |
| `writeTools` | no | `[]` | Tools blocked in dry-run mode |
| `vaultName` | no | agent name | Name for the auto-deployed vault |
| `depositFeeBps` | no | `50` | Vault deposit fee in basis points |
| `redeemFeeBps` | no | `50` | Vault redeem fee in basis points |
| `maxTurns` | no | `20` | Max agent loop iterations |
| `temperature` | no | `0.2` | LLM temperature |

### Prompt Structure

The markdown body (everything after the frontmatter `---`) is the **system prompt**. It tells the LLM who it is, what rules to follow, and how to use the available tools.

The `## User Prompt` heading splits the body. Everything below it becomes the **initial user message** that kicks off the agent loop. If omitted, a generic "execute your assigned task" message is used.

The runner automatically injects additional sections into the system prompt at runtime:
- **Your Vault**: the vault address (or instructions to deploy one)
- **Recent Run History**: summaries of the last 5 runs
- **Dry Run Mode**: whether write tools are active

---

## Vault Lifecycle

Each agent manages exactly one vault. The runner handles deployment automatically:

- **First run**: no memory exists, the runner instructs the agent to create a vault via `create_vault`, then captures the new address from the `get_all_vaults` response.
- **Subsequent runs**: the runner loads the vault address from memory and injects it into the system prompt.
- **Agent file changes**: the runner computes a SHA-256 hash of the `.md` file. If the hash changes (new strategy, updated config, etc.), it triggers a new vault deployment. The old vault remains on-chain but is no longer managed.

---

## Memory

Each agent has persistent memory stored at `agents/memory/<agent-name>/`:

```
agents/memory/sample-vault-manager/
  state.json        # Current state (vault address, file hash, timestamps)
  run-log.jsonl     # Append-only history (one JSON line per run)
```

**state.json** tracks the vault address, file hash for change detection, and timestamps:
```json
{
  "vaultAddress": "0xabc...",
  "vaultName": "Mining Basket",
  "agentFileHash": "sha256:abc123...",
  "deployedAt": "2026-04-11T10:00:00Z",
  "lastRunAt": "2026-04-11T16:00:00Z"
}
```

**run-log.jsonl** is appended after every run (including failures) with tool calls, actions, and the agent's summary:
```json
{"timestamp":"...","agent":"sample-vault-manager","vault":"0x...","turns":5,"toolCalls":[...],"writeActions":[...],"errors":[],"summary":"..."}
```

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
    "args": ["apps/vault-manager-mcp/index.js"],
    "envPassthrough": ["DEPLOYMENT_CONFIG", "RPC_URL", "PRIVATE_KEY"]
  },
  "yfinance-mcp": {
    "command": "node",
    "args": ["apps/yfinance-mcp/index.js"],
    "envPassthrough": []
  }
}
```

| Field | Description |
|---|---|
| `command` | Executable to spawn |
| `args` | Arguments (paths relative to project root) |
| `envPassthrough` | Env var names forwarded to the server process |

To add a new MCP server: add the server code under `apps/`, then add an entry to `agents/mcp-servers.json`.

---

## Tool Reference

### Market Data (yfinance-mcp)

| Tool | Purpose | Key params |
|---|---|---|
| `yfinance_search` | Find stocks, ETFs, indices by name/ticker | `query`, `limit` |
| `yfinance_quote` | Get live prices with USD conversion, day change, volume | `symbols[]` |

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
| `wire_asset` | Register new tradeable asset | `symbol`, `seedPriceUsd` |
| `create_vault` | Deploy new basket vault | `name`, `depositFeeBps`, `redeemFeeBps` |
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

---

## Environment Variables

### Agent Runner

| Variable | Default | Description |
|---|---|---|
| `LLM_API_KEY` | (required) | LLM provider API key |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | API endpoint |
| `LLM_MODEL` | `gpt-4o` | Model name |
| `AGENT_MAX_TURNS` | from agent config | Override max turns |
| `AGENT_DRY_RUN` | -- | `1` to skip write tools |
| `AGENT_MAX_TOOL_RESPONSE` | `6000` | Max chars per tool response sent to LLM |

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
  sample-vault-manager.md # Example agent definition (prompt + config)
  mcp-servers.json        # MCP server registry (spawn commands)
  memory/                 # Per-agent persistent memory (committed to repo)
    sample-vault-manager/
      state.json
      run-log.jsonl

scripts/
  agent-runner.mjs        # Generic runner (parses .md, memory, vault lifecycle, LLM loop)
  vault-agent.mjs         # Backward-compatible wrapper for sample-vault-manager

apps/
  vault-manager-mcp/      # MCP server (on-chain vault reads + writes)
  yfinance-mcp/           # MCP server (Yahoo Finance search + quotes)
```
