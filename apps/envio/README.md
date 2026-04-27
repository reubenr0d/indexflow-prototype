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

Copy `.env.example` to `.env` and set:

- `ENVIO_API_TOKEN`
- `SEPOLIA_RPC_URL`
- `FUJI_RPC_URL`
- `ARBITRUM_SEPOLIA_RPC_URL`

## Notes

- Dynamic vault indexing is registered from `BasketFactory.BasketCreated` via `context.BasketVault.add(...)`.
- Entity IDs are chain-scoped (`<chainId>-...`) to avoid cross-chain collisions.
- Existing `apps/subgraph` is kept for fallback/reference during migration cutover.
