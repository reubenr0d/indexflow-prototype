# Operator interaction matrix

Function-level reference for every operator-callable action in the basket and perp system. Each entry includes a plain-language description, the contract call card, and guidance on when to use it.

For the narrative version of the curator flow, see [ASSET_MANAGER_FLOW.md](./ASSET_MANAGER_FLOW.md).

---

## BasketVault interactions (basket owner / curator)

These are the functions available to whoever owns a specific basket vault. As the curator, you use these to manage your vault's composition, fee structure, capital allocation, and reserve policy.

### `allocateToPerp`

Moves idle USDC from your basket vault into the perpetual trading module. Once allocated, this capital becomes available for opening leveraged positions but is no longer available for investor redemptions.

**When to use:** You have a trading thesis and want to deploy capital. Your reserve ratio is comfortably above the minimum, and there is idle USDC earning nothing in the vault.

```contract-call
function: BasketVault.allocateToPerp(amount)
caller: Basket owner
inputs:
  - amount: USDC atoms (1e6 per dollar)
effects:
  - Transfers USDC from vault to VaultAccounting via depositCapital
  - Increases perpAllocated on the vault
  - Reduces idle USDC available for investor redemptions
reverts:
  - vaultAccounting not configured
  - Reserve headroom insufficient (would breach minReserveBps)
  - maxPerpAllocation cap exceeded
  - Paused state on VaultAccounting
```

### `withdrawFromPerp`

Pulls USDC back from the perpetual trading module into the basket vault. This restores redemption liquidity for investors and reduces your perp trading budget.

**When to use:** You need to restore redemption headroom, you've closed profitable positions and want the gains accessible to investors, or you're de-risking ahead of expected volatility.

```contract-call
function: BasketVault.withdrawFromPerp(amount)
caller: Basket owner
inputs:
  - amount: USDC atoms (1e6 per dollar)
effects:
  - Transfers USDC from VaultAccounting back to vault
  - Decreases perpAllocated (clamped at zero if withdrawal exceeds principal)
  - Increases idle USDC available for investor redemptions
reverts:
  - vaultAccounting not configured
  - Insufficient available capital (collateral locked in open positions)
```

### `setAssets`

Defines which assets this basket tracks. Asset IDs are `keccak256(symbol)` hashes that must already be registered and active in the OracleAdapter.

**When to use:** Initial vault setup, or when adding/removing assets from your basket's tracked universe. This does not open or close positions — it only declares which assets the vault is interested in.

```contract-call
function: BasketVault.setAssets(assetIds)
caller: Basket owner
inputs:
  - assetIds: bytes32[] array of keccak256 asset hashes
effects:
  - Replaces the vault's asset list entirely
  - Each asset is validated as active in OracleAdapter
reverts:
  - Any assetId is not active in OracleAdapter
  - Caller is not the vault owner
```

### `setFees`

Sets the deposit and redemption fee percentages. Fees are charged on every mint/burn and accumulate in the vault's `collectedFees` balance, which the owner can sweep with `collectFees`.

**When to use:** Initial vault setup, or when adjusting your fee strategy. Be cautious about raising fees suddenly — it may trigger a rush of redemptions at the old rate.

```contract-call
function: BasketVault.setFees(depositFeeBps, redeemFeeBps)
caller: Basket owner
inputs:
  - depositFeeBps: deposit fee in basis points (100 = 1%)
  - redeemFeeBps: redemption fee in basis points (100 = 1%)
effects:
  - Updates fee rates for future deposits and redemptions
reverts:
  - Either fee exceeds 500 bps (5%)
  - Caller is not the vault owner
```

### `setVaultAccounting`

Connects the basket vault to a VaultAccounting instance. This is the bridge that enables perp allocation — without it, `allocateToPerp` and `withdrawFromPerp` will revert.

**When to use:** Initial vault setup. Rarely changed after that unless migrating to a new VaultAccounting deployment.

```contract-call
function: BasketVault.setVaultAccounting(vaultAccounting)
caller: Basket owner
inputs:
  - vaultAccounting: address of the VaultAccounting contract
effects:
  - Sets the perp bridge target address
reverts:
  - Caller is not the vault owner
```

### `setOracleAdapter`

