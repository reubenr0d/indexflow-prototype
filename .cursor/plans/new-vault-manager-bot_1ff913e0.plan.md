---
name: new-vault-manager-bot
overview: Six standalone vault manager bot options (one markdown = one agent) covering macro, momentum, event-driven, neutral-yield, narrative, and value/momentum theses, with the local env setup and operational guidance a new dev needs to pick one and run it.
todos:
  - id: env-setup
    content: "Local env setup: clone, npm install, install per-MCP deps, create .env with SEPOLIA_RPC_URL / LLM_API_KEY / PRIVATE_KEY / DEPLOYMENT_CONFIG / RPC_URL"
    status: pending
  - id: preflight
    content: "Pre-flight: AGENT_DRY_RUN=1 npm run agent:run -- sample-vault-manager works end-to-end against Sepolia"
    status: pending
  - id: pick-thesis
    content: "Pick ONE of options A–F (suggested order: E, A, then B/D/C/F)"
    status: pending
  - id: create-md
    content: "Create agents/<name>.md by copying sample-vault-manager.md, adapt frontmatter (mcpServers, writeTools, entryMode, entryDirection, vaultName) and body (thesis, rules, ## User Prompt)"
    status: pending
  - id: build-mcps
    content: Build any new MCP servers the chosen thesis needs (historical-bars-mcp, events-mcp, news-mcp, fundamentals-mcp), register them in agents/mcp-servers.json, add a matching agents/skills/<name>.md reference
    status: pending
  - id: runner-policy
    content: "If thesis is B or D: extend scripts/agent-runner.mjs to accept entryDirection: long_short and allow short opens; smoke-test in dry run"
    status: pending
  - id: dry-run
    content: "Dry-run the new agent end-to-end, read the ## Thesis summary, refine the body prompt and policy frontmatter until proposals look sane"
    status: pending
  - id: live-run
    content: Live run on Sepolia with interactive write confirmation, verify vault state via vault-manager-mcp reads and the apps/web dev server
    status: pending
  - id: memory-iterate
    content: Iterate over 5+ runs reading agents/memory/<agent>/run-log.<network>.jsonl; tune thresholds, universe, and prompt wording
    status: pending
  - id: ci-wire
    content: "After the bot is proven: wire into .github/workflows/vault-agent.yml (matrix entry or workflow_dispatch with agent_name), append entry to AGENT_DEPLOYMENT_MEMORY.md, add CHANGELOG entry"
    status: pending
isProject: false
---

## Background for the new dev

Vault manager bots in this repo are markdown files at `agents/<name>.md` with YAML frontmatter, run by `scripts/agent-runner.mjs`. The runner: spawns whatever MCP servers the agent declares, injects skill files as tool reference, auto-deploys a vault on first run, and persists per-agent state under `agents/memory/<name>/`. See [docs/AGENTS_FRAMEWORK.md](docs/AGENTS_FRAMEWORK.md) for the full contract; existing examples are [agents/sample-vault-manager.md](agents/sample-vault-manager.md) and [agents/0g-vault-manager.md](agents/0g-vault-manager.md).

Constraints worth knowing before you start:

- The trade primitive is **long/short perp via `VaultAccounting`** + USDC-only collateral. Spot swaps and lending are NOT in the MCP.
- Yahoo (`apps/mcps/yfinance/index.js`) currently exposes only `yfinance_search` and `yfinance_quote` — a single live snapshot. Anything historical needs a new MCP (see "Optional MCP extensions" below).
- The runner has a frontmatter switch `entryDirection` that today only accepts `long_only`. Long-short bots (B, parts of A/D/F) need a small runner change.
- Cron cadence is **6h** (`.github/workflows/vault-agent.yml`). Memory is committed back to the repo on every CI run.

Read these before coding: [docs/AGENTS_FRAMEWORK.md](docs/AGENTS_FRAMEWORK.md), [agents/sample-vault-manager.md](agents/sample-vault-manager.md), [agents/skills/vault-manager.md](agents/skills/vault-manager.md), [scripts/agent-runner.mjs](scripts/agent-runner.mjs), and [apps/mcps/vault-manager/index.js](apps/mcps/vault-manager/index.js).

---

## 1. Local environment setup

### 1.1 Prerequisites

- Node 20+, npm 10+
- Foundry on PATH (per repo rule, agents shells should use `PATH="/Users/<you>/.foundry/bin:$PATH"` and `--root` for forge commands)
- A funded Sepolia EOA for `PRIVATE_KEY` (this signs vault deploys + position writes; it becomes the vault owner)
- A Sepolia RPC URL (Alchemy/Infura/etc.)
- An LLM key (OpenAI by default; can swap to 0G Compute later)

