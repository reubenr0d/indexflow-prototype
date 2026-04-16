# Curator & asset manager flow

## What is a curator?

A curator is the person (or agent) who owns and operates a basket vault. Think of them as a portfolio manager: they decide which assets the basket tracks, how much capital to deploy into leveraged perpetual positions, and when to take profits or cut losses. In return, they earn fees on every deposit and redemption that flows through their vault.

The curator's core job is balancing two competing goals. On one side, they want to put capital to work through perp positions to generate returns that grow the vault's NAV and attract more depositors. On the other side, they need to keep enough idle USDC in the vault so that investors can redeem their shares on demand. Getting this balance right — keeping investors liquid while generating returns — is what separates a good curator from a bad one.

**Hub-and-spoke topology:** Perp positions can only be opened on the **hub chain (Sepolia)**, where `VaultAccounting` and the GMX pool are deployed. Spoke chains (Fuji, and potentially 100+) are **deposit-only** — they accept investor USDC but have no perp module. As a curator, **you do not need to interact with spoke chains for perp operations**. All position management (`allocateToPerp`, `withdrawFromPerp`, `openPosition`, `closePosition`) happens exclusively on the Sepolia hub. The keeper service handles all cross-chain state synchronization automatically:

- **Routing weights:** The keeper posts routing weights to `StateRelay` on every chain each epoch, steering new deposits toward Sepolia when more perp capital is needed.
- **PnL propagation:** The keeper computes global NAV and posts `globalPnLAdjustment` to spoke chains so share prices stay consistent.
- **Redemption fills:** When spoke-chain investors redeem more than the local idle USDC, the keeper orchestrates cross-chain CCIP fills from the hub.

`allocateToPerp` uses Sepolia-local USDC only; spoke-chain USDC is not directly bridgeable to the perp module (the routing weights handle this indirectly by directing new deposits to the hub).

