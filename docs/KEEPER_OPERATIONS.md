# Keeper service operations

The keeper service (`services/keeper/`) is the off-chain component that synchronizes cross-chain state in the hub-and-spoke architecture. It runs as a long-lived Node.js process, executing an epoch loop that reads on-chain state from all deployed chains and posts updates to `StateRelay` on every chain.

For contract-level interaction details, see [OPERATOR_INTERACTIONS.md](./OPERATOR_INTERACTIONS.md). For the curator's perspective, see [ASSET_MANAGER_FLOW.md](./ASSET_MANAGER_FLOW.md).

---

## What the keeper does

Each epoch (default 60 seconds), the keeper:

1. **Reads** all chains in parallel: discovers vaults via `BasketFactory.getAllBaskets()`, queries idle USDC balances, `perpAllocated`, and hub perp PnL from `VaultAccounting.getVaultPnL()`.
2. **Computes routing weights** — inverse-proportional to each chain's idle USDC. Chains with more idle capital get lower weights (discouraging further deposits), chains that need capital get higher weights.
3. **Computes global NAV** — `sum(all chains' idle USDC) + hub perpAllocated + hub perp PnL`. Distributes per-chain `globalPnLAdjustment` values so spoke share prices reflect hub perp performance.
4. **Posts `StateRelay.updateState()`** to every chain with the weight table and PnL adjustments.

---

## Setup

### Prerequisites

- Node.js 18+
- An Ethereum wallet private key funded with testnet ETH on all target chains (for gas)
- RPC URLs for each deployed chain

### Installation

The keeper is part of the root npm workspace, so installing once at the repo
root is enough:

```bash
npm install
```

### Environment variables

Create a `.env` file in `services/keeper/` or set these in your environment:

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | Yes | Hex-encoded private key for the keeper wallet |
| `SEPOLIA_RPC_URL` | Yes | Sepolia (hub) RPC endpoint |
| `FUJI_RPC_URL` | Per chain | Avalanche Fuji RPC endpoint |
| `ARBITRUM_SEPOLIA_RPC_URL` | Per chain | Arbitrum Sepolia RPC endpoint |
| `EPOCH_INTERVAL_MS` | No | Epoch interval in milliseconds (default: `60000`) |
| `KEEPER_CHAINS` | No | Comma-separated allowlist of chain names from `config/chains.json` to include each epoch (e.g. `sepolia,fuji`). Empty/unset means "every chain that has a deployment file and RPC URL". Production CI is currently scoped to `sepolia,fuji`. |

The keeper reads `config/chains.json` at startup and skips any chain that lacks an RPC URL or deployment config. Chains not in `KEEPER_CHAINS` (when set) are also skipped.

### Transaction execution

`StateRelay.updateState()` transactions on every chain are signed directly with `PRIVATE_KEY` via ethers. There is no external relayer. Make sure the keeper wallet is configured as the keeper on each `StateRelay`:

> **Security note:** Foundry's `cast send` (verified against v1.3.1) does NOT expose `ETH_PRIVATE_KEY` as an env-default for `--private-key` — only the keystore options have env support (`ETH_KEYSTORE` / `ETH_KEYSTORE_ACCOUNT` / `ETH_PASSWORD`). The vault-manager MCP (`apps/mcps/vault-manager/index.js`) and `scripts/update-yahoo-finance-prices.js` therefore have to pass `--private-key <hex>` on argv, which Node's `execFileSync` embeds verbatim into `Error.message` on a revert. A shared redactor at `scripts/lib/redact-secrets.mjs` is applied to every text path that leaves the agent runner (MCP responses, OpenAI messages, run-log entries committed back to git via the `commit-results` job, and the per-vault agent metadata file) so the secret cannot survive into artifacts or committed files. GitHub Actions still masks the literal secret in **runner logs** independently. If a `cast` invocation surface ever needs argv-free key handling, switch it to `--keystore` + `ETH_PASSWORD` with a v3 keystore generated at runtime.

```bash
cast call <StateRelay> "keeper()(address)" --rpc-url <rpc>
# if it doesn't match the keeper wallet:
cast send <StateRelay> "setKeeper(address)" <Keeper_Wallet> --rpc-url <rpc> --private-key <owner_key>
```

Keep the keeper wallet funded for gas on every active chain. Per-epoch state-sync costs are small (single-digit cents at testnet gas prices) but a depleted wallet means `lastUpdateTime` goes stale and spoke share prices degrade to idle-USDC-only.

### Running

```bash
# Development (with hot reload via tsx)
npm run dev

# Production
npm run build
npm start
```

### One-shot epoch (after deploy or seed)