Points the basket vault at an OracleAdapter instance for asset price lookups used in NAV calculations.

**When to use:** Initial vault setup, or when the protocol deploys a new OracleAdapter.

```contract-call
function: BasketVault.setOracleAdapter(oracleAdapter)
caller: Basket owner
inputs:
  - oracleAdapter: address of the OracleAdapter contract
effects:
  - Updates the oracle source used for basket pricing and asset validation
reverts:
  - Caller is not the vault owner
```

### `setMaxPerpAllocation`

Sets an upper bound on how much USDC can be allocated to the perp module. Acts as a self-imposed guardrail to prevent over-allocation.

**When to use:** When you want to enforce a hard cap on perp exposure. Set to `0` to remove the cap entirely.

```contract-call
function: BasketVault.setMaxPerpAllocation(cap)
caller: Basket owner
inputs:
  - cap: maximum perpAllocated in USDC atoms (0 = no cap)
effects:
  - Future allocateToPerp calls are blocked if they would exceed this cap
reverts:
  - Caller is not the vault owner
```

### `setMinReserveBps`

Sets the minimum reserve ratio as a percentage of total vault value. The contract will block `allocateToPerp` if it would push the reserve below this threshold.

**When to use:** To protect investor redemption liquidity. A value of `2000` (20%) means at least 20% of vault USDC must stay idle at all times.

```contract-call
function: BasketVault.setMinReserveBps(bps)
caller: Basket owner
inputs:
  - bps: minimum reserve in basis points (2000 = 20%)
effects:
  - Gates future allocateToPerp calls against this reserve floor
reverts:
  - Caller is not the vault owner
```

### `collectFees`

Sweeps accumulated deposit and redemption fees to the specified address. Fees are excluded from NAV calculations, so collecting them does not affect the share price.

**When to use:** Whenever you want to withdraw your earned fees. There is no minimum amount or cooldown period.

```contract-call
function: BasketVault.collectFees(to)
caller: Basket owner
inputs:
  - to: address to receive the USDC fees
effects:
  - Transfers collectedFees balance to the recipient
  - Resets collectedFees to zero
reverts:
  - Caller is not the vault owner
  - No fees to collect
```

### `topUpReserve`

Allows anyone to deposit USDC into the vault without receiving shares. This increases the vault's idle balance (and NAV) without diluting existing shareholders.

**When to use:** Emergency liquidity injection when the vault needs more redemption headroom, or as a protocol subsidy to improve investor confidence.

```contract-call
function: BasketVault.topUpReserve(amount)
caller: Anyone (permissionless)
inputs:
  - amount: USDC atoms to deposit
effects:
  - Transfers USDC into the vault
  - Increases idle balance and NAV without minting shares
reverts:
  - Transfer failure (insufficient balance or allowance)
```

---

## VaultAccounting interactions (protocol operator)

These functions are controlled by the VaultAccounting contract owner (the protocol operator) and the position caller path. They manage vault registration, risk limits, asset mappings, and the actual position lifecycle.

### `openPosition`

Opens or increases a leveraged perpetual position on a mapped asset. The position is held in VaultAccounting's GMX account, not in the caller's wallet, so PnL is automatically attributed to the basket vault's NAV.

**When to use:** You have a directional thesis on an asset, sufficient available capital for collateral, and the position fits within configured risk limits.

```contract-call
function: VaultAccounting.openPosition(vault, asset, isLong, size, collateral)
caller: Vault address or VaultAccounting owner
inputs:
  - vault: address of the basket vault
  - asset: bytes32 asset ID
  - isLong: true for long, false for short
  - size: notional position size (1e30 per dollar)
  - collateral: USDC atoms for margin
effects:
  - Executes GMX increasePosition from VaultAccounting's account
  - Increases vault openInterest and collateralLocked
  - Creates or updates position tracking key
reverts:
  - Caller is not the vault or VA owner
  - Vault not registered or system paused
  - Asset not mapped to a GMX index token
  - Insufficient available capital for collateral
  - maxOpenInterest or maxPositionSize cap exceeded
```

### `closePosition`

Reduces or fully closes an existing leveraged position. Returns USDC to VaultAccounting and updates realised PnL, which flows into the basket vault's NAV.

**When to use:** Position has hit your profit target or stop-loss, your thesis has been invalidated, or you need to free up collateral for other trades or withdrawal.