Curators don't custody investor funds directly. The smart contracts enforce all accounting: capital moves between the vault and the perp module through on-chain transactions, positions are opened in the VaultAccounting contract's name (not the curator's wallet), and PnL flows back into the vault's NAV automatically. The curator's power is limited to the functions described in this document.

For oracle and feed syncing operations, see [PRICE_FEED_FLOW.md](./PRICE_FEED_FLOW.md).

---

## Roles and permissions

- **Investor** — Deposits USDC, receives basket shares, redeems shares for USDC. Cannot move capital between vault and perp, cannot open positions.
- **Basket owner / curator (`BasketVault` owner)** — Controls basket composition, fee structure, reserve policy, and the capital bridge between vault and perp module:
  `setAssets`, `setFees`, `setVaultAccounting`, `setOracleAdapter`, `setMaxPerpAllocation`, `setMinReserveBps`, `allocateToPerp`, `withdrawFromPerp`, `collectFees`.
- **VaultAccounting owner (protocol operator)** — Controls vault registration, asset-to-token mappings, and risk limits:
  `registerVault`, `deregisterVault`, `mapAssetToken`, `setMaxOpenInterest`, `setMaxPositionSize`, `setPaused`.
- **Position caller** — `openPosition` / `closePosition` on VaultAccounting are restricted to `msg.sender == vault` or `msg.sender == owner()`.

---

## A curator's typical session

Before diving into the contract-level details, here is what a curator's routine looks like in plain language:

1. **Check vault health.** Look at idle USDC balance, current reserve ratio, and how much capital is deployed to perp. Make sure investors can still redeem comfortably.

2. **Review open positions.** For each position, check the unrealised PnL, current leverage, and how close the position is to liquidation. Compare on-chain oracle prices with live market prices to spot stale feeds.

3. **Decide on changes.** Should you close a winning position and lock in profit? Is a losing position approaching your stop-loss threshold? Is there idle capital that should be deployed? Has market volatility changed enough to warrant adjusting your reserve buffer?

4. **Execute.** Make the contract calls — close losers, open new positions, adjust allocations. Each action is a separate transaction.

5. **Verify.** After each transaction, check that the on-chain state matches your intent: position tracking, available capital, reserve levels, and NAV.

The sections below explain each of these steps at the contract level.

---

## End-to-end manager sequence

### 1) Basket setup and wiring

This is the one-time setup you do when creating a new basket vault. You are deploying the vault, telling it which assets it tracks, and connecting it to the perp trading infrastructure.

1. `BasketFactory.createBasket(name, depositFeeBps, redeemFeeBps)` (optional factory path)
   - Internal: deploys `BasketVault`.
   - Internal: calls `basket.setFees(...)`.
   - Internal: if factory `vaultAccounting` is set, calls `basket.setVaultAccounting(vaultAccounting)`.
   - Internal: transfers basket ownership to creator.

2. `Basket owner -> BasketVault.setAssets(assetIds)` (explicit post-create setup)
   - Internal: validates each asset id is active in `OracleAdapter`.
3. `Basket owner -> BasketVault.setVaultAccounting(vaultAccounting)`
   - Internal: sets perp bridge address used by `allocateToPerp` / `withdrawFromPerp`.

4. `VaultAccounting owner -> VaultAccounting.registerVault(basketVault)`
   - Internal: initializes vault state (`depositedCapital`, `realisedPnL`, `openInterest`, `collateralLocked`, `positionCount`, `registered`).

5. `VaultAccounting owner -> VaultAccounting.mapAssetToken(assetId, gmxIndexToken)`
   - Internal: sets `assetTokens[assetId]` used by `openPosition`.

6. Optional risk wiring by VaultAccounting owner:
   - `setMaxOpenInterest(basketVault, cap)`
   - `setMaxPositionSize(basketVault, cap)`
   - `setPaused(true/false)`

### 2) Capital lifecycle (hub chain only)

This is the bridge between the basket vault (where investor USDC sits) and the perp module (where you open leveraged positions). Moving capital to perp makes it available for trading but reduces investor redemption headroom. Moving it back does the opposite. **These operations are only available on the hub chain (Sepolia)** where `VaultAccounting` is deployed.

**When to allocate more to perp:** You have a trading thesis, idle capital is earning nothing, and your reserve ratio is comfortably above the minimum. Allocating more gives you a larger trading budget. Consider the routing weights — if the keeper has steered deposits to the hub, you may have fresh USDC to deploy.

**When to withdraw from perp:** You need to restore redemption liquidity, you've closed positions and want the realised profits back in the vault, or you're de-risking ahead of expected volatility. On spoke chains, pending redemptions may be waiting for hub USDC to be bridged via `RedemptionReceiver`.

1. `Basket owner -> BasketVault.allocateToPerp(amount)`
   - Internal: checks `vaultAccounting` is set.
   - Internal: checks reserve-aware headroom via `getAvailableForPerpUsdc()`.
   - Internal: enforces optional `maxPerpAllocation`.
   - Internal: approves VA and calls `VaultAccounting.depositCapital(basketVault, amount)`.
   - Internal (VA): transfers USDC from basket into VA, increments `depositedCapital`.
   - Internal (Basket): increments `perpAllocated`.

2. `Basket owner -> BasketVault.withdrawFromPerp(amount)`
   - Internal: calls `VaultAccounting.withdrawCapital(basketVault, amount)`.
   - Internal (VA): checks available capital and transfers USDC back to basket.
   - Internal (Basket): decrements `perpAllocated` up to zero (profit withdrawals can exceed principal allocation).

### 3) Position lifecycle and PnL realization (hub chain only)

This is where you actually trade. You open leveraged positions on assets tracked by the oracle, and close them to realise gains or cut losses. Positions are held in the VaultAccounting contract's GMX account — not your personal wallet — so PnL is automatically attributed to the basket vault's NAV. **All position operations happen on Sepolia only — you never need to switch to a spoke chain for perp trading.** The keeper service automatically propagates PnL to spoke chains via `StateRelay.globalPnLAdjustment` so share prices stay consistent across all chains without any curator intervention.

**When to open a position:** You have a directional thesis on an asset, available capital to post as collateral, and the position fits within your risk limits (leverage, open interest caps, portfolio concentration).

**When to close a position:** The position has hit your profit target, your stop-loss threshold, or your thesis has been invalidated. Also close when you need to free up collateral for other trades or to pull capital back to the vault.

1. `Authorized caller -> VaultAccounting.openPosition(vault, asset, isLong, size, collateral)`
   - Internal: `_checkCaller(vault)`, `onlyRegisteredVault`, `whenNotPaused`.
   - Internal: resolves `indexToken = assetTokens[asset]` and validates mapping.
   - Internal: checks collateral against `_availableCapital(vault)`.
   - Internal: enforces `maxOpenInterest` / `maxPositionSize` if configured.
   - Internal: opens/increases the GMX leg in `VaultAccounting`'s GMX account (`address(this)`), not in the basket owner's EOA.
   - Internal: transfers collateral to GMX vault and calls `gmxVault.increasePosition(...)`.
   - Internal: reads GMX position and updates local tracking/open keys.

2. `Authorized caller -> VaultAccounting.closePosition(vault, asset, isLong, sizeDelta, collateralDelta)`
   - Internal: `_checkCaller(vault)` and tracked-position checks.
   - Internal: calls `gmxVault.decreasePosition(..., receiver=address(this))`.
   - Internal: computes USDC returned and collateral at risk.
   - Internal: updates open interest / collateral lock / position list.
   - Internal: updates `realisedPnL` on the vault state.

### Interaction value checklist (operator quick reference)

- Before `openPosition`, check:
  - leverage plan (`size / collateral`),
  - available capital after locks,
  - remaining cap headroom (`maxOpenInterest`, `maxPositionSize`).
- After `openPosition`, verify:
  - position tracking for `(vault, asset, side)`,
  - expected `openInterest` and `collateralLocked` deltas.
- After `closePosition`, verify:
  - expected `openInterest` decrease,
  - `realisedPnL` direction/magnitude sanity,
  - resulting available capital for withdrawal or redeploy.

### Liquidation semantics (operator note)

Liquidation is the worst-case scenario for a curator. If a leveraged position moves far enough against you, the GMX layer will automatically close it and you lose most or all of the posted collateral. This loss reduces the vault's NAV and therefore the share price for all investors.

- Liquidation checks come from GMX `validateLiquidation` logic and include:
  - loss versus collateral,
  - fee burden (margin fees + liquidation fee),
  - leverage constraints.
- As a result, simple thresholds (for example, "about 20% adverse at 5x") are only approximations and can trigger earlier in live conditions.
- Practical implication: losses from liquidated legs are borne by vault perp capital tracked in `VaultAccounting`, then flow into basket NAV/share price through realised and unrealised PnL accounting.

---

## Cross-chain routing and deposit steering

In the hub-and-spoke model, the keeper service computes **routing weights** (inverse-proportional to each chain's idle USDC) and posts them to `StateRelay` on every chain each epoch. This creates an automatic capital steering mechanism:

- When Sepolia (hub) needs more perp capital, the keeper assigns it a higher weight, directing new deposits there.
- When a spoke chain has excess idle USDC relative to others, its weight drops, discouraging further deposits until the balance equalizes.
- Each `BasketVault` can set `minDepositWeightBps` to enforce a minimum routing weight for accepting deposits. If a chain's weight drops below this threshold, deposits revert.

As a curator, you should monitor routing weights to understand where capital is flowing. If your hub vault needs more USDC for perp allocation, the keeper will naturally steer deposits toward it. You do not need to manually bridge USDC between chains.

---

## Decision framework for curators

### Reserve management

Your reserve ratio is the percentage of vault USDC that stays idle (not allocated to perp). This is your redemption buffer — the cushion that lets investors exit without waiting for you to close positions.

- **`minReserveBps`** is the floor. If you set it to `2000` (20%), the contract will block `allocateToPerp` calls that would push your reserve below 20%.
- **Rule of thumb:** In calm markets, 20-30% reserve is typical. In volatile markets or if you expect large redemptions, keep 40-50%.
- **Watch for:** If your perp positions are losing and you're also seeing redemptions, your reserve can get squeezed from both sides.

### Position sizing

- **Conservative:** Keep collateral at 10-20% of position size (5-10x leverage). This gives you more room before liquidation but limits upside.
- **Aggressive:** 5-10% collateral (10-20x leverage). Higher returns if correct, but much tighter liquidation thresholds.
- **Never go all-in:** Spread collateral across multiple positions. A single liquidation should not wipe out your entire perp allocation.

### Fee policy

- `depositFeeBps` and `redeemFeeBps` are your revenue. Higher fees earn more per transaction but discourage deposits and may drive investors to competing vaults.
- Typical range: 25-100 bps (0.25-1%) each direction.
- You can change fees at any time with `setFees`, but sudden increases may cause a rush of redemptions at the old rate.

### When to collect fees

Accumulated fees sit in `collectedFees` within the vault. They are excluded from NAV calculations, so they don't inflate the share price. Call `collectFees(to)` to sweep them to your address whenever you like — there is no minimum or cooldown.

---

## Investor liquidity constraints

This section explains how curator decisions affect investors. Understanding this is critical because a curator who locks up too much capital will frustrate investors who can't redeem.

- Investor redemptions draw from **idle USDC held in BasketVault**, minus reserved fees (`collectedFees`).
- Capital allocated via `allocateToPerp` is **not directly withdrawable by investors**.
- Only the basket owner can move funds back from the perp module (`withdrawFromPerp`) to increase redeemable on-hand liquidity.
- Deposit/redeem pricing is NAV-based (includes realised + unrealised perp PnL from `VaultAccounting.getVaultPnL`).

---

## Other basket manager functions

### BasketVault controls

These are your day-to-day configuration knobs. Most are set-and-forget after initial setup, except `collectFees` which you call periodically.

- `setAssets(assetIds)` — Register basket assets; ids must be active in oracle.
- `setFees(depositFeeBps, redeemFeeBps)` — Set mint/redeem fees (max 500 bps each).
- `setOracleAdapter(oracleAdapter)` — Repoint basket pricing source.
- `setVaultAccounting(vaultAccounting)` — Wire perp bridge target.
- `setMaxPerpAllocation(cap)` — Cap total `perpAllocated` (0 = no cap).
- `setMinReserveBps(bps)` — Reserve target that gates `allocateToPerp`.
- `collectFees(to)` — Withdraw accumulated fees in `collectedFees`.

### Reserve operation

- `topUpReserve(amount)` (permissionless) — Anyone may transfer USDC to basket without minting shares (non-dilutive reserve top-up). Useful for emergency liquidity injections.

### BasketFactory controls

These are factory-level defaults that apply to newly created baskets. Only relevant if you are the factory owner, not a basket curator.

- `setVaultAccounting(vaultAccounting)` — Default VA for newly created baskets.
- `setOracleAdapter(oracleAdapter)` — Default oracle adapter for newly created baskets.
- `createBasket(name, depositFeeBps, redeemFeeBps)` — Deploy/configure basket, optional VA wiring, transfer ownership to creator.

---

## Global pool operator controls (GMX vault)

These controls are distinct from basket-level operations and affect the shared GMX liquidity pool that all baskets trade against.

- Admin UI route **`/admin/pool`** includes per-whitelisted-token controls for:
  - `setBufferAmount(token, amount)` (gov-only)
  - direct pool funding flow: token `transfer(gmxVault, amount)` followed by `directPoolDeposit(token)`
- These controls affect GMX pool-level liquidity configuration and are distinct from basket-level `allocateToPerp` / `withdrawFromPerp`.

---

## Operational caveats (current implementation)

- `VaultAccounting.withdrawCapital` checks available capital with:
  `available = depositedCapital + realisedPnL - collateralLocked` (floored at zero).
- Withdrawals debit principal first (`depositedCapital`), then debit realised gains (`realisedPnL`) when withdrawal exceeds principal.
- `deregisterVault` requires zero open interest.

---

## Deep operator references

- [PERP_RISK_MATH.md](./PERP_RISK_MATH.md) — formulas, units, and liquidation caveats used in position sizing.
- [OPERATOR_INTERACTIONS.md](./OPERATOR_INTERACTIONS.md) — per-contract interaction matrix for operator write flows.