### 1.2 Clone and install

```bash
git clone <repo-url> snx-prototype
cd snx-prototype
npm install

npm --prefix apps/mcps/vault-manager install
npm --prefix apps/mcps/yfinance install
npm --prefix apps/mcps/0g-storage install
npm --prefix apps/mcps/keeperhub install
```

### 1.3 Create `.env` at repo root

Copy [.env.example](.env.example) to `.env` and fill in at minimum:

```bash
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
LLM_API_KEY=sk-...
PRIVATE_KEY=0x...                 # funded Sepolia EOA, becomes vault owner
DEPLOYMENT_CONFIG=apps/web/src/config/sepolia-deployment.json
RPC_URL=sepolia                   # Foundry-style alias resolved via foundry.toml
```

Optional, per agent capability:

```bash
ZG_PRIVATE_KEY=0x...              # only if running an agent that uses 0g-storage-mcp
KEEPERHUB_API_KEY=kh_...          # only if you want vault-manager-mcp writes via KeeperHub
LLM_MODEL=gpt-4o-mini             # cheaper for iteration
AGENT_DRY_RUN=1                   # default for first run!
```

The runner auto-loads `.env` and `.env.local` (gitignored) on startup; shell exports still override.

### 1.4 Pre-flight check

```bash
AGENT_DRY_RUN=1 npm run agent:run -- sample-vault-manager
```

You should see: MCP servers spawn, vault state read, Yahoo quotes pulled, no writes. If this works, your environment is good and you can build a new agent against the same setup.

### 1.5 First real run of your new bot

```bash
npm run agent:run -- <your-agent-name>
```

The runner will detect "no remembered vault" and instruct the model to call `create_vault`, then save the new address to `agents/memory/<your-agent-name>/state.json`. Subsequent runs reuse it.

---

## 2. Six bot options (one markdown each)

Pick ONE to start; the others can ship as follow-ups. For each: file, thesis, frontmatter shape, MCP servers needed, and the bullet list of new code (if any) it requires beyond a markdown file.

### Option A — Macro Regime Rotator

`agents/macro-regime-rotator.md`

**Thesis:** Defensive vs cyclical tilt driven by VIX, US 10Y yield, DXY, and gold. Risk-off (VIX > 25, curve flattening, DXY rising) → flatten cyclicals, long gold/T-bills ETF. Risk-on → long broad equity / cyclical baskets.

**Frontmatter highlights:**

```yaml
name: macro-regime-rotator
mcpServers: [vault-manager-mcp, yfinance-mcp, historical-bars-mcp]
writeTools: [wire_asset, create_vault, set_vault_assets, allocate_to_perp, withdraw_from_perp, open_position, close_position]
vaultName: Macro Regime Vault
entryMode: none                    # regime logic in body, not generic momentum gate
maxNewPositionsPerRun: 3
```

**Universe seeds:** `^VIX`, `^TNX`, `DX-Y.NYB`, `GC=F`, `SPY`, `XLU`, `XLP`, `XLY`, `XLK`.

**New code:** `historical-bars-mcp` (see section 3). No runner change needed if rotations are realised as long-only swaps between defensive/cyclical baskets.

### Option B — Sector Long-Short Relative Momentum

`agents/sector-momentum-ls.md`

**Thesis:** Within a chosen sector basket each cycle, long top-2 by trailing 60-day total return, short bottom-2. Cross-sectional momentum is one of the most durable factors. Roughly market-neutral.

**Frontmatter highlights:**

```yaml
name: sector-momentum-ls
mcpServers: [vault-manager-mcp, yfinance-mcp, historical-bars-mcp]
entryMode: momentum_volume
entryMomentumPctMin: 0             # body computes its own ranking
entryDirection: long_short         # NEW value; requires runner change
maxNewPositionsPerRun: 4
```

**Universe seeds (one sector at a time):** AU mining `BHP.AX, RIO.AX, FMG.AX, S32.AX, NCM.AX, NST.AX`, US semis `NVDA, AVGO, AMD, INTC, MU, AMAT`, etc.

**New code:**

- `historical-bars-mcp` (see section 3)
- `scripts/agent-runner.mjs`: extend the `entryDirection` policy gate to allow `long_short` and stop blocking `isLong: false` opens for these agents. Search the runner for `entryDirection` and `long_only` to find the gate.

### Option C — Earnings / Event-Driven Trader

`agents/event-driven-trader.md`

**Thesis:** Open into post-earnings-drift names (positive surprise, gap up + above-average volume), flatten / reduce gross exposure 24h before scheduled FOMC / CPI / NFP prints, restore after.