```contract-call
function: VaultAccounting.closePosition(vault, asset, isLong, sizeDelta, collateralDelta)
caller: Vault address or VaultAccounting owner
inputs:
  - vault: address of the basket vault
  - asset: bytes32 asset ID
  - isLong: must match the open position's direction
  - sizeDelta: notional amount to reduce (1e30 per dollar)
  - collateralDelta: GMX collateral withdrawal parameter
effects:
  - Executes GMX decreasePosition from VaultAccounting's account
  - Decreases vault openInterest by sizeDelta
  - Updates or removes position tracking
  - Updates realisedPnL based on USDC returned vs collateral at risk
reverts:
  - Caller is not the vault or VA owner
  - No tracked position for (vault, asset, side)
  - Vault not registered or system paused
```

### `registerVault`

Registers a basket vault with VaultAccounting so it can allocate capital and open positions. This initializes all accounting state for the vault.

**When to use:** During initial basket setup, after the vault is deployed and before any perp operations.

```contract-call
function: VaultAccounting.registerVault(vault)
caller: VaultAccounting owner or wirer
inputs:
  - vault: address of the basket vault to register
effects:
  - Initializes vault state (depositedCapital, realisedPnL, openInterest, collateralLocked, positionCount)
  - Marks vault as registered
reverts:
  - Vault already registered
  - Caller is not owner or wirer
```

### `deregisterVault`

Removes a basket vault from VaultAccounting. The vault can no longer allocate capital or open positions after this.

**When to use:** When decommissioning a basket vault. All positions must be closed first.

```contract-call
function: VaultAccounting.deregisterVault(vault)
caller: VaultAccounting owner
inputs:
  - vault: address of the basket vault to deregister
effects:
  - Marks vault as unregistered
  - Vault can no longer interact with VaultAccounting
reverts:
  - Vault has non-zero open interest
  - Vault not registered
  - Caller is not the owner
```

### `mapAssetToken`

Maps an oracle asset ID to the corresponding GMX index token address. This mapping is required before any position can be opened on the asset.

**When to use:** After wiring a new asset through AssetWiring, or during manual setup when the asset's GMX token is deployed.

```contract-call
function: VaultAccounting.mapAssetToken(assetId, token)
caller: VaultAccounting owner or wirer
inputs:
  - assetId: bytes32 keccak256 hash of the asset symbol
  - token: address of the GMX index token (MockIndexToken)
effects:
  - Sets assetTokens[assetId] used by openPosition to resolve the GMX trading pair
reverts:
  - Caller is not owner or wirer
```

### `setWirer`

Grants or revokes the wirer role on VaultAccounting. Wirers can register vaults and map asset tokens without being the contract owner, which is useful for automated setup scripts like AssetWiring.

**When to use:** When granting the AssetWiring contract permission to configure mappings, or when revoking access after setup.

```contract-call
function: VaultAccounting.setWirer(account, active)
caller: VaultAccounting owner
inputs:
  - account: address to grant or revoke
  - active: true to grant, false to revoke
effects:
  - Updates the wirer mapping for the address
reverts:
  - Caller is not the owner
```

### `setMaxOpenInterest`

Sets a cap on total open interest (notional exposure) for a specific vault. Prevents a single vault from accumulating excessive risk.

**When to use:** To enforce position limits on vaults you manage. Set to `0` to remove the cap.

```contract-call
function: VaultAccounting.setMaxOpenInterest(vault, cap)
caller: VaultAccounting owner
inputs:
  - vault: address of the basket vault
  - cap: maximum open interest in notional units (0 = no cap)
effects:
  - Future openPosition calls are blocked if they would exceed this cap
reverts:
  - Caller is not the owner
```

### `setMaxPositionSize`

Sets a cap on the size of any single position for a specific vault.

**When to use:** To prevent oversized individual positions. Works alongside `setMaxOpenInterest` for layered risk controls.

```contract-call
function: VaultAccounting.setMaxPositionSize(vault, cap)
caller: VaultAccounting owner
inputs:
  - vault: address of the basket vault
  - cap: maximum single position size in notional units (0 = no cap)
effects:
  - Future openPosition calls are blocked if the position would exceed this size
reverts:
  - Caller is not the owner
```

