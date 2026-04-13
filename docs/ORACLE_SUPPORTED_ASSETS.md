# Oracle Supported Assets (Testnet)

This page lists the currently supported oracle assets and where each asset's price feed comes from on **Ethereum Sepolia**.

## Oracle architecture (Sepolia)

- `Chainlink` assets (when configured): `OracleAdapter.getPrice(assetId)` reads the Chainlink feed directly, and `PriceSync.syncAll()` writes that normalized value into GMX `SimplePriceFeed`.
- `Yahoo Finance relayed` assets: `scripts/update-yahoo-finance-prices.js` enumerates active `CustomRelayer` assets on-chain (via `assetList`, `getAssetConfig`, `assetSymbols`), fetches Yahoo Finance quotes, converts non-USD currencies, and submits prices to `OracleAdapter.submitPrices` then calls `PriceSync.syncAll()`. No local config file is needed.

## On-chain symbol storage

`OracleAdapter.configureAsset(string symbol, ...)` stores the human-readable symbol on-chain in the `assetSymbols` mapping. The asset id is derived as `keccak256(bytes(symbol))`. This means:

- The relayer reads symbols directly from the contract.
- The subgraph indexes the `symbol` field from the `AssetConfigured` event.
- The web app reads `assetSymbols(id)` to display labels.
- No local config or localStorage mapping is required.

Duplicate tickers across exchanges are disambiguated by Yahoo Finance's suffix convention (e.g. `BHP.AX` for ASX, `BHP.L` for LSE). Ambiguous unsuffixed equities are rejected on write paths.

## Network coverage

- This document covers **Ethereum Sepolia (`11155111`)** only.
- Mainnet feed details are intentionally not included yet.

## Default greenfield deploy (`DeploySepolia`)

`script/DeploySepolia.s.sol` seeds **one** oracle asset:

| Asset | OracleAdapter feed type | Provider | Network | Notes |
| --- | --- | --- | --- | --- |
| `BHP.AX` | `FeedType.CustomRelayer` | Yahoo Finance | Sepolia | Symbol stored on-chain; mock BHP.AX index token mapped in GMX stack |

Initial `submitPrices` uses a **live Yahoo quote** at deploy time: `vm.ffi` runs `scripts/fetch-yf-asset-price.js`, which writes `cache/yf-seed-price.txt`; Solidity reads it via `vm.readFile` (avoids passing the decimal string through FFI stdout). Same for `DeployLocal` on Anvil. Set env **`SEED_PRICE_RAW`** (8-decimal USD raw integer) to skip the network call.

## Adding more assets

- **Custom relayer (Yahoo Finance):** register via **Admin → Assets** (or `configureAsset` + `mapAssetToken` / `PriceSync.addMapping` as appropriate). The relayer picks up every active `CustomRelayer` asset automatically.
- **Symbol policy:** for equities, use exchange-suffixed symbols when multiple listings exist (`BHP.AX`, `BHP.L`, etc.). Ambiguous unsuffixed equities are rejected on write flows, while unique unsuffixed equities (for example `AAPL`) remain allowed.
- **Chainlink example (XAU/USD on Sepolia):** if you add `XAU` with feed `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea`, `getPrice` reads the feed and `PriceSync.syncAll()` can push it into `SimplePriceFeed` like any other configured asset.

Additional tickers from any Yahoo Finance-supported exchange (ASX, LSE, TSX, etc.) use the same relayer path once registered.

## Operator note

To update all registered CustomRelayer asset prices:

```bash
# Dry-run (no broadcast)
npm run update-prices:sepolia:dry

# Broadcast (requires PRIVATE_KEY)
PRIVATE_KEY=0x... npm run update-prices:sepolia
```

For local Anvil:

```bash
npm run update-prices:local:dry
PRIVATE_KEY=0x... npm run update-prices:local
```
