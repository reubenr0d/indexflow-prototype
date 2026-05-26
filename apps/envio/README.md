# SNX Prototype HyperIndex (Envio)

HyperIndex migration target for multichain indexing across Sepolia, Fuji, and Arbitrum Sepolia.

## Commands

```bash
cd apps/envio
npm install
npm run codegen
npm run dev
```

GraphQL playground is available on `http://localhost:8080` when `envio dev` is running.

## Environment

Copy `.env.example` to `.env` and set the RPC URLs used by event-handler
`eth_call` reads:

- `SEPOLIA_RPC_URL` (default `https://ethereum-sepolia-rpc.publicnode.com`)
- `FUJI_RPC_URL` (default `https://avalanche-fuji-c-chain-rpc.publicnode.com`)
- `ARBITRUM_SEPOLIA_RPC_URL` (default `https://arbitrum-sepolia-rpc.publicnode.com`)
- `MANTLE_SEPOLIA_RPC_URL` (default `https://rpc.sepolia.mantle.xyz`)
- `HUB_RPC_URL` / `SPOKE_RPC_URL` (defaults `http://127.0.0.1:8545` / `:8546`)
- `ENVIO_API_TOKEN` — only required if any of the URLs above points at
  `https://*.rpc.hypersync.xyz`; those endpoints reject anonymous calls.

When deploying to Envio Cloud, set the same variables in the deployment's
Environment Variables panel. The handlers call `readBasketChainState`,
`readVaultAccountingState`, `readPositionExposureSize`, and
`readRoutingWeights` on every relevant event, and silently fall back to zero
defaults if no RPC URL works — so an unset/unauthorized RPC manifests as
`Basket.sharePrice / usdcBalanceUsdc / tvlBookUsdc = 0`,
`VaultStateCurrent.registered = false`, empty `BasketExposure`, and empty
`ChainPoolState`. The handler now emits a one-shot `console.warn` on the
first failure for each `(chainId, op)` pair to make this visible in logs.

## Notes

- Dynamic vault indexing is registered from `BasketFactory.BasketCreated` via `context.BasketVault.add(...)`.
- Entity IDs are chain-scoped (`<chainId>-...`) to avoid cross-chain collisions.
  Documented exception: `ChainPoolState.id` is the `chainSelector` alone, because
  every `StateRelay.getRoutingWeights()` returns the same global routing table
  (one entry per chain in the network); keying by `chainSelector` keeps the entity
  canonical/global and prevents one duplicate row per relay observing each selector.
- Envio is the only indexer in the repo. The legacy `apps/subgraph` (The Graph) has been removed.
- After changing RPC URLs you typically need to redeploy the indexer so it
  replays events against the new RPC and back-populates live state.