**Frontmatter highlights:**

```yaml
name: event-driven-trader
mcpServers: [vault-manager-mcp, yfinance-mcp, events-mcp, historical-bars-mcp]
maxNewPositionsPerRun: 3
```

**New code:**

- `events-mcp` — earnings calendar + econ calendar. Cheapest path: scrape Yahoo earnings (`yahoo-finance2` has `quoteSummary({modules:["earnings","calendarEvents"]})`) plus a static config of upcoming macro events. Tools: `get_upcoming_earnings({tickers})`, `get_macro_events({windowHours})`.
- `historical-bars-mcp` for surprise sizing.

### Option D — Delta-Neutral Yield Curator

`agents/delta-neutral-yield.md`

**Thesis:** Hold a curated long basket of oracle-tracked equities and short equivalent perp size on the same names. Net delta ~0; vault earns the protocol's deposit/redeem fees and any funding edge. Bot's job is keeping the hedge sized to inventory and rolling positions cheaply.

**Frontmatter highlights:**

```yaml
name: delta-neutral-yield
mcpServers: [vault-manager-mcp, yfinance-mcp]
entryMode: none
entryDirection: long_short          # NEW value
positionSizingMode: model_decides
```

**New code:**

- Runner: same `entryDirection: long_short` change as Option B.
- Optional vault-manager MCP helper `compute_hedge_plan({vault})` that reads basket exposures from `get_vault_state` and returns the perp short sizes needed to net to delta 0. Implementing this in the model prompt instead of as a tool is also viable for a first cut.

### Option E — Narrative-Led Thematic Curator

`agents/narrative-curator.md`

**Thesis:** Picks ONE investable narrative (e.g. "Aussie battery materials", "AI infra confluence", "China stimulus reflation"), wires a coherent basket, writes an investor-letter-style `## Thesis` every run citing real headlines. Edge is brand and curation, not signal. Pairs naturally with 0G storage so the letter chain is verifiable.

**Frontmatter highlights:**

```yaml
name: narrative-curator
mcpServers: [vault-manager-mcp, yfinance-mcp, news-mcp, 0g-storage-mcp]
writeTools: [..., state_set, log_append]
maxTurns: 25
```

**New code:** `news-mcp` (see section 3). Reuses existing `0g-storage-mcp` for the audit trail; no runner change.

### Option F — Value-vs-Momentum Hybrid

`agents/value-momentum.md`

**Thesis:** Long stocks that are cheap on fundamentals (low P/E, positive FCF yield, manageable debt) AND show positive 3-month price momentum. Combining value + momentum factors is well-documented to outperform either alone.

**Frontmatter highlights:**

```yaml
name: value-momentum
mcpServers: [vault-manager-mcp, yfinance-mcp, fundamentals-mcp, historical-bars-mcp]
maxNewPositionsPerRun: 4
```

**New code:** `fundamentals-mcp` (see section 3) and `historical-bars-mcp`.

---

## 3. Optional MCP extensions referenced above

Add servers under `apps/mcps/<name>/` and register them in [agents/mcp-servers.json](agents/mcp-servers.json). Mirror the layout of `apps/mcps/yfinance/index.js`.

- `**historical-bars-mcp`** (unblocks A, B, C, F)
  - Wraps `yahoo-finance2`'s `chart()` / `historical()`.
  - Tools: `get_bars({symbol, range, interval})` returning OHLCV; `compute_returns({symbol, lookbackDays})`; `compute_zscore({symbolA, symbolB, lookbackDays})` for pairs.
  - No env vars (same as existing yfinance MCP).
- `**events-mcp`** (unblocks C)
  - `get_upcoming_earnings({tickers, windowDays})` from `yahoo-finance2` `quoteSummary({modules:["calendarEvents","earnings"]})`.
  - `get_macro_events({windowHours})` — start with a static JSON of FOMC/CPI/NFP dates committed in-repo; a real calendar API is a follow-up.
- `**news-mcp`** (unblocks E)
  - `get_news({tickers, limit})` from `yahoo-finance2.search()` (`news` array) or a free RSS aggregator. Returns `{title, source, publishedAt, url}` arrays.
  - Keep it dumb — no LLM summarization in the MCP; the agent body does that.
- `**fundamentals-mcp`** (unblocks F)
  - `get_fundamentals({symbol})` from `yahoo-finance2.quoteSummary({modules:["summaryDetail","financialData","defaultKeyStatistics"]})`. Surface P/E, P/B, FCF, debt-to-equity, dividend yield.

