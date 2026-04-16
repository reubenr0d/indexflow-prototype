# Cross-Chain Coordination Layer

## Overview

The cross-chain coordination layer tracks **GMX pool depth** on each chain using a time-weighted view of `gmxVault.poolAmounts(usdc)`, **synchronizes** summarized pool state to peer chains over **Chainlink CCIP**, and exposes **proportional routing weights** so deposit (and future redeem) flows can favor chains with deeper available liquidity instead of winner-take-all routing. End-user flows can pair this with **Privy account abstraction** so the same smart wallet address is used across chains, making chain boundaries less visible in the product UX.

This document describes the Solidity modules under `src/coordination/`, how they interact with `OracleAdapter` for cross-chain oracle alignment, and the operational trust model.

## Contracts

### PoolReserveRegistry (`src/coordination/PoolReserveRegistry.sol`)

- **TWAP accumulator** over `gmxVault.poolAmounts(usdc)`: `observe()` advances a cumulative sum of the last sampled pool amount over elapsed time and derives `twapPoolAmount` from cumulative ÷ elapsed time since `twapStartTime` (see contract comments: full sliding-window checkpoints are not stored; the design favors gas efficiency and damping). `observe()` is intended to be called on hot paths (for example piggybacked on intent-related traffic).
- **Local snapshot and remote state**: `snapshot()` builds a `PoolState` struct (TWAP pool amount, instantaneous pool amount, reserved amount, **available liquidity** = pool minus reserved, utilization in bps, optional oracle config hash and broken-feed flag) and stores it as `lastLocalSnapshot`. Remote peers write into `remoteStates` via the registered **messenger** only.
- **Proportional routing weights**: `getRoutingWeights()` returns parallel arrays of chain selectors, **weights in basis points** (summing to 10_000), and per-chain **amounts** used for weighting. Weights are proportional to each chain's `availableLiquidity`; chains whose remote snapshot is **older than `maxStaleness`** or marked **`hasBrokenFeeds`** contribute **zero** weight. If total available liquidity is zero, weight falls back to 100% on the local chain.
- **Circuit breaker**: `updateRemoteState` compares the new remote `twapPoolAmount` to the previous value when `maxDeltaPerUpdate > 0`; relative changes larger than that threshold (in bps of the old value) **revert** (`DeltaTooLarge`).
- **TWAP staleness fallback**: `_currentTwapPoolAmount()` returns the **instantaneous** `poolAmounts(usdc)` when `block.timestamp - twap.lastObservationTime > maxObservationAge`, so reads do not rely on an indefinitely stale TWAP if observations stop.

### CCIPReserveMessenger (`src/coordination/CCIPReserveMessenger.sol`)

- **Delta-triggered outbound broadcasts**: `broadcastPoolState()` calls `registry.snapshot()` then sends CCIP messages to all registered peers only if the TWAP pool amount moved by at least **`broadcastThresholdBps`** relative to `lastBroadcastedPoolAmount` **or** **`maxBroadcastInterval`** has elapsed since `lastBroadcastTime`. The default deploy script sets a **5%** threshold (`500` bps). The first broadcast after deployment treats delta as exceeded when `lastBroadcastedPoolAmount == 0`.
- **`maxBroadcastInterval` backstop**: Ensures periodic sync even when the pool is quiet.
- **Inbound rate limiting and peer validation**: `_ccipReceive` requires `message.sourceChainSelector` and decoded `sender` to match a registered **peer**. Per source chain, updates are capped at **`maxUpdatesPerHour`** within a rolling hour window (`RateLimited`).
- **LINK balance monitoring**: After each outbound send batch, `_checkFeeBalance()` compares the messenger's fee token balance (LINK when `feeToken` is set, otherwise native) to **`lowFeeThreshold`** and emits **`LowFeeBalance`** when below threshold (monitoring hook; does not block sends).

### IntentRouter (`src/coordination/IntentRouter.sol`)

