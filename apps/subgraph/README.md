# SNX Prototype Subgraph

## Networks

Configuration lives in `networks.json`.

- `anvil`
- `arbitrum-sepolia`

`generate-manifest` fails if any required address for the selected network is zero.

## Commands

```bash
cd apps/subgraph
npm install

# Build manifest + generated types + wasm
NETWORK=anvil npm run codegen
NETWORK=anvil npm run build

# Deploy (Hosted Service)
export SUBGRAPH_SLUG=<account>/<name>
NETWORK=anvil npm run deploy
```

Set `NETWORK=arbitrum-sepolia` when Arbitrum Sepolia addresses/start blocks are filled.