### `setPaused`

Emergency pause switch for all VaultAccounting operations. When paused, no vault can deposit capital, withdraw capital, open positions, or close positions.

**When to use:** Emergency response to exploits, oracle failures, or market conditions that require halting all trading.

```contract-call
function: VaultAccounting.setPaused(paused)
caller: VaultAccounting owner
inputs:
  - paused: true to pause, false to unpause
effects:
  - Blocks or unblocks all capital and position operations
reverts:
  - Caller is not the owner
```

---

## OracleAdapter interactions (oracle operator)

These functions manage the oracle layer that provides asset prices to the entire system. Price accuracy is critical — stale or incorrect prices affect NAV calculations, share pricing, and position execution.

### `configureAsset`

Registers a new asset in the oracle or updates an existing asset's feed configuration. Supports both Chainlink feeds and custom relayer (keeper-submitted) prices.

**When to use:** When adding a new tradeable asset to the system, or when migrating an asset to a different price feed.

```contract-call
function: OracleAdapter.configureAsset(symbol, feedAddress, feedType, stalenessThreshold, deviationBps, decimals_)
caller: OracleAdapter owner or wirer
inputs:
  - symbol: human-readable ticker (e.g. "BHP.AX")
  - feedAddress: Chainlink feed address, or address(0) for custom relayer
  - feedType: Chainlink or CustomRelayer enum
  - stalenessThreshold: max seconds before price is considered stale
  - deviationBps: acceptable deviation in basis points
  - decimals_: price decimal precision
effects:
  - Registers or updates asset with keccak256(symbol) as the asset ID
  - Asset becomes active and available for basket setAssets and position opening
reverts:
  - Caller is not owner or wirer
```

### `deactivateAsset`

Marks an asset as inactive. Inactive assets cannot be added to baskets or used for new positions, but existing positions on the asset are not automatically closed.

**When to use:** When retiring an asset from the system, or temporarily disabling a feed with known issues.

```contract-call
function: OracleAdapter.deactivateAsset(assetId)
caller: OracleAdapter owner
inputs:
  - assetId: bytes32 asset hash to deactivate
effects:
  - Marks asset as inactive
  - Prevents new baskets from adding this asset and new positions from using it
reverts:
  - Caller is not the owner
```

### `submitPrice` / `submitPrices`

Submits price updates for custom relayer assets (those not using Chainlink feeds). This is the keeper's primary function — it pushes off-chain prices on-chain.

**When to use:** Called periodically by the price keeper (cron job or manual) to update prices for Yahoo Finance-sourced assets.

```contract-call
function: OracleAdapter.submitPrice(assetId, price)
caller: Keeper
inputs:
  - assetId: bytes32 asset hash
  - price: price value in the asset's configured decimal precision
effects:
  - Updates the stored price and timestamp for the asset
reverts:
  - Caller is not a keeper
  - Asset not configured or not a custom relayer type
```

```contract-call
function: OracleAdapter.submitPrices(assetIds, prices)
caller: Keeper
inputs:
  - assetIds: bytes32[] array of asset hashes
  - prices: uint256[] array of corresponding prices
effects:
  - Batch updates prices for multiple assets in a single transaction
reverts:
  - Caller is not a keeper
  - Array length mismatch
  - Any asset not configured or not a custom relayer type
```

### `setKeeper` / `setWirer`

Grants or revokes keeper and wirer roles on the OracleAdapter.

**When to use:** When onboarding a new keeper address for price submissions, or granting AssetWiring permission to configure assets.

```contract-call
function: OracleAdapter.setKeeper(keeper, active)
caller: OracleAdapter owner
inputs:
  - keeper: address to grant or revoke
  - active: true to grant, false to revoke
effects:
  - Updates the keeper mapping — keepers can submit prices
reverts:
  - Caller is not the owner
```

```contract-call
function: OracleAdapter.setWirer(account, active)
caller: OracleAdapter owner
inputs:
  - account: address to grant or revoke
  - active: true to grant, false to revoke
effects:
  - Updates the wirer mapping — wirers can configure assets
reverts:
  - Caller is not the owner
```

---

## AssetWiring interactions