- **UUPS upgradeable** (`OwnableUpgradeable`, `UUPSUpgradeable`, `ReentrancyGuardUpgradeable`): holds **user USDC in escrow** for pending intents; upgrade authorization is **`onlyOwner`** (`_authorizeUpgrade`).
- **User flows**:
  - **`submitIntent`**: Pulls USDC (minus optional **`intentFee`** to **`treasury`**) into the router, records a **PENDING** deposit intent with optional `deadline`, bumps **`registry.observe()`**, and enforces **`maxActiveIntentsPerUser`**.
  - **`submitAndExecute`**: Same fee path, validates the basket against **`basketFactory.getAllBaskets()`**, deposits into the vault on **this chain**, transfers **shares** to `msg.sender`, and records an **EXECUTED** intent (local fast path).
  - **`executeIntent`** (**`onlyKeeper`**): Validates basket and that the intent targets **this** chain (`targetChain` must be `0` or `localChainSelector`); otherwise **`NotLocalChain`**. Deposits escrowed USDC and transfers minted shares to the intent user.
  - **`executeIntentCrossChain`** (**`onlyKeeper`**): Routes a pending intent to a remote chain via **`CrossChainIntentBridge`**. Accepts optional vault config (`basketName`, `depositFeeBps`, `redeemFeeBps`) for auto-deploying a vault on the destination chain if none exists. Validates that `targetChain` is neither `0` nor the local chain (`NotRemoteChain`), that the **bridge** is set (`BridgeNotSet`), and optional basket address match. Approves USDC to the bridge, calls **`routeCrossChain`** (which sends USDC + intent metadata + vault config over CCIP), stores the returned **`ccipMessageId`** on the intent, and sets status to **`IN_FLIGHT`**. The user's `activeIntentCount` is decremented immediately since the escrow has been released to the bridge. When vault config is provided, the bridge uses a higher CCIP gas limit (`ccipGasLimitWithDeploy`) to cover contract deployment costs on the destination.
  - **`refundIntent`**: Anyone may call after **`maxEscrowDuration`** from **`createdAt`** for **PENDING** intents; USDC is returned to the user and status becomes **REFUNDED**. Intents that are **`IN_FLIGHT`** or **`EXECUTED`** cannot be refunded.
- **Keeper whitelist**: **`approvedKeepers`** gates **`executeIntent`** and **`executeIntentCrossChain`**; **`_validateBasket`** ensures the vault address is in the factory's basket list (local execution only — cross-chain basket validation is deferred to the destination bridge).
- **Intent lifecycle**: `PENDING` → `EXECUTED` (local) or `PENDING` → `IN_FLIGHT` (cross-chain, USDC in CCIP transit) → shares delivered on destination. `PENDING` → `REFUNDED` if `maxEscrowDuration` expires.

The **`IIntentRouter`** interface includes **`IntentType.REDEEM`** for a fuller deposit/redeem story; the **current `IntentRouter` implementation** only creates and executes **deposit** intents.

Keepers use **`PoolReserveRegistry.getRoutingWeights()`** to determine which chain to route each intent to, then call **`executeIntent`** (local) or **`executeIntentCrossChain`** (remote) accordingly. Proportional splitting across multiple chains for a single intent is handled off-chain by keepers submitting separate intents or splitting at the UX layer.

### CrossChainIntentBridge (`src/coordination/CrossChainIntentBridge.sol`)

- **Stateless CCIP relay** for **USDC + intent metadata**: only **`intentRouter`** may call **`routeCrossChain`**, which pulls USDC from the router and sends a CCIP message with **token transfer** to the destination bridge peer encoded in **`supportedChains`**. The CCIP payload includes optional vault config (`basketName`, `depositFeeBps`, `redeemFeeBps`) for auto-deploying a vault on the destination. Returns the **`ccipMessageId`** so the caller can track the message.
- **Inbound**: Validates source chain and bridge sender against **`supportedChains`**, decodes **`CrossChainPayload`**, reads bridged USDC from **`destTokenAmounts`**, and resolves the target basket: uses `targetBasket` if set, otherwise the first factory basket if any exist. If no baskets exist on the destination and the payload includes vault config (non-empty `basketName`), auto-deploys a new vault via **`basketFactory.createBasket`** and transfers ownership to the configurable **`vaultOwner`** address, emitting **`BasketAutoDeployed`**. If no baskets exist and no config is provided, reverts with **`NoBasketAvailable`**. After resolving the target, **`deposit`**s USDC and transfers minted **shares to `payload.user`** (the same address across chains when that address is a **Privy smart wallet**).
- **`vaultOwner`**: Configurable address (defaults to contract owner) that receives ownership of auto-deployed vaults. Set via **`setVaultOwner`**.
- **Gas limits**: `ccipGasLimit` (default 400,000) for deposit-only messages; `ccipGasLimitWithDeploy` (default 2,500,000) when vault config is present, covering contract deployment gas costs on the destination.

### OracleConfigQuorum (`src/coordination/OracleConfigQuorum.sol`)

