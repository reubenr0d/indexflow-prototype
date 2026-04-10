# Oracle Supported Assets (Testnet)

This page lists the currently supported oracle assets and where each asset's price feed comes from on **Ethereum Sepolia**.

## Oracle architecture (Sepolia)

- `Chainlink` assets: `OracleAdapter.getPrice(assetId)` reads the Chainlink feed directly, and `PriceSync.syncAll()` writes that normalized value into GMX `SimplePriceFeed`.
- `Pyth relayed` assets: `scripts/update-pyth-relayer-prices.js` fetches Pyth Hermes prices, submits them to `OracleAdapter.submitPrices(bytes32[],uint256[])`, then calls `PriceSync.syncAll()`.

## Network coverage

- This document covers **Ethereum Sepolia (`11155111`)** only.
- Mainnet feed details are intentionally not included yet.

## Supported assets and feed sources

| Asset | OracleAdapter feed type | Provider | Network | Onchain/source identifier | Path to GMX feed |
| --- | --- | --- | --- | --- | --- |
| `XAU` | `FeedType.Chainlink` | Chainlink | Sepolia | `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea` | `OracleAdapter.getPrice` -> `PriceSync.syncAll` |
| `XAG` | `FeedType.CustomRelayer` | Pyth | Sepolia | `f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e` | `submitPrices` -> `PriceSync.syncAll` |
| `BHP` | `FeedType.CustomRelayer` | Pyth | Sepolia | `191d7aac7f589ecdf86e05e349c58873eebe0c6b0101615af3a22b366a51d87d` | `submitPrices` -> `PriceSync.syncAll` |
| `RIO` | `FeedType.CustomRelayer` | Pyth | Sepolia | `55e9d82de00129d0fb368bc89d1ee59146b80a8772f8a972febac3f65ed3151f` | `submitPrices` -> `PriceSync.syncAll` |
| `VALE` | `FeedType.CustomRelayer` | Pyth | Sepolia | `89dd5fb5c30324f3cb11920e3e5ca7de7732abf3889f93bf3757f9509715a89f` | `submitPrices` -> `PriceSync.syncAll` |
| `NEM` | `FeedType.CustomRelayer` | Pyth | Sepolia | `29caf4d900d3080e56306ac41a9856735b89cb4df6813dd7b83e9eb96c04700d` | `submitPrices` -> `PriceSync.syncAll` |
| `FCX` | `FeedType.CustomRelayer` | Pyth | Sepolia | `2b5735ead9b057b3fb96a422740ab26bdfcb1f2b5d4cd9d052f45311ef0f2952` | `submitPrices` -> `PriceSync.syncAll` |
| `SCCO` | `FeedType.CustomRelayer` | Pyth | Sepolia | `a00be224b07426d688475926b6a7a8b007f1420734629b596ae6132c75bc5976` | `submitPrices` -> `PriceSync.syncAll` |

## Operator note

To keep relayed assets fresh, run:

```bash
PRIVATE_KEY=0x... npm run update-pyth:sepolia
```

Dry-run (no broadcast):

```bash
npm run update-pyth:sepolia:dry
```
