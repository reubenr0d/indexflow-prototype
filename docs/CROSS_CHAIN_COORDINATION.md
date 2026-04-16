# Cross-Chain Coordination Layer

## Overview

The cross-chain coordination layer tracks **GMX pool depth** on each chain using a time-weighted view of `gmxVault.poolAmounts(usdc)`, **synchronizes** summarized pool state to peer chains over **Chainlink CCIP**, and exposes **proportional routing weights** so deposit (and future redeem) flows can favor chains with deeper available liquidity instead of winner-take-all routing. End-user flows can pair this with **Privy account abstraction** so the same smart wallet address is used across chains, making chain boundaries less visible in the product UX.

This document describes the Solidity modules under `src/coordination/`, how they interact with `OracleAdapter` for cross-chain oracle alignment, and the operational trust model.

## Contracts

### PoolReserveRegistry (`src/coordination/PoolReserveRegistry.sol`)

- **TWAP accumulator** over `gmxVault.poolAmounts(usdc)`: `observe()` advances a cumulative sum of the last sampled pool amount over elapsed time and derives `twapPoolAmount` from cumulative ÷ elapsed time since `twapStartTime` (see contract comments: full sliding-window checkpoints are not stored; the design favors gas efficiency and damping). `observe()` is intended to be called on hot paths (for example piggybacked on intent-related traffic).
- **Local snapshot and remote state**: `snapshot()` builds a `PoolState` struct (TWAP pool amount, instantaneous pool amount, reserved amount, **available liquidity** = pool minus reserved, utilization in bps, optional oracle config hash and broken-feed flag) and stores it as `lastLocalSnapshot`. Remote peers write into `remoteStates` via the registered **messenger** only.
- **Proportional routing weights**: `getRoutingWeights()` returns parallel arrays of chain selectors, **weights in basis points** (summing to 10_000), and per-chain **amounts** used for weighting. Weights are proportional to each chain’s `availableLiquidity`; chains whose remote snapshot is **older than `maxStaleness`** or marked **`hasBrokenFeeds`** contribute **zero** weight. If total available liquidity is zero, weight falls back to 100% on the local chain.
- **Circuit breaker**: `updateRemoteState` compares the new remote `twapPoolAmount` to the previous value when `maxDeltaPerUpdate > 0`; relative changes larger than that threshold (in bps of the old value) **revert** (`DeltaTooLarge`).
- **TWAP staleness fallback**: `_currentTwapPoolAmount()` returns the **instantaneous** `poolAmounts(usdc)` when `block.timestamp - twap.lastObservationTime > maxObservationAge`, so reads do not rely on an indefinitely stale TWAP if observations stop.

### CCIPReserveMessenger (`src/coordination/CCIPReserveMessenger.sol`)

- **Delta-triggered outbound broadcasts**: `broadcastPoolState()` calls `registry.snapshot()` then sends CCIP messages to all registered peers only if the TWAP pool amount moved by at least **`broadcastThresholdBps`** relative to `lastBroadcastedPoolAmount` **or** **`maxBroadcastInterval`** has elapsed since `lastBroadcastTime`. The default deploy script sets a **5%** threshold (`500` bps). The first broadcast after deployment treats delta as exceeded when `lastBroadcastedPoolAmount == 0`.
- **`maxBroadcastInterval` backstop**: Ensures periodic sync even when the pool is quiet.
- **Inbound rate limiting and peer validation**: `_ccipReceive` requires `message.sourceChainSelector` and decoded `sender` to match a registered **peer**. Per source chain, updates are capped at **`maxUpdatesPerHour`** within a rolling hour window (`RateLimited`).
- **LINK balance monitoring**: After each outbound send batch, `_checkFeeBalance()` compares the messenger’s fee token balance (LINK when `feeToken` is set, otherwise native) to **`lowFeeThreshold`** and emits **`LowFeeBalance`** when below threshold (monitoring hook; does not block sends).

