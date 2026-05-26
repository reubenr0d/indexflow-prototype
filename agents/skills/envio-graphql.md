# Envio GraphQL Skill

Read-only query patterns against the live IndexFlow Envio HyperIndex endpoint. Shared by `broadcast-bot` and `basket-ideator`.

## Endpoint

Canonical URL lives in [`AGENT_DEPLOYMENT_MEMORY.md`](../../AGENT_DEPLOYMENT_MEMORY.md) — `Envio HyperIndex deployment` row, `Current URL` field. As of 2026-05-26: `https://indexer.dev.hyperindex.xyz/dbe3f66/v1/graphql`. Do NOT hard-code the URL in agent prompts; read it from the deployment memory file so URL rotations land automatically.

The indexer serves both Sepolia and Fuji from one Hasura GraphQL endpoint. Filter by `chainId` (`11155111` for Sepolia hub, `43113` for Fuji spoke) when a query is chain-specific.

## Auth

None. The dev-tier indexer is public; no header required. Do NOT attempt to authenticate — there is no auth surface and any `Authorization` header will be rejected by Hasura.

## Hard constraints

- **Read-only**. The `envio-graphql-mcp` server exposes only GraphQL queries, never mutations. If you see a `mutation` keyword in any output, treat it as a bug and refuse to execute.
- **No PII**. Don't query for fields that might leak depositor addresses with off-chain identity links. Stick to vault-level aggregates and event metadata.
- **Cache 60s minimum**. The indexer rate-limits at a low single-digit RPS for unauthenticated clients. The MCP server enforces a 60s cache per query signature; don't try to bust it.
- **Errors**: on a 5xx response, retry **once** with a 5s delay. After that, surface a `propose_ticket` and stop — don't loop.

## Standard queries

### Recent `BasketCreated` events (broadcast-bot input)

```graphql
query RecentBaskets($chainId: Int!, $first: Int = 20) {
  BasketFactory_BasketCreated(
    where: { chainId: { _eq: $chainId } }
    order_by: { db_write_timestamp: desc }
    limit: $first
  ) {
    vaultAddress: vault
    vaultName: name
    curator
    assetCount
    blockTimestamp
    txHash
  }
}
```

### Cumulative basket inventory (basket-ideator dedupe)

```graphql
query AllBaskets {
  BasketFactory_BasketCreated(order_by: { blockTimestamp: asc }) {
    vaultAddress: vault
    vaultName: name
    chainId
    blockTimestamp
  }
}
```

Filter the result client-side by name overlap (≥ 2 shared tokens → likely duplicate). Cache the full list per tick.

### Per-vault deposit + redemption events (future: leaderboard-worker)

```graphql
query VaultEvents($vault: String!) {
  BasketVault_DepositCompleted(where: { vault: { _eq: $vault } }, limit: 100) {
    user
    sharesMinted
    usdcDeposited
    blockTimestamp
    txHash
  }
  BasketVault_RedeemCompleted(where: { vault: { _eq: $vault } }, limit: 100) {
    user
    sharesBurned
    usdcRedeemed
    blockTimestamp
    txHash
  }
}
```

Per `growth/X_GROWTH_PLAN.md` UTM contract, the leaderboard worker matches `user` against `utm_source=x&utm_campaign=season-1`-tagged session events from the push-worker analytics pipe.

## Schema discovery

If a query fails with `field not found`, run the Hasura introspection query (`__schema { types { name } }`) ONCE per agent run, cache the result in `agents/memory/<agent>/schema-cache.json`, and re-derive the query. Do NOT spam introspection across turns.

## Failure modes you must handle

- **Indexer behind on a fresh deploy** — `BasketCreated` shows up minutes later. If `last_seen_event_block < current_block - 100`, surface a ticket and stop; do not draft tweets against stale data.
- **Indexer URL rotation** — when `AGENT_DEPLOYMENT_MEMORY.md` is updated with a new URL (signal: `propose_ticket` from the founder + a re-read of the memory file shows a different URL), invalidate every cache key and re-bootstrap.
- **Hasura 504 / 502** — single retry then `propose_ticket`; do not retry-loop.