Forge deploy and seed scripts trigger a single keeper epoch at the end so `StateRelay` emits `StateUpdated` and the Envio indexer can populate `/chains` data without starting the long-lived process first.

From the **repository root**:

```bash
npm run keeper:once
```

This builds `services/keeper`, sets `KEEPER_ONCE=1`, and loads `.env` from the repo root via `DOTENV_CONFIG_PATH` when `.env` exists. To skip (for example in CI), set `SKIP_KEEPER_ONCE=1`.

Example logs from a long-lived run (same epoch shape as `keeper:once`):

```
[keeper 2026-04-17T12:00:00.000Z] ─── Epoch start ───
[keeper 2026-04-17T12:00:00.050Z]   sepolia: 2 vaults, idle=50000.00 USDC, hubPnL=(u:1200.00, r:800.00)
[keeper 2026-04-17T12:00:00.100Z]   fuji: 1 vaults, idle=30000.00 USDC
[keeper 2026-04-17T12:00:00.150Z]   Routing weights:
[keeper 2026-04-17T12:00:00.150Z]     chain 16015286601757825753: 3750 bps
[keeper 2026-04-17T12:00:00.150Z]     chain 14767482510784806043: 6250 bps
[keeper 2026-04-17T12:00:00.200Z]   → Sending updateState to sepolia (3 vaults)
[keeper 2026-04-17T12:00:01.500Z]   ✓ sepolia updateState confirmed in block 1234567
[keeper 2026-04-17T12:00:02.000Z]   ✓ fuji updateState confirmed in block 7654321
[keeper 2026-04-17T12:00:02.000Z] ─── Epoch complete ───
```

---

## Chain configuration

The keeper reads chain topology from `config/chains.json`. Each entry specifies:

```json
{
  "sepolia": {
    "chainId": 11155111,
    "ccipChainSelector": "16015286601757825753",
    "rpcAlias": "sepolia",
    "role": "hub"
  },
  "fuji": {
    "chainId": 43113,
    "ccipChainSelector": "14767482510784806043",
    "rpcAlias": "fuji",
    "role": "spoke"
  }
}
```

Deployment addresses are loaded from `apps/web/src/config/<chain>-deployment.json`. Chains without a deployment file are skipped with a warning.

---

## Monitoring

### StateRelay staleness

The most critical monitoring target. If the keeper stops posting, `globalPnLAdjustment` values become stale after `maxStaleness` seconds and spoke share prices degrade to idle-USDC-only.

**What to monitor:**

- `StateRelay.lastUpdateTime()` on each chain — alert if `block.timestamp - lastUpdateTime > maxStaleness / 2`.
- `StateRelay.getGlobalPnLAdjustment(vault)` — the second return value is a `stale` boolean.
- Keeper process health — ensure the process is running and epoch logs are being written.

### Routing weight sanity

Weights should sum to 10,000 bps across all chains. If a chain's weight drops to 0, deposits on that chain will be blocked (if `minDepositWeightBps > 0`).

**What to monitor:**

- `StateRelay.getRoutingWeights()` on any chain — verify the full table.
- Watch for any single chain accumulating a disproportionate weight, which may indicate a stuck spoke or misconfigured deployment.

### Pending redemptions

Pending redemptions indicate that a spoke chain ran out of idle USDC during a redemption.

**What to monitor:**

- `BasketVault.pendingRedemptionCount()` on spoke chains — should trend toward zero as the keeper fills them.
- If pending count is growing, check hub idle USDC availability and CCIP bridge health.

---

## Troubleshooting

### Keeper fails to start

- **"Missing required env var: PRIVATE_KEY"** — Set `PRIVATE_KEY` in the environment or `.env` file.
- **"No chain contexts available"** — Check that `config/chains.json` exists and that RPC URLs are set for at least one chain.
- **"No deployment config for X"** — The chain is in `chains.json` but has no `apps/web/src/config/<chain>-deployment.json`. Deploy to that chain first or remove it from the config.

### Epoch fails for a specific chain

The keeper catches per-chain write errors and continues with other chains. Check the error log for:

- **Nonce issues** — The keeper wallet may have pending transactions. Wait for them to confirm or reset the nonce.
- **Insufficient gas** — Fund the keeper wallet on the affected chain.
- **"Timestamp not greater than lastUpdateTime"** — The epoch ran too quickly. This resolves on the next epoch.

### Share prices diverging across chains

If spoke share prices differ significantly from the hub:

1. Check `StateRelay.lastUpdateTime()` — stale data is the most common cause.
2. Verify the keeper is running and successfully posting to all chains.
3. Check that the hub's `VaultAccounting.getVaultPnL()` is returning expected values.
4. Restart the keeper to force an immediate epoch.

