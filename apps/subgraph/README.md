# SNX Prototype Subgraph

## Networks

Configuration lives in `networks.json` and is auto-synced from web deployment files before manifest generation:

- `apps/web/src/config/local-deployment.json` -> `anvil`
- `apps/web/src/config/sepolia-deployment.json` -> `arbitrum-sepolia`

- `anvil`
- `arbitrum-sepolia`

`generate-manifest` fails if any required address for the selected network is zero.

## Commands

```bash
cd apps/subgraph
npm install

# Sync network addresses from deployment outputs
npm run sync:networks

# Build manifest + generated types + wasm
NETWORK=anvil npm run codegen
NETWORK=anvil npm run build

# Deploy (Hosted Service)
export SUBGRAPH_SLUG=<account>/<name>
NETWORK=anvil npm run deploy
```

Set `NETWORK=arbitrum-sepolia` when Arbitrum Sepolia addresses/start blocks are filled.
