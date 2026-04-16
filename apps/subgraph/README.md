# SNX Prototype Subgraph

## Networks

Configuration lives in `networks.json` and is auto-synced from web deployment files before manifest generation:

- `apps/web/src/config/local-deployment.json` -> `anvil`
- `apps/web/src/config/sepolia-deployment.json` -> `sepolia`
- `apps/web/src/config/fuji-deployment.json` -> `fuji`

`generate-manifest` fails if any **required** contract address for the selected network is zero. Coordination layer contracts (`poolReserveRegistry`, `intentRouter`) are optional — a warning is printed if they have zero addresses, but the build still succeeds.

## Data Sources

| Data Source | Contract | Events Indexed |
|---|---|---|
| BasketFactory | BasketFactory | BasketCreated |
| VaultAccounting | VaultAccounting | Deposited, Redeemed, TopUp, etc. |
| OracleAdapter | OracleAdapter | AssetConfigured, PriceUpdated, AssetRemoved |
| PoolReserveRegistry | PoolReserveRegistry | PoolSnapshot, RemoteStateUpdated |
| IntentRouter | IntentRouter | IntentSubmitted, IntentExecuted, IntentRefunded |
| BasketVaultTemplate | BasketVault (dynamic) | Transfer, Deposit, Redeem |

## Commands

```bash
cd apps/subgraph
npm install

# Sync network addresses from deployment outputs
npm run sync:networks

# Build manifest + generated types + wasm
NETWORK=anvil npm run codegen
NETWORK=anvil npm run build

# Deploy to Subgraph Studio
npx graph auth <DEPLOY_KEY>
export SUBGRAPH_SLUG=indexflow-prototype
NETWORK=sepolia npm run deploy
```

Set `NETWORK=sepolia` for Ethereum Sepolia indexing using `apps/web/src/config/sepolia-deployment.json`.
Set `NETWORK=fuji` for Avalanche Fuji indexing using `apps/web/src/config/fuji-deployment.json`.