### IntentRouter (`src/coordination/IntentRouter.sol`)

- **UUPS upgradeable** (`OwnableUpgradeable`, `UUPSUpgradeable`, `ReentrancyGuardUpgradeable`): holds **user USDC in escrow** for pending intents; upgrade authorization is **`onlyOwner`** (`_authorizeUpgrade`).
- **User flows**:
  - **`submitIntent`**: Pulls USDC (minus optional **`intentFee`** to **`treasury`**) into the router, records a **PENDING** deposit intent with optional `deadline`, bumps **`registry.observe()`**, and enforces **`maxActiveIntentsPerUser`**.
  - **`submitAndExecute`**: Same fee path, validates the basket against **`basketFactory.getAllBaskets()`**, deposits into the vault on **this chain**, transfers **shares** to `msg.sender`, and records an **EXECUTED** intent (local fast path).
  - **`executeIntent`** (**`onlyKeeper`**): Validates basket and that the intent targets **this** chain (`targetChain` must be `0` or `localChainSelector`); otherwise **`NotLocalChain`**. Deposits escrowed USDC and transfers minted shares to the intent user.
  - **`refundIntent`**: Anyone may call after **`maxEscrowDuration`** from **`createdAt`** for **PENDING** intents; USDC is returned to the user and status becomes **REFUNDED**.
- **Keeper whitelist**: **`approvedKeepers`** gates **`executeIntent`**; **`_validateBasket`** ensures the vault address is in the factory’s basket list (basket selection validation).

The **`IIntentRouter`** interface includes **`IntentType.REDEEM`** for a fuller deposit/redeem story; the **current `IntentRouter` implementation** only creates and executes **deposit** intents (`submitIntent` / `submitAndExecute` / `executeIntent` paths above).

Proportional **split execution** across chains is not fully encoded inside `IntentRouter` today; **`PoolReserveRegistry.getRoutingWeights()`** is the on-chain view integrators and keepers use to implement depth-proportional routing off-chain or in future router logic.

### CrossChainIntentBridge (`src/coordination/CrossChainIntentBridge.sol`)

- **Stateless CCIP relay** for **USDC + intent metadata**: only **`intentRouter`** may call **`routeCrossChain`**, which pulls USDC from the router and sends a CCIP message with **token transfer** to the destination bridge peer encoded in **`supportedChains`**.
- **Inbound**: Validates source chain and bridge sender against **`supportedChains`**, decodes **`CrossChainPayload`** (`intentId`, `user`, `targetBasket`), reads bridged USDC from **`destTokenAmounts`**, optionally picks the **first factory basket** if `targetBasket` is zero, **`deposit`**s into the target **`BasketVault`**, and transfers minted **shares to `payload.user`** (the same address across chains when that address is a **Privy smart wallet**).

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

CCIP, keeper, and Privy trust assumptions remain: message delivery liveness, fee payer solvency, keeper honesty for `executeIntent`, and wallet custody are outside these contracts’ core invariants.

## Deployment

Deploy and wire the coordination stack with Foundry:

```bash
PATH="$HOME/.foundry/bin:$PATH" forge script script/DeployCoordination.s.sol --root /path/to/snx-prototype --rpc-url $RPC_URL --broadcast
```

Required and optional environment variables are documented in **`script/DeployCoordination.s.sol`** (GMX vault, USDC, CCIP router, basket factory, oracle adapter, chain selector, fee token, treasury, quorum threshold, proposal TTL, optional peer wiring, keeper).

After deployment, register CCIP peers, supported bridge chains, **`registry.addRemoteChain`**, set **`OracleAdapter.setCanonicalMode(quorumContract)`** to lock config to the quorum, wire **`OracleConfigQuorum.addPeer`** on each chain pointing at every other chain's quorum contract, and fund **`CCIPReserveMessenger`** with LINK (or native) for fees.