AssetWiring is a convenience contract that performs the entire asset registration flow in a single transaction. It deploys a mock index token, configures the oracle, seeds prices, sets up GMX token config, maps the asset across VaultAccounting and FundingRateManager, and syncs prices.

### `wireAsset`

The all-in-one asset registration function. This is the preferred way to add new tradeable assets — it handles every step that would otherwise require 5+ separate transactions across different contracts.

**When to use:** When adding a new asset to the system. For equities, the symbol must include the exchange suffix (e.g. `BHP.AX`, not `BHP`) to avoid ambiguity.

```contract-call
function: AssetWiring.wireAsset(symbol, seedPriceRaw8)
caller: Anyone (permissionless)
inputs:
  - symbol: ticker string (e.g. "BHP.AX", "GC=F")
  - seedPriceRaw8: initial price in 8-decimal fixed point (e.g. 9550000000 for $95.50)
effects:
  - Deploys a new MockIndexToken for the asset
  - Configures the asset in OracleAdapter as custom relayer type
  - Seeds initial price via submitPrice
  - Configures the token in GMX vault (token weight, min profit, etc.)
  - Maps assetId to token in VaultAccounting and FundingRateManager
  - Adds PriceSync mapping and triggers syncAll
reverts:
  - Asset symbol already wired
  - Price feed configuration failure
```

---

## PriceSync interactions

PriceSync pushes oracle prices from OracleAdapter into the GMX SimplePriceFeed, keeping the GMX execution layer aligned with the oracle layer. Without syncing, positions would execute at stale GMX prices.

### `syncAll` / `syncPrices`

Pushes current oracle prices to the GMX price feed for all mapped assets (or a specific subset).

**When to use:** Before opening or closing positions to ensure GMX sees current prices. Also called periodically by keepers and automatically by AssetWiring after adding new assets.

```contract-call
function: PriceSync.syncAll()
caller: Anyone (permissionless)
inputs:
effects:
  - Reads current prices from OracleAdapter for all mapped assets
  - Writes them to GMX SimplePriceFeed
reverts:
  - Oracle returns zero or stale price for any mapped asset
```

```contract-call
function: PriceSync.syncPrices(assetIds)
caller: Anyone (permissionless)
inputs:
  - assetIds: bytes32[] array of specific assets to sync
effects:
  - Reads and syncs prices for only the specified assets
reverts:
  - Any assetId not mapped in PriceSync
  - Oracle returns zero or stale price
```

### `addMapping` / `removeMapping`

Manages the mapping between oracle asset IDs and GMX token addresses that PriceSync uses.

**When to use:** Typically handled automatically by AssetWiring. Manual use is needed only when fixing or adjusting mappings.

```contract-call
function: PriceSync.addMapping(assetId, gmxToken)
caller: PriceSync owner or wirer
inputs:
  - assetId: bytes32 asset hash
  - gmxToken: address of the GMX index token
effects:
  - Registers the asset for price syncing
reverts:
  - Caller is not owner or wirer
  - Mapping already exists for this assetId
```

```contract-call
function: PriceSync.removeMapping(assetId)
caller: PriceSync owner
inputs:
  - assetId: bytes32 asset hash to remove
effects:
  - Removes the asset from price syncing
reverts:
  - Caller is not the owner
  - No mapping exists for this assetId
```

---

## FundingRateManager interactions

FundingRateManager controls the funding rates applied to perpetual positions in the GMX layer. Funding rates determine the cost of holding positions over time and incentivize balance between longs and shorts.

### `updateFundingRate`

Pushes new funding rate parameters to the GMX vault. Called periodically by the funding keeper.

**When to use:** Called by the keeper on a schedule (typically every funding interval) to update rates based on current long/short imbalances.

```contract-call
function: FundingRateManager.updateFundingRate(newFundingRateFactor, newStableFundingRateFactor)
caller: Keeper
inputs:
  - newFundingRateFactor: updated funding rate factor
  - newStableFundingRateFactor: updated stable funding rate factor
effects:
  - Sets new funding rates on the GMX vault
reverts:
  - Caller is not a keeper
```

### `configureFunding`

Sets per-asset funding rate parameters including base rate, max rate, and the imbalance threshold that triggers rate adjustments.

**When to use:** When tuning funding rate behavior for a specific asset, typically during initial setup or periodic parameter adjustment.