Add a corresponding `agents/skills/<name>.md` reference for any new MCP — strategy-free, just the tool API and units, mirroring [agents/skills/yfinance.md](agents/skills/yfinance.md).

---

## 4. Long-short policy change (only needed for B and D)

The runner currently enforces `entryDirection: long_only`. Two-line-ish change in [scripts/agent-runner.mjs](scripts/agent-runner.mjs):

- Accept `long_short` as a valid value.
- When `long_short`, allow `open_position` calls with `isLong: false` instead of blocking them.
- Keep the existing momentum/volume gate orthogonal to direction (or skip it for these agents by setting `entryMode: none`).

Add a quick unit-style test or at least an `AGENT_DRY_RUN=1` smoke check that a short proposal isn't filtered.

---

## 5. Operational advice for the new dev

### Run order on day 1

1. Get `AGENT_DRY_RUN=1 npm run agent:run -- sample-vault-manager` working end-to-end against Sepolia.
2. Pick ONE option (A–F). Copy [agents/sample-vault-manager.md](agents/sample-vault-manager.md), rename, adapt frontmatter and body. Don't add MCP servers you don't need.
3. Run it dry: `AGENT_DRY_RUN=1 npm run agent:run -- <your-agent>`. Read the proposed tool calls and the `## Thesis` summary.
4. When the dry run looks sane, drop `AGENT_DRY_RUN`. Default behaviour is **interactive write confirmation**; you'll get a prompt before any on-chain write. Type `approve` or just give feedback.
5. Verify on-chain via `get_vault_state` and the web app at `apps/web` (`npm run dev` in `apps/web`).

### Iteration tips

- Edit the markdown body freely — runner does NOT redeploy the vault on prompt edits, only on deployment fingerprint changes (network / `DEPLOYMENT_CONFIG` / `RPC_URL`).
- To start fresh with a new vault, delete `agents/memory/<your-agent>/` and re-run.
- Use `LLM_MODEL=gpt-4o-mini` while iterating on prompt wording; switch back to `gpt-4o` for serious runs.
- `AGENT_MAX_TOOL_RESPONSE` (default 6000 chars) truncates tool output — bump it if your `historical-bars-mcp` returns big payloads.
- Run logs land in `agents/memory/<agent>/run-log.<network>.jsonl`. They're committed by CI; lean on them as the agent's "spreadsheet".

### Safety rails (don't trip the repo deployment rules)

- Per [AGENTS.md](AGENTS.md), do not modify any cloud deployment unless explicitly asked. Local dry runs and Sepolia writes from your own EOA are fine; touching production / GitHub Actions secrets is not.
- Per [AGENT_DEPLOYMENT_MEMORY.md](AGENT_DEPLOYMENT_MEMORY.md), append a ledger entry when you create a new vault on a shared network so future agents know it's owned.
- ABI rule: if you change any contract, regenerate ABIs via `forge build` + `node scripts/extract-abis.js`, never edit `apps/web/src/abi/*.ts` or `apps/subgraph/abis/*.json` by hand.
- Do not push to GitHub Actions cron until the bot has had 5+ successful manual runs on Sepolia.

### Wiring into CI (last step, after the bot is proven)

[.github/workflows/vault-agent.yml](.github/workflows/vault-agent.yml) currently runs `sample-vault-manager` every 6h. To run yours on cron, either:

- Add a second matrix entry / job for your agent name, OR
- Trigger via `workflow_dispatch` with `agent_name: <your-agent>` until you're confident.

Required GitHub secrets are already documented in [docs/AGENTS_FRAMEWORK.md](docs/AGENTS_FRAMEWORK.md): `LLM_API_KEY`, `KEEPER_PRIVATE_KEY`, `SEPOLIA_RPC_URL`. Optional per-bot: `ZG_PRIVATE_KEY`, `KEEPERHUB_API_KEY`.

### When to ask for help vs improvise

- New MCP server (sections 3): improvise — they're ~150 lines, the existing yfinance MCP is a good template.
- Runner policy change (section 4): improvise but leave a CHANGELOG entry; the gate logic is small.
- New write tool on the vault-manager MCP (e.g. `compute_hedge_plan`): improvise; unit it manually with `cast call` parity if it does anything non-trivial.
- Anything that touches contracts under `src/`: stop and check, because that triggers ABI regen + subgraph redeploy + web app rebuild.

### Suggested triage order

If the dev wants the fastest path to a deployed working bot: **E (narrative curator)** ships with just one new MCP and zero runner changes. **A (macro regime)** is the next-cheapest. **B and D** are higher-impact but require the long-short runner change. **C and F** want the most new infra.