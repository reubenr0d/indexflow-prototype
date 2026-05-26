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

Post `StateRelay.updateState(chains, weights, vaults, pnlAdjustments, ts)` to every chain. The same weight table is sent to all instances; each caches its own local weight. Writes are fired in parallel across chains, signed directly with `PRIVATE_KEY` via ethers.

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
2. **Resolve the per-chain twin vault address by name.** A "basket" is conceptually one product, but each chain has its own independent `BasketVault` deployment — a Sepolia vault address never exists on Fuji and vice-versa. The frontend iterates `BasketFactory.getAllBaskets()` on every configured chain and matches by `BasketVault.name()` (case-insensitive, whitespace-trimmed). See `apps/web/src/hooks/useVaultAddressByName.ts`.
3. **Filter the routing weights to chains that have a deployed twin.** If the basket only exists on Sepolia, the Fuji weight is dropped and 100% routes to Sepolia (with a clear "this basket is not deployed on Fuji" notice in the UI). If twins exist on every chain in the weight table, the split goes ahead unchanged.
4. The user approves and signs one transaction per target chain. Each chain's `BasketVault.deposit()` independently enforces the `minDepositWeightBps` guard.

### Per-chain twin basket requirement

To deposit into a basket from "All Chains" view, the basket must be deployed on every chain you want it to receive routing weight from. **Both creation paths now do this fan-out automatically** so you only have to deal with the manual recipe below when back-filling an existing single-chain basket.

#### Automatic (new baskets)

Both the agent MCP and the web admin UI now create + wire spoke twins in one shot:

- **MCP `create_vault`** (`apps/mcps/vault-manager/index.js` + `apps/mcps/vault-manager/multichain-create.mjs`): after creating the hub vault, enumerates every `config/chains.json` `role: "spoke"` entry whose `apps/web/src/config/<chain>-deployment.json` exists AND whose RPC URL is resolvable from `<RPC_ALIAS_UPPER>_RPC_URL` env (e.g. `FUJI_RPC_URL`), then runs `createBasket(name, fees)` → `setStateRelay(<spoke.stateRelay>)` → `setAssets([keccak256("USDC")])` against each spoke. The response includes a `twins: [{ chain, vaultAddress, success, txHashes, error? }]` array; the top-level `vaultAddress` stays the hub address for back-compat with the agent runner. Pass `deployToSpokes: false` to opt out.
- **Admin UI** (`apps/web/src/app/admin/baskets/page.tsx` + `apps/web/src/hooks/useCreateMultichainBasket.ts`): the create form shows a per-chain checkbox section (hub fixed-checked; spokes default-selected for every chain with both `basketFactory` AND `stateRelay` configured) and a per-step progress panel with live status, vault addresses, and per-step tx hashes. Failures on individual spokes don't roll back the hub — the operator can retry the failed spoke separately.

Both paths use the same stub asset id (`keccak256("USDC")` = `0xd6aca1be9729c13d677335161321649cccae6a591554772516700f986f942eaa`), so baskets created via either path look identical on-chain and the deposit confirm modal's `useVaultAddressByName` lookup finds them both.

#### Manual recipe (back-filling existing baskets)

For baskets that pre-date the automatic fan-out (or when you want to add a twin on a newly configured spoke), the recommended deployment pattern is:

1. Deploy on the hub via `BasketFactory.createBasket(name, depositFeeBps, redeemFeeBps)` — wires the oracle adapter automatically.
2. Deploy on each spoke via the same factory call. The spoke deployment will not have an oracle adapter wired (spokes don't run the oracle stack), so call `setAssets(bytes32[])` with at least one stub asset id (`keccak256("USDC")`, same pattern as `DeploySpoke.s.sol::_maybeBootstrapSpokeBasket`) to unblock `deposit()` (which requires `assets.length > 0`).
3. On every chain, call `setStateRelay(stateRelay)` so the deposit weight guard is active.
4. Optionally seed the spoke vault with mock USDC via `topUpReserve(amount)` so it has idle liquidity before any user deposits arrive.

If twins are missing, the deposit confirm modal falls back to single-chain mode and surfaces the missing chains in a warning banner. The user can still deposit successfully — the deposit just doesn't split.

### Unified Deposit Confirm Modal

The web app now routes every deposit — single-chain or multi-chain — through one `DepositConfirmModal`. The user enters the amount once on the panel; the modal then bundles approve and deposit per chain so there is no separate "Approve USDC" click.

1. **Preview phase:** Enter an amount and click "Deposit" / "Multi-Chain Deposit" on the panel. The modal opens with a routing summary bar, per-chain rows showing chain name, %, USDC amount, and a live gas estimate (`Fuel` icon). Per-chain rows also indicate whether the chain needs an approval based on a pre-flight `allowance(owner, vault)` read.

2. **Expandable details:** A collapsible "Routing & network details" panel shows the per-chain approve and deposit gas estimates, an indicator when the deposit estimate fell back to a constant (because the vault has no allowance yet), expected shares per chain, and the aggregated cross-chain network cost.

3. **Execution phase:** On Confirm, the modal walks each chain sequentially (so the deployer-wallet nonce is never raced across two simultaneous writes): per chain it sends `approve(vault, amount)` only if `needsApprovalPerChain[chainId]` is true, then `deposit(amount)`. After each successful deposit it invalidates the wagmi/react-query allowance cache for that chain so the panel button immediately reflects the consumed approval.

4. **Status tracking:** Per-chain rows surface `switching` → `approving` → `depositing` → `success`/`error` with the matching `0x...` tx hashes. The same chain rows are mirrored into the global `TransactionDock` via `useOptionalTransactionActions`, so minimizing the modal during execution does not lose progress — the wrapper component stays mounted (only the dialog content unmounts) so the per-chain hook keeps running and the mirroring effect keeps dispatching updates into the dock. Each in-flight parent record carries a `meta.onResume` callback that the dock card uses to maximize the dialog back; that callback is cleared on success (no value in re-opening a confirmed deposit) and preserved on failure so users can tap the failed card to maximize and hit Retry.

5. **Gas sponsorship:** When the user is on a Privy embedded wallet, both approve and deposit go through `sendSponsoredTx({ sponsor: true })`. With an external wallet (no Privy / E2E mode), `useParallelChainDeposits` falls back to `getWalletClient` from `@wagmi/core` and calls `switchChainAsync` before each tx.

**Key components:**

- `useParallelChainDeposits` hook — orchestrates approve + deposit sequencing per chain and invalidates allowance caches on success.
- `useAllowancesPerChain` hook — pre-flight per-chain allowance read used to compute `needsApprovalPerChain`.
- `useChainGasEstimates` hook — per-chain `estimateGas` + `getGasPrice` for the details panel; deposit estimate falls back to a constant when no allowance is yet in place.
- `useRoutingWeights` hook — fetches weights from `StateRelay`.
- `DepositConfirmModal` — the unified preview/executing/complete/error flow.

**Fallback:** If routing weights are unavailable or only one chain matches, the modal collapses to a single-chain row and still drives the same approve + deposit pipeline.

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

## Related reading

- [Cross-Chain Liquidity Routing: Hub-and-Spoke Deposit Splitting with On-Chain Guards](/blog/cross-chain-liquidity-routing) — how routing weights, deposit guards, and the Privy stepper work in practice.
- [Cross-Chain Coordination Is an Infrastructure Problem, Not a Marketing Feature](/blog/cross-chain-coordination-infrastructure-not-marketing) — why multi-chain expansion is an operations problem, not a logo slide.