- **Symmetric deployment**: the same contract is deployed on every chain — no single canonical chain is required. Each instance registers its peers via **`addPeer(chainSelector, quorumAddress)`**.
- **Propose and broadcast**: owner on any chain calls **`proposeConfig(symbol, feedType, staleness, deviation, decimals)`**. The quorum contract records the local vote, computes a **config hash** (matching `OracleAdapter._assetHash`, which excludes `feedAddress`), and broadcasts the proposal to all registered peers via CCIP.
- **Quorum consensus**: each chain stores incoming votes keyed by **(assetId, sourceChainSelector)**. When **`quorumThreshold`** non-expired votes share the same config hash, the config is auto-applied to the local **`OracleAdapter`** (preserving the existing chain-specific `feedAddress`). Votes expire after **`proposalTtl`** (default 24 hours) to prevent stale votes from lingering.
- **Emergency bypass**: owner may call **`forceApplyConfig`** to apply config locally without quorum (bootstrap or emergency).

On **`OracleAdapter`**, **`setCanonicalMode(quorumContract)`** locks **`configureAsset`** so only the quorum contract can apply config changes; **`disableCanonicalMode`** is an owner emergency escape hatch. See `src/perp/OracleAdapter.sol`.

## Trust Model and Failure Modes

| Risk | Mitigation in this layer |
| --- | --- |
| **Stale data** | Remote chains excluded from routing when `block.timestamp - remote.timestamp > maxStaleness`; TWAP falls back to instantaneous pool read after **`maxObservationAge`**. |
| **Herding / single-chain dominance** | **`getRoutingWeights`** allocates basis points by **available liquidity** across eligible chains, not winner-take-all to the deepest pool unless others are stale or zero. |
| **CCIP cost** | Outbound pool sync is **delta-triggered** (default **5%** move) plus **`maxBroadcastInterval`** backstop; **`minBroadcastInterval`** reduces spam. |
| **Short-horizon manipulation** | TWAP window and observation cadence dampen spot moves; deploy defaults use a **30-minute** `twapWindow` (see `script/DeployCoordination.s.sol`). |
| **Escrow stuck funds** | **`maxEscrowDuration`** with permissionless **`refundIntent`**. |
| **Spoofing / message floods** | Inbound **peer allowlist**, **per-chain hourly rate limit**, and **`maxDeltaPerUpdate`** on remote registry updates. |

CCIP, keeper, and Privy trust assumptions remain: message delivery liveness, fee payer solvency, keeper honesty for `executeIntent` / `executeIntentCrossChain`, and wallet custody are outside these contracts' core invariants.

## Deployment

### One-command cross-chain deploy

Deploy the full stack (base + coordination) and wire cross-chain peers:

```bash
./scripts/deploy-chain.sh <chain-name> --peer <existing-chain>
```

This deploys the base stack (`Deploy.s.sol`), the coordination layer (`DeployCoordination.s.sol`), and wires bidirectional peers (`WireCrossChainPeers.s.sol`) between the new chain and the existing chain in a single workflow.

Chain constants (CCIP router, chain selector, LINK token) are read from **`config/chains.json`**. Contract addresses from the base deployment are read from the chain's deployment JSON (`apps/web/src/config/{chain}-deployment.json`). Coordination addresses are appended to the same JSON after deploy.

### Manual deployment

For fine-grained control, run each step individually:

```bash
# 1. Base stack
CHAIN=sepolia forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast -vvv

# 2. Coordination layer (reads chain constants from config/chains.json, contract addrs from deployment JSON)
CHAIN=sepolia TREASURY=0x... forge script script/DeployCoordination.s.sol:DeployCoordination --rpc-url sepolia --broadcast -vvv

# 3. Wire peers (run once per direction)
LOCAL_CHAIN=sepolia REMOTE_CHAIN=fuji forge script script/WireCrossChainPeers.s.sol:WireCrossChainPeers --rpc-url sepolia --broadcast -vvv
LOCAL_CHAIN=fuji REMOTE_CHAIN=sepolia forge script script/WireCrossChainPeers.s.sol:WireCrossChainPeers --rpc-url fuji --broadcast -vvv
```

`DeployCoordination.s.sol` also supports legacy env-var mode (without `CHAIN`) for backward compatibility — see the script's NatSpec for required env vars.

### Post-deployment

After deployment and peer wiring, set **`OracleAdapter.setCanonicalMode(quorumContract)`** to lock config to the quorum, and fund **`CCIPReserveMessenger`** with LINK (or native) for CCIP fees.
