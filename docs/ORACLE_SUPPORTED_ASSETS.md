# Oracle Supported Assets (Testnet)

This page lists the currently supported oracle assets and where each asset's price feed comes from on **Ethereum Sepolia**.

## Oracle architecture (Sepolia)

- `Chainlink` assets: `OracleAdapter.getPrice(assetId)` reads the Chainlink feed directly, and `PriceSync.syncAll()` writes that normalized value into GMX `SimplePriceFeed`.
- `Yahoo Finance relayed` assets: `scripts/update-yahoo-finance-prices.js` enumerates active `CustomRelayer` assets on-chain (via `assetList`, `getAssetConfig`, `assetSymbols`), fetches Yahoo Finance quotes, converts non-USD currencies, and submits prices to `OracleAdapter.submitPrices` then calls `PriceSync.syncAll()`. No local config file is needed.

## On-chain symbol storage

`OracleAdapter.configureAsset(string symbol, ...)` stores the human-readable symbol on-chain in the `assetSymbols` mapping. The asset id is derived as `keccak256(bytes(symbol))`. This means:

- The relayer reads symbols directly from the contract.
- The subgraph indexes the `symbol` field from the `AssetConfigured` event.
- The web app reads `assetSymbols(id)` to display labels.
- No local config or localStorage mapping is required.

Duplicate tickers across exchanges are disambiguated by Yahoo Finance's suffix convention (e.g. `BHP` for US/ADR, `BHP.AX` for ASX, `BHP.L` for LSE), each producing a distinct `keccak256` hash.

## Network coverage

- This document covers **Ethereum Sepolia (`11155111`)** only.
- Mainnet feed details are intentionally not included yet.

## Supported assets and feed sources

| Asset | OracleAdapter feed type | Provider | Network | Notes |
| --- | --- | --- | --- | --- |
| `XAU` | `FeedType.Chainlink` | Chainlink | Sepolia | Feed: `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea` |
| `XAG` | `FeedType.CustomRelayer` | Yahoo Finance | Sepolia | Symbol stored on-chain |
| `BHP` | `FeedType.CustomRelayer` | Yahoo Finance | Sepolia | Symbol stored on-chain |
| `RIO` | `FeedType.CustomRelayer` | Yahoo Finance | Sepolia | Symbol stored on-chain |
| `VALE` | `FeedType.CustomRelayer` | Yahoo Finance | Sepolia | Symbol stored on-chain |
| `NEM` | `FeedType.CustomRelayer` | Yahoo Finance | Sepolia | Symbol stored on-chain |
| `FCX` | `FeedType.CustomRelayer` | Yahoo Finance | Sepolia | Symbol stored on-chain |
| `SCCO` | `FeedType.CustomRelayer` | Yahoo Finance | Sepolia | Symbol stored on-chain |

Additional assets from any Yahoo Finance-supported exchange (ASX, LSE, TSX, etc.) can be registered via the admin oracle UI. They are automatically picked up by the relayer.

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