### Pending redemptions not being filled

1. Verify the keeper is detecting pending redemptions (check logs).
2. Ensure the hub has sufficient idle USDC to cover the shortfall.
3. Check CCIP bridge availability and `RedemptionReceiver` trust configuration.
4. As a fallback, manually send USDC to the spoke vault and call `processPendingRedemption(id)`.

---

## Adding a new chain

1. Add the chain entry to `config/chains.json` with `role: "spoke"`.
2. Deploy using `DeploySpoke.s.sol` or `bash scripts/deploy-all.sh --chain <name>`.
3. Save the deployment JSON to `apps/web/src/config/<chain>-deployment.json`.
4. Set the RPC URL env var (e.g. `NEW_CHAIN_RPC_URL`) and add the alias mapping in `services/keeper/src/index.ts` if needed.
5. Restart the keeper — it will pick up the new chain on the next startup and include it in routing weight calculations.

---

## Testing

The keeper has a comprehensive test suite covering routing weights, global NAV computation, pending redemption detection, and full epoch simulation:

```bash
cd services/keeper
npm test           # single run
npm run test:watch # watch mode
```

---

## Other Keepers

The state sync keeper is one of three keeper-style services in the repo. All three sign their own transactions with `PRIVATE_KEY`:

| Keeper | Script/Service | Transactions |
|--------|---------------|--------------|
| **State sync** | `services/keeper/` | `StateRelay.updateState()` |
| **Price sync** | `scripts/update-yahoo-finance-prices.js` | `OracleAdapter.submitPrices()`, `PriceSync.syncAll()` |
| **Vault agent** | `apps/mcps/vault-manager/` (`cast send`) | `openPosition()`, `closePosition()`, etc. |

Make sure the keeper wallet is authorised as a `keeper()` on each contract it writes to.

---

## External cron dispatch

GitHub Actions' built-in `schedule` trigger is best-effort and routinely drops scheduled events. For this repo it has historically delivered scheduled ticks only every ~100 minutes on average even when the cron expression asks for every 5 minutes (verified via the GitHub Actions REST API over the trailing ~100 scheduled runs). To guarantee cadence, all three CI keepers (`update-prices.yml`, `keeper.yml`, `vault-agent.yml`) accept a `repository_dispatch` event in addition to `schedule`, and there are two supported ways to drive it: an in-CI tick pusher (no PAT required, see below) or an external scheduler hitting GitHub's REST API.

The `schedule:` blocks on each workflow are kept as a free fallback — they still fire occasionally, just not reliably.

### In-CI tick pusher (no PAT, recommended for this repo)

[.github/workflows/cron-tick-pusher.yml](../.github/workflows/cron-tick-pusher.yml) is a fourth workflow whose only job is timing. It runs a single long-lived shell loop on a GitHub-hosted runner that:

1. Fires `repository_dispatch` of type `update-prices` at the start of each 5-min cycle.
2. Sleeps 30s (so the next dispatch doesn't queue at the same instant in the shared concurrency group), then fires `repository_dispatch` of type `keeper-tick`.
3. Every 12th tick (~60 min), additionally fires `repository_dispatch` of type `vault-agent-tick`.
4. Sleeps the remaining time so each cycle is exactly 5 min, regardless of how long the dispatches took.
5. After ~5h50m it calls `gh workflow run cron-tick-pusher.yml` to spawn the next iteration of itself, then exits.

This works without a PAT because GitHub's documented exception to the "events triggered by `GITHUB_TOKEN` don't recurse" rule explicitly names `workflow_dispatch` and `repository_dispatch` as the two events that DO create new workflow runs from `GITHUB_TOKEN`. The auto-issued token is enough; the workflow grants itself `actions: write` permission and uses `gh` CLI with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

Recovery paths if the self-dispatch ever fails:

- The pusher carries two backup `schedule:` entries (`0 */3 * * *` and `47 */6 * * *`). At the 3-hour cadence the bare-`schedule` trigger is reliable enough to restart the loop within 0-3 hours worst-case.
- Manually starting the pusher is one click: Actions → "Cron Tick Pusher" → "Run workflow".

Concurrency: the pusher uses its own `cron-tick-pusher` concurrency group (not `keeper-key-serialized`) so it never blocks its own children. The three keeper workflows still serialize against each other in `keeper-key-serialized` exactly as before.

To verify the pusher is doing its job, see [Verifying the wiring](#verifying-the-wiring) below.

### External scheduler (PAT-based, alternative)

If you prefer to drive the cadence from outside GitHub (e.g. you don't want any always-on runner consumption on a private repo), an external HTTPS scheduler can hit GitHub's REST API directly. This is the original setup before the in-CI pusher existed.

### Step 1 — Create a GitHub Personal Access Token

A fine-grained PAT scoped to this repo with **Actions: Read and Write** is enough.

1. https://github.com/settings/personal-access-tokens/new (fine-grained)
2. Resource owner: your user (or the org owning the repo)
3. Repository access → "Only select repositories" → pick `indexflow-prototype`
4. Permissions → Repository permissions → **Actions: Read and write**
5. Generate, copy the `github_pat_...` value. Treat as a secret.

A classic PAT with the `repo` scope also works but grants far more than needed; prefer the fine-grained token.

### Step 2 — Register cron jobs in the external scheduler

Any HTTP scheduler works (cron-job.org, Render cron, fly.io scheduled machines, GCP Cloud Scheduler, EventBridge). Configure one job per workflow:

| Workflow | Cadence | `event_type` |
|----------|---------|--------------|
| `update-prices.yml` | every 5 min (`*/5 * * * *`) | `update-prices` |
| `keeper.yml` | every 5 min, offset (`2-59/5 * * * *`) | `keeper-tick` |
| `vault-agent.yml` | hourly at :18 (`18 * * * *`) | `vault-agent-tick` |

Each job is a single HTTPS request:

- **Method:** `POST`
- **URL:** `https://api.github.com/repos/<owner>/<repo>/dispatches` (for example `https://api.github.com/repos/reubenr0d/indexflow-prototype/dispatches`)
- **Headers:**
  - `Authorization: Bearer <PAT>`
  - `Accept: application/vnd.github+json`
  - `X-GitHub-Api-Version: 2022-11-28`
  - `Content-Type: application/json`
- **Body:** `{"event_type":"<event_type from the table above>"}`

GitHub returns `204 No Content` on success. Any other status (most commonly `401` for an expired PAT or `404` if the repo/owner is wrong) means no run was created.

### Optional payloads

Only `vault-agent-tick` accepts a payload. To dispatch a single agent instead of the full matrix:

```json
{"event_type":"vault-agent-tick","client_payload":{"agent":"mining-manager"}}
```

`update-prices` and `keeper-tick` ignore `client_payload` — they always run their full default surface (all networks, all chains).

### Verifying the wiring

Whether you're running the in-CI pusher or the external scheduler, the verification is the same. Right after kickoff:

```bash
# In-CI pusher only: confirm a pusher run is in-progress (will show as one
# ~6h run that re-spawns itself indefinitely).
gh run list --workflow=cron-tick-pusher.yml --limit 5 \
  --json createdAt,status,event --jq '.[]'

# Either path: most recent schedule + dispatch runs for each keeper.
gh run list --workflow=update-prices.yml --limit 20 \
  --json createdAt,event,conclusion --jq '.[] | "\(.createdAt)\t\(.event)\t\(.conclusion)"'
gh run list --workflow=keeper.yml --limit 20 \
  --json createdAt,event,conclusion --jq '.[] | "\(.createdAt)\t\(.event)\t\(.conclusion)"'
gh run list --workflow=vault-agent.yml --limit 20 \
  --json createdAt,event,conclusion --jq '.[] | "\(.createdAt)\t\(.event)\t\(.conclusion)"'
```

After one full cadence cycle you should see `event=repository_dispatch` rows arriving every ~5 min for update-prices and keeper, every ~60 min for vault-agent, with `conclusion=success`. The occasional `event=schedule` row will still show up (when GitHub does deliver), and that's expected.

### Why not move price sync off GitHub Actions entirely?

A long-running service (Render/Fly/Railway/Cloud Run) running `scripts/update-yahoo-finance-prices.js` on its own internal timer would be even more reliable and is the standard production setup. The `repository_dispatch` path is intentionally lighter weight — it keeps all secrets, logs, retry behaviour, and concurrency control inside GitHub Actions, so the only thing the external service needs is a PAT and a cron expression. If price-sync latency requirements get tighter than the ~5-minute floor of any external HTTP-based scheduler, switch to a daemon instead.

---

## Related docs

- [OPERATOR_INTERACTIONS.md](./OPERATOR_INTERACTIONS.md) — `StateRelay.updateState()` contract call reference.
- [SHARE_PRICE_AND_OPERATIONS.md](./SHARE_PRICE_AND_OPERATIONS.md) — How `globalPnLAdjustment` feeds into `_pricingNav()`.
- [CROSS_CHAIN_COORDINATION.md](./CROSS_CHAIN_COORDINATION.md) — Hub-and-spoke architecture overview.
- [AGENTS_FRAMEWORK.md](./AGENTS_FRAMEWORK.md) — Multi-agent framework.