```contract-call
function: FundingRateManager.configureFunding(assetId, baseFundingRateFactor, maxFundingRateFactor, imbalanceThresholdBps)
caller: FundingRateManager owner
inputs:
  - assetId: bytes32 asset hash
  - baseFundingRateFactor: baseline funding rate
  - maxFundingRateFactor: ceiling for the funding rate
  - imbalanceThresholdBps: long/short imbalance level (in bps) that triggers rate scaling
effects:
  - Updates funding configuration for the asset
reverts:
  - Caller is not the owner
```

### `mapAssetToken`

Maps an oracle asset ID to the GMX token address for funding rate calculations. Similar to VaultAccounting's mapping but specific to the funding rate system.

**When to use:** Typically handled automatically by AssetWiring. Manual use when fixing mappings.

```contract-call
function: FundingRateManager.mapAssetToken(assetId, token)
caller: FundingRateManager owner or wirer
inputs:
  - assetId: bytes32 asset hash
  - token: address of the GMX index token
effects:
  - Sets the asset-to-token mapping for funding rate lookups
reverts:
  - Caller is not owner or wirer
```

---

## BasketFactory interactions (factory owner)

These are factory-level operations that affect the defaults for newly created baskets. Most curators will never call these — they are for the protocol operator who deployed the factory.

### `createBasket`

Deploys a new basket vault with the specified name and fee structure. The factory optionally wires default VaultAccounting and OracleAdapter if they are set.

**When to use:** When a new curator wants to launch a basket vault. The caller becomes the vault owner.

```contract-call
function: BasketFactory.createBasket(name, depositFeeBps, redeemFeeBps)
caller: Anyone (permissionless)
inputs:
  - name: human-readable basket name
  - depositFeeBps: deposit fee in basis points
  - redeemFeeBps: redemption fee in basis points
effects:
  - Deploys a new BasketVault and BasketShareToken
  - Sets fees on the vault
  - Wires default VaultAccounting if configured on factory
  - Transfers vault ownership to the caller
reverts:
  - Fee values exceed 500 bps
```

### `setVaultAccounting` / `setOracleAdapter` (factory)

Sets the default VaultAccounting or OracleAdapter address that new baskets get wired to on creation.

**When to use:** After deploying or upgrading infrastructure contracts. Does not retroactively change existing baskets.

```contract-call
function: BasketFactory.setVaultAccounting(vaultAccounting)
caller: Factory owner
inputs:
  - vaultAccounting: address of the default VaultAccounting
effects:
  - Future createBasket calls will auto-wire this VaultAccounting
reverts:
  - Caller is not the factory owner
```

```contract-call
function: BasketFactory.setOracleAdapter(oracleAdapter)
caller: Factory owner
inputs:
  - oracleAdapter: address of the default OracleAdapter
effects:
  - Future createBasket calls will auto-wire this OracleAdapter
reverts:
  - Caller is not the factory owner
```

---

## GMX-facing effect notes

Operators usually call BasketVault or VaultAccounting, not GMX core directly in this workflow.

- `openPosition` forwards to GMX `increasePosition`.
- `closePosition` forwards to GMX `decreasePosition` and updates realised accounting.
- Liquidation conditions remain determined by GMX validation logic (loss/collateral, fees, leverage constraints).

## Quick remediation map

- **Authorization revert** — Verify wallet role and contract ownership.
- **Mapping/precondition revert** — Verify vault registration, pause state, and asset mapping.
- **Capital/cap revert** — Reduce request size or free capital first.
- **Unexpected PnL output** — Verify price sync freshness, fees/funding context, and execution timing.

## Related docs

- [ASSET_MANAGER_FLOW.md](./ASSET_MANAGER_FLOW.md) — Curator narrative, decision framework, and end-to-end walkthrough.
- [PERP_RISK_MATH.md](./PERP_RISK_MATH.md) — Leverage formulas, sizing heuristics, and liquidation caveats.
- [SHARE_PRICE_AND_OPERATIONS.md](./SHARE_PRICE_AND_OPERATIONS.md) — NAV calculation and share price mechanics.
- [PRICE_FEED_FLOW.md](./PRICE_FEED_FLOW.md) — Oracle, PriceSync, and keeper setup.
