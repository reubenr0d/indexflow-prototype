# Cross-Chain Coordination Layer

## Overview

The protocol uses a **hub-and-spoke** architecture to scale basket deposits across many EVM chains while concentrating perpetual-futures execution on a single hub.

- **Hub (Sepolia on testnet):** Runs the full perp stack — GMX liquidity, `VaultAccounting`, `OracleAdapter`, `PricingEngine`, `BasketVault`, `BasketFactory`, and `StateRelay`. All perp positions are opened, managed, and closed on the hub. USDC held on the hub funds perp capital directly; it never bridges out for that purpose.
- **Spokes (any EVM chain):** Deposit-only. Each spoke deploys `BasketVault`, `BasketFactory`, `StateRelay`, and `RedemptionReceiver`. No oracles, no GMX integration, no perp logic. Spokes hold user USDC and rely on the keeper for share-price accuracy.

An off-chain **keeper service** (`services/keeper/`) runs a periodic epoch loop that ties everything together:

1. Reads idle USDC balances and vault state from every chain.
2. Computes inverse-proportional **routing weights** (under-funded chains get higher weight).
3. Computes per-vault **global PnL adjustments** so spoke share prices reflect hub perp PnL.
4. Posts the weight table and PnL adjustments to every chain's `StateRelay`.
5. Monitors `RedemptionQueued` events and orchestrates cross-chain redemption fills via Chainlink CCIP.

Deposits are local transactions guarded on-chain. CCIP is used only for redemption shortfall fills. Weight and PnL updates are posted by the keeper via direct RPC calls — no CCIP needed for state sync.

## Architecture Diagram

```
                          ┌──────────────────────────────────────────────┐
                          │          Off-Chain Keeper Service            │
                          │  (reads all chains, computes weights & PnL)  │
                          └─────────────┬───────────────────┬────────────┘
                                        │ updateState()     │ updateState()
                    ┌───────────────────▼───────────┐ ┌─────▼──────────────────┐
                    │         HUB (Sepolia)          │ │    SPOKE N (any EVM)   │
                    │  ┌────────────────────────┐    │ │  ┌──────────────────┐  │
                    │  │ BasketVault            │    │ │  │ BasketVault      │  │
                    │  │  ├ deposit() ← guard   │    │ │  │  ├ deposit()     │  │
                    │  │  ├ redeem()             │    │ │  │  ├ redeem()      │  │
                    │  │  └ allocateToPerp()     │    │ │  │  └ (no perp)    │  │
                    │  ├────────────────────────┤    │ │  ├──────────────────┤  │
                    │  │ VaultAccounting        │    │ │  │ StateRelay       │  │
                    │  │ OracleAdapter          │    │ │  │ RedemptionReceiver│ │
                    │  │ PricingEngine          │    │ │  │ BasketFactory    │  │
                    │  │ GMX integration        │    │ │  └──────────────────┘  │
                    │  │ StateRelay             │    │ │                        │
                    │  │ BasketFactory          │    │ │                        │
                    │  └────────────────────────┘    │ │                        │
                    └────────────────────────────────┘ └────────────────────────┘
                                        │                        ▲
                                        │  CCIP USDC transfer    │
                                        └────────────────────────┘
                                       (redemption fills only)
```

## Contracts

### StateRelay (`src/coordination/StateRelay.sol`)

Deployed on every chain (hub and spokes). The single source of truth for keeper-posted routing weights and per-vault global PnL adjustments. Each instance caches its own chain's weight in `localWeight` for O(1) reads during deposits.

**Storage:**

| Field | Type | Purpose |
| --- | --- | --- |
| `keeper` | `address` | Authorised caller for `updateState` |
| `localChainSelector` | `uint64` | CCIP chain selector (set at construction) |
| `localWeight` | `uint256` | Cached weight for this chain (bps) |
| `maxStaleness` | `uint48` | Seconds after which PnL adjustments are stale |
| `lastUpdateTime` | `uint48` | Timestamp of last `updateState` call |
| `globalPnLAdjustment` | `mapping(address => int256)` | Per-vault signed PnL adjustment |
| `pnlUpdateTime` | `mapping(address => uint48)` | Per-vault PnL timestamp |

**Key functions:**

- **`updateState(uint64[] chains, uint256[] weights, address[] vaults, int256[] pnlAdjustments, uint48 ts)`** — Keeper-only. Accepts the full weight table (must sum to 10,000 bps, enforced on-chain) and per-vault signed PnL adjustments. Timestamps must be strictly monotonic. On write, iterates the chain table and caches this deployment's weight in `localWeight`.
- **`getLocalWeight() → uint256`** — Returns the cached basis-point weight for this chain. Returns 0 if the chain is absent from the weight table (deposits blocked).
- **`getRoutingWeights() → (uint64[], uint256[], uint256[])`** — Returns the full weight table (`chainSelectors[]`, `weights[]`, `amounts[]`). The `amounts` array is always zeros (compatibility shim for `PoolReserveRegistry` consumers).
- **`getGlobalPnLAdjustment(address vault) → (int256 pnl, bool isStale)`** — Returns the signed PnL adjustment and a staleness flag (true if older than `maxStaleness` or never set).

**Admin:**

- `setKeeper(address)` — Owner-only. Registers the keeper address.
- `setMaxStaleness(uint48)` — Owner-only. Configures the PnL staleness window.

### RedemptionReceiver (`src/coordination/RedemptionReceiver.sol`)

Minimal Chainlink CCIP receiver deployed on spoke chains. Accepts keeper-initiated USDC transfers for redemption shortfall fills.

**Inbound flow:**

1. Validates the source chain and sender against a `trustedSenders` allowlist.
2. Decodes the `RedemptionFillPayload` (target vault address and redemption ID).
3. Extracts USDC from the CCIP message's `destTokenAmounts`.
4. Transfers received USDC to the target vault.
5. Calls `vault.processPendingRedemption(id)` to complete the fill.

**Admin:**

- `setTrustedSender(uint64 chainSelector, address sender)` — Owner-only. Registers a trusted sender for a source chain (typically the hub's keeper relay or a dedicated fill contract).

### BasketVault Deposit Guard (`src/vault/BasketVault.sol`)

`BasketVault.deposit()` enforces the on-chain routing guard before accepting deposits:

```solidity
if (address(stateRelay) != address(0)) {
    uint256 weight = stateRelay.getLocalWeight();
    require(weight >= minDepositWeightBps, "Chain not accepting deposits");
}
```

- `minDepositWeightBps` is configurable per vault (default 0 = accept all deposits).
- When `stateRelay` is not set (single-chain deployment), the guard is skipped for backward compatibility.
- The UI splits deposits across chains proportionally, but each chain independently enforces its own minimum weight threshold. This is defense-in-depth: even if the UI routes incorrectly, the contract rejects deposits to over-funded chains.

### BasketVault Pricing NAV (`src/vault/BasketVault.sol`)

`_pricingNav()` combines local vault value with hub perp PnL via the state relay:

```
NAV = idleUSDC + localPnL + globalPnLAdjustment
```

- **Hub:** Reads `VaultAccounting.getVaultPnL()` for `localPnL`. The keeper posts `globalPnLAdjustment = 0` for the hub (it reads PnL directly).
- **Spoke:** `vaultAccounting` is `address(0)`, so `localPnL = 0`. The keeper-posted `globalPnLAdjustment` provides the spoke's pro-rata share of hub perp PnL. If the adjustment is stale (exceeds `maxStaleness`), it is excluded and the vault falls back to idle-USDC-only pricing.
- **Global NAV** (computed by keeper): `sum(all chains' idle USDC) + hub perp PnL`. The keeper distributes this as per-chain adjustments proportional to each chain's deposit share.

### BasketVault Pending Redemptions

When a spoke vault's local USDC reserves cannot cover a full redemption:

1. The vault pays what it can from idle USDC immediately.
2. Remaining shares are locked in the vault and a `PendingRedemption` is recorded (user, shares locked, USDC owed, timestamp).
3. A `RedemptionQueued` event is emitted.
4. The keeper detects the event, identifies a chain with excess reserves (or the hub), and sends USDC via CCIP through the spoke's `RedemptionReceiver`.
5. The receiver forwards USDC to the vault and calls `processPendingRedemption(id)`, which burns the locked shares and pays the user.

### PoolReserveRegistry (`src/coordination/PoolReserveRegistry.sol`)

Legacy contract retained on the hub for local GMX pool monitoring (TWAP over `gmxVault.poolAmounts(usdc)`). When `stateRelay` is configured via `setStateRelay()`, `getRoutingWeights()` delegates to `StateRelay` instead of computing from local/remote pool states. This allows existing consumers that reference the registry to transparently read keeper-posted weights without code changes.

On spoke chains, `PoolReserveRegistry` is not deployed. Spokes have no GMX pools to monitor.

## Keeper Service (`services/keeper/`)

The keeper is a TypeScript / Node.js service that runs an epoch loop at a configurable interval.

### Read Phase

For each chain in `config/chains.json` (skipping `local`):

1. Load the chain's deployment config (`apps/web/src/config/{chain}-deployment.json`).
2. Query `BasketFactory.getAllBaskets()` to enumerate vaults.
3. Read each vault's idle USDC balance (`ERC20.balanceOf(vault)`).
4. On the hub: read `VaultAccounting.getVaultPnL(vault)` for unrealised + realised PnL.

### Compute Phase

**Routing weights** (`computeRoutingWeights.ts`):

Inverse-proportional to idle USDC. Chains with less idle capital receive higher weight, steering deposits toward under-funded spokes. Edge cases: single chain → 10,000 bps; all chains at zero idle → equal split. Weights always sum to exactly 10,000 bps.

**Global PnL adjustments** (`computeGlobalNav.ts`):

The hub's adjustment is always 0 (it reads PnL directly from `VaultAccounting`). Each spoke receives:

```
spokeAdjustment = (spokeIdleUSDC / totalIdleUSDC) * hubPnL
```

where `hubPnL = unrealised + realised` from `VaultAccounting`.

### Write Phase

Post `StateRelay.updateState(chains, weights, vaults, pnlAdjustments, ts)` to every chain. The same weight table is sent to all instances; each caches its own local weight. Writes are fired in parallel across chains.

When `KEEPERHUB_API_KEY` is set, transactions are routed through [KeeperHub](https://app.keeperhub.com) for reliable execution with automatic retries, gas optimization, and MEV protection. See [KEEPER_OPERATIONS.md](./KEEPER_OPERATIONS.md#keeperhub-integration) for setup details.

### Redemption Monitoring (Planned)

The keeper monitors `RedemptionQueued` events across spoke chains. When detected, it identifies a source chain with excess reserves and initiates a Chainlink CCIP USDC transfer to the spoke's `RedemptionReceiver`. The fill payload encodes the target vault and redemption ID.

### Configuration

| Env var | Purpose |
| --- | --- |
| `PRIVATE_KEY` | Keeper wallet (must be registered on each `StateRelay`) |
| `EPOCH_INTERVAL_MS` | Loop interval (default 60,000 ms) |
| `SEPOLIA_RPC_URL` | Hub chain RPC |
| `FUJI_RPC_URL` | Spoke chain RPC (Avalanche Fuji) |
| `ARBITRUM_SEPOLIA_RPC_URL` | Spoke chain RPC (Arbitrum Sepolia) |
| `KEEPERHUB_API_KEY` | KeeperHub API key for reliable transaction execution (optional) |

RPCs are resolved from `config/chains.json` → `rpcAlias` → env var mapping in `services/keeper/src/index.ts`.

## USDC Flow Rules

USDC movement is strictly constrained:

| Flow | Allowed | Mechanism |
| --- | --- | --- |
| User → spoke vault (deposit) | Yes | Local `BasketVault.deposit()` |
| User → hub vault (deposit) | Yes | Local `BasketVault.deposit()` |
| Hub vault → GMX (perp capital) | Yes | `allocateToPerp()` on hub only |
| Spoke USDC → perp capital | **No** | Spoke USDC stays on-chain |
| Hub/excess chain → spoke (redemption fill) | Yes | CCIP via `RedemptionReceiver` |
| Spoke → hub (state sync) | **No** | Keeper reads state via RPC |

Perps use hub-local USDC exclusively. Spoke USDC is held idle and earns its share of hub PnL through the keeper-posted `globalPnLAdjustment`.

## Frontend Deposit Splitting

The frontend reads `StateRelay.getRoutingWeights()` across all chains and presents the weight distribution to the user. For multi-chain deposit orchestration:

1. Fetch the current weight table from any chain's `StateRelay` (all are identical after a keeper epoch).
2. Split the deposit amount proportionally across chains according to their weights.
3. The user approves and signs one transaction per target chain.
4. Each chain's `BasketVault.deposit()` independently enforces the `minDepositWeightBps` guard.

### Automated Multi-Chain Deposit Flow (Privy Users)

For users authenticated via Privy with embedded wallets, the frontend provides an automated multi-chain deposit flow that handles all transactions seamlessly:

1. **Routing Preview:** When the user enters a deposit amount and has "All Chains" view mode selected, the UI shows a routing breakdown with chain names, allocation percentages, and per-chain amounts.

2. **Confirmation:** A slide-up drawer presents the full routing breakdown with a visual bar chart. The user confirms once to start all transactions.

3. **Parallel Execution:** All chain transactions execute simultaneously:
   - For each target chain, the wallet switches chains automatically
   - If USDC allowance is insufficient, an approve transaction is sent first
   - The deposit transaction follows immediately after approval
   - All chains process in parallel, not sequentially

4. **Status Tracking:** Per-chain status indicators show:
   - Switching chain
   - Approving USDC
   - Depositing
   - Success / Error

5. **Minimizable UI:** Users can minimize the deposit drawer to a floating pill showing progress (e.g., "Depositing... 2/3 chains"). Transactions continue in the background.

6. **Gas Sponsorship:** When using Privy embedded wallets, gas fees are sponsored via Privy's `sendTransaction({ sponsor: true })` — users pay no gas.

**Key components:**
- `useParallelChainDeposits` hook — manages parallel execution state
- `useRoutingWeights` hook — fetches weights from `StateRelay`
- `MultiChainDepositDrawer` — the UI flow (preview → executing → complete)
- `ChainDepositRow` — per-chain status display

**Fallback:** If routing weights are unavailable or the user is not using Privy, the standard single-chain deposit flow is used.

## Trust Model and Failure Modes

| Risk | Mitigation |
| --- | --- |
| **Stale weights** | `BasketVault.deposit()` still succeeds using the last-posted weight. The keeper's epoch interval bounds staleness. `maxStaleness` on PnL adjustments prevents stale PnL from affecting share pricing — the vault falls back to idle-USDC-only NAV. |
| **Keeper liveness** | If the keeper goes offline, deposits continue on all chains at the last-posted weights. PnL adjustments become stale and are excluded from pricing (vault reverts to local-only NAV). Redemptions queue but cannot be filled cross-chain until the keeper resumes. |
| **Keeper honesty** | The keeper is a trusted operator. Weights must sum to 10,000 bps (enforced on-chain). PnL adjustments are signed values posted to a keeper-only function. Misbehavior is detectable: anyone can read the weight table and compare to actual chain balances. |
| **CCIP liveness** | CCIP is used only for redemption fills (not deposits or weight updates). A CCIP outage delays cross-chain redemption fills but does not block deposits, local redemptions, or weight updates. |
| **Spoke chain unavailable** | That spoke's weight drops to 0 in the next epoch (keeper reads fail → excluded from weight computation). Deposits are steered to remaining chains. Pending redemptions on the unavailable chain are delayed until it recovers. |
| **Hub chain unavailable** | No new PnL data is available. Spoke PnL adjustments become stale. Deposits still work on all spokes. Redemptions from local reserves still work. Cross-chain fills are blocked until the hub resumes. |

## Scaling to 100+ Chains

The hub-and-spoke model is designed for high chain count:

- **Spoke deployment is ultra-lightweight.** Each spoke needs only `BasketVault`, `BasketFactory`, `StateRelay`, and `RedemptionReceiver`. No oracle sync, no GMX integration, no perp logic.
- **No per-chain oracle sync.** Oracles live only on the hub. Spokes rely on the keeper-posted PnL adjustment for share pricing. Adding a new chain requires zero oracle configuration.
- **Keeper cost is O(N).** The keeper reads N chains and writes one `updateState` transaction to each. No O(N²) cross-chain messaging. State sync is via RPC, not CCIP.
- **Weight table scales linearly.** The full weight table is a pair of `uint64[]` + `uint256[]` arrays. At 100 chains this is ~3.2 KB of calldata per update — well within block gas limits.
- **Configurable epoch interval.** The keeper posts at operator-defined intervals (default 60s). For 100+ chains, the interval can be lengthened to manage RPC costs while still providing adequate freshness for deposit routing.

### Adding a New Spoke

1. Deploy the base stack and coordination contracts:
   ```bash
   ./scripts/deploy-chain.sh <chain-name>
   ```
2. Add the chain to `config/chains.json` with `"role": "spoke"`.
3. Register the keeper address on the new `StateRelay` via `setKeeper()`.
4. On spoke vaults, call `setStateRelay(relayAddress)` and `setMinDepositWeightBps(threshold)`.
5. On the spoke `RedemptionReceiver`, call `setTrustedSender(hubChainSelector, hubSender)`.
6. Fund the keeper wallet on the new chain for gas.
7. Restart the keeper — it auto-discovers the chain from `config/chains.json`.

## Deployment

### One-command cross-chain deploy

```bash
./scripts/deploy-chain.sh <chain-name>
```

Chain constants (CCIP router, chain selector, LINK token, role) are read from `config/chains.json`. Coordination addresses are appended to the chain's deployment JSON (`apps/web/src/config/{chain}-deployment.json`).

### Manual deployment

```bash
# 1. Base stack
CHAIN=sepolia forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast -vvv

# 2. Coordination layer (StateRelay, RedemptionReceiver on spokes)
CHAIN=sepolia forge script script/DeployCoordination.s.sol:DeployCoordination --rpc-url sepolia --broadcast -vvv

# 3. Wire trusted senders for RedemptionReceiver (spoke-side, pointing to hub sender)
LOCAL_CHAIN=fuji REMOTE_CHAIN=sepolia forge script script/WireCrossChainPeers.s.sol:WireCrossChainPeers --rpc-url fuji --broadcast -vvv
```

### Post-deployment checklist

1. Register the keeper address on each `StateRelay` via `setKeeper()`.
2. On spoke vaults, call `setStateRelay(relayAddress)` and `setMinDepositWeightBps(threshold)`.
3. On spoke `RedemptionReceiver`, call `setTrustedSender(hubChainSelector, hubSender)`.
4. Fund the keeper wallet on each chain for gas.
5. Start the keeper service: `cd services/keeper && npm start`.

## Legacy (Deprecated)

The following contracts were part of earlier architectures and are superseded by the hub-and-spoke model. They remain in the codebase for reference but are not deployed in new installations.

### IntentRouter

UUPS-upgradeable contract that held user USDC in escrow for pending deposit intents. Keepers executed intents locally or routed them cross-chain via `CrossChainIntentBridge`. **Replaced by** direct `BasketVault.deposit()` with on-chain routing guard — no escrow, no intent lifecycle.

### CrossChainIntentBridge

Stateless CCIP relay that transferred USDC + intent metadata to destination chains, with optional auto-deploy of vaults via `BasketFactory.createBasket()`. **Replaced by** spoke-side `BasketVault.deposit()` (user deposits directly) and `RedemptionReceiver` (for cross-chain redemption fills only).

### CCIPReserveMessenger

Delta-triggered CCIP broadcaster that synced `PoolReserveRegistry` snapshots between all chain pairs. Required LINK funding on every chain and O(N²) CCIP messages for N chains. **Replaced by** the keeper posting weights via direct RPC (O(N) transactions, no CCIP for state sync).

### OracleConfigQuorum

N-of-M quorum contract for cross-chain oracle configuration consensus. Proposals were broadcast via CCIP and auto-applied when threshold votes matched. No longer needed: oracle configuration is hub-only since spokes do not run oracles.
