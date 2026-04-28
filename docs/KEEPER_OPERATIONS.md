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

```bash
cd services/keeper
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
| `KEEPERHUB_API_KEY` | No | KeeperHub API key for reliable transaction execution |
| `KEEPER_CHAINS` | No | Comma-separated allowlist of chain names from `config/chains.json` to include each epoch (e.g. `sepolia,fuji`). Empty/unset means "every chain that has a deployment file and RPC URL". Production CI is currently scoped to `sepolia,fuji`. |
| `KEEPERHUB_CHAINS` | No | Comma-separated allowlist of chains that should route through KeeperHub. Other chains in `KEEPER_CHAINS` fall back to direct ethers signing with `PRIVATE_KEY`. Empty/unset means "all chains use KeeperHub when `KEEPERHUB_API_KEY` is set". Today: `sepolia,fuji`. |

The keeper reads `config/chains.json` at startup and skips any chain that lacks an RPC URL or deployment config. Chains not in `KEEPER_CHAINS` (when set) are also skipped.

### KeeperHub Integration

When `KEEPERHUB_API_KEY` is set, the keeper routes `StateRelay.updateState()` transactions through [KeeperHub](https://app.keeperhub.com) for reliable execution. Routing is per-chain and gated by `KEEPERHUB_CHAINS` (default: every active chain).

**Benefits:**

- **Automatic retries** with exponential backoff on transient failures
- **Smart gas estimation** (~30% cheaper than baseline)
- **MEV protection** via private transaction routing
- **Full audit trail** for debugging and compliance

**Setup:**

1. Get an API key from [app.keeperhub.com](https://app.keeperhub.com/settings/api-keys)
2. Set `KEEPERHUB_API_KEY` in your environment or `.env` file
3. Authorize the KeeperHub wallet as a keeper on each `StateRelay` you want routed through KeeperHub:
   ```bash
   # Get the KeeperHub wallet address from the dashboard
   # Then on each chain, run:
   cast send <StateRelay> "setKeeper(address)" <KeeperHub_Wallet> --rpc-url <rpc> --private-key <owner_key>
   ```
4. Add those chain names to `KEEPERHUB_CHAINS` (e.g. `sepolia`). Chains in `KEEPER_CHAINS` but not in `KEEPERHUB_CHAINS` continue to sign directly with `PRIVATE_KEY`.

**Mixed routing:**

Chains can have different `StateRelay.keeper()` addresses, so the keeper supports mixed routing per epoch. Today both deployed chains route through KeeperHub:

| Chain | `keeper()` address | KeeperHub network id | Auto-funded? |
|---|---|---|---|
| Sepolia (`0xB837…9CD9`) | `0xBAefbc6D…e409` (KeeperHub) | `sepolia` (named) | Yes |
| Fuji (`0x0A56…22A2`) | `0xBAefbc6D…e409` (KeeperHub) | `43113` (numeric chain id) | **No — top up manually** |

Verify the configured `keeper()` on a relay before flipping the path:

```bash
cast call <StateRelay> "keeper()(address)" --rpc-url <rpc>
```

**Funding the KeeperHub wallet on non-named networks:**

KeeperHub auto-funds the managed wallet only on networks it natively names. For chains reached via numeric chain id (e.g. Fuji `43113`), the wallet starts empty and you'll see `insufficient funds for gas * price + value: balance 0` on the first write. Top up directly:

```bash
PATH="/Users/reuben/.foundry/bin:$PATH" \
cast send <KeeperHub_Wallet> --value 0.5ether \
  --rpc-url fuji --private-key <funder_key>
```

Per-epoch state-sync on Fuji costs ~3.8e-5 AVAX at 25 gwei, so 0.5 AVAX ≈ 3 months of 5-minute cron. Monitor `cast balance <KeeperHub_Wallet> --rpc-url fuji` and refill before it depletes (a stuck Fuji keeper will let `lastUpdateTime` go stale and degrade spoke share prices to idle-USDC-only).

**Fallback behavior:**

When `KEEPERHUB_API_KEY` is not set, the keeper uses direct `ethers.js` transactions signed with `PRIVATE_KEY` for every chain. This works but lacks the retry, gas optimization, and MEV protection features.

**Logs:**

With KeeperHub enabled, epoch logs show the execution path:

```
[keeper ...] [KeeperHub] Enabled for transaction execution
[keeper ...] → [KeeperHub] Sending updateState to sepolia (3 vaults)
[keeper ...] ✓ [KeeperHub] sepolia updateState confirmed: 0x...
```

### Running

```bash
# Development (with hot reload via tsx)
npm run dev

# Production
npm run build
npm start
```

### One-shot epoch (after deploy or seed)

Forge deploy and seed scripts trigger a single keeper epoch at the end so `StateRelay` emits `StateUpdated` and subgraphs can populate `/chains` data without starting the long-lived process first.

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

## Other Keepers Using KeeperHub

The state sync keeper is one of three keepers that support KeeperHub execution:

| Keeper | Script/Service | Transactions | KeeperHub Support |
|--------|---------------|--------------|-------------------|
| **State sync** | `services/keeper/` | `StateRelay.updateState()` | Yes |
| **Price sync** | `scripts/update-yahoo-finance-prices.js` | `OracleAdapter.submitPrices()`, `PriceSync.syncAll()` | Yes |
| **Vault agent** | `apps/mcps/vault-manager/` | `openPosition()`, `closePosition()`, etc. | Yes |

All three keepers use the shared `lib/keeperhub.mjs` client library. When `KEEPERHUB_API_KEY` is set, transactions route through KeeperHub; otherwise they fall back to direct execution.

For the price sync keeper, you must also authorize the KeeperHub wallet on the `OracleAdapter`:

```bash
cast send <OracleAdapter> "setKeeper(address)" <KeeperHub_Wallet> --rpc-url <rpc> --private-key <owner_key>
```

---

## Related docs

- [OPERATOR_INTERACTIONS.md](./OPERATOR_INTERACTIONS.md) — `StateRelay.updateState()` contract call reference.
- [SHARE_PRICE_AND_OPERATIONS.md](./SHARE_PRICE_AND_OPERATIONS.md) — How `globalPnLAdjustment` feeds into `_pricingNav()`.
- [CROSS_CHAIN_COORDINATION.md](./CROSS_CHAIN_COORDINATION.md) — Hub-and-spoke architecture overview.
- [AGENTS_FRAMEWORK.md](./AGENTS_FRAMEWORK.md) — Multi-agent framework with KeeperHub MCP server.
