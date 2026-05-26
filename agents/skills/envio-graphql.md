# Envio GraphQL Skill

Read-only query patterns against the live IndexFlow Envio HyperIndex endpoint. Shared by `broadcast-bot` and `basket-ideator`.

## Endpoint

Canonical URL lives in [`AGENT_DEPLOYMENT_MEMORY.md`](../../AGENT_DEPLOYMENT_MEMORY.md) — `HyperIndex deployment` row, `Current URL` field. As of 2026-05-26: `https://indexer.dev.hyperindex.xyz/115a80f/v1/graphql`. **Do NOT hard-code the URL** in agent prompts; read it from the deployment memory file (the `envio-graphql-mcp` server already does this for you).

The indexer serves both Sepolia and Fuji from one Hasura GraphQL endpoint. Filter by `chainId` (`11155111` for Sepolia hub, `43113` for Fuji spoke) when a query is chain-specific.

## Auth

None. The dev-tier indexer is public; no header required. Do NOT attempt to authenticate — there is no auth surface and any `Authorization` header will be rejected by Hasura.

## Hard constraints

- **Read-only**. The `envio-graphql-mcp` server refuses any `mutation` or `subscription` at the tool boundary; the underlying Hasura role is also read-only. If you see a `mutation` keyword in any output, treat it as a bug and refuse to execute.
- **No PII**. Don't query `BasketActivity.user` or `UserBasketPosition.user_id` joined to off-chain identity sources. Stick to vault-level aggregates and event metadata.
- **Cache 60s minimum**. The dev-tier indexer rate-limits at low single-digit RPS for unauthenticated clients. The MCP enforces a 60s cache per `(query + variables)` signature; don't try to bust it.
- **Errors**: on a 5xx response, the MCP fails closed (no retry loop). Surface a ticket and stop — don't try to power through.

## Schema essentials (verified live 2026-05-26)

The schema is denormalised per-event into a small set of root entities. Field names below are the canonical ones — `BasketFactory_BasketCreated` from older docs is **gone**; use `Basket` instead.

| Entity | When to use | Key fields |
| --- | --- | --- |
| `Basket` | "What baskets exist?" — one row per BasketCreated, deduped. | `id` (`chainId-vault`), `name`, `creator` (NOT `curator`), `chainId`, `createdAt` (Unix-seconds string), `assetCount`, `vault`, `shareToken`, `basketPrice`, `tvlBookUsdc`, `usdcBalanceUsdc`, `totalDepositCount`, `totalRedeemCount`. |
| `BasketActivity` | "What happened against a basket?" — per-event log (deposits, redeems, fee accrual, perp moves). | `id`, `activityType`, `amountUsdc`, `basket_id`, `chainId`, `blockNumber`, `timestamp`, `txHash`, `user_id`, `recipient`, `pnl`, `shares`. |
| `BasketAsset` / `BasketExposure` / `BasketSnapshot` | Sub-entities per Basket — composition + intra-block exposure snapshots. | Use only when a query specifically needs constituent assets or time-series exposure. |
| `UserBasketPosition` | Per-user holding ledger. | Joined to `User` and `Basket`. **Avoid for public posting — see PII constraint above.** |

`Basket.createdAt` is a stringified Unix-seconds value (Hasura numeric type). Compare as numbers in `_gte` filters; cast with `Number(row.createdAt) * 1000` to get JS milliseconds.

## Standard queries

### Recent baskets (broadcast-bot input, ideator dedupe)

Use the `recent_basket_created` MCP tool — it wraps this query and applies the read-only + cache rules:

```graphql
query RecentBaskets($first: Int!, $chainId: Int) {
  Basket(
    where: { chainId: { _eq: $chainId } }
    order_by: { createdAt: desc }
    limit: $first
  ) {
    id
    name
    creator
    chainId
    createdAt
    assetCount
    vault
  }
}
```

Drop the `where` clause when you want both chains. The MCP wrapper handles both shapes — pass `chainId` or leave it unset.

### Cumulative basket inventory (basket-ideator dedupe)

```graphql
query AllBaskets {
  Basket(order_by: { createdAt: asc }) {
    id
    name
    chainId
    createdAt
    vault
  }
}
```

For theme overlap checks, prefer the `count_baskets_by_theme` MCP tool — it runs this query, applies a token-overlap filter against a candidate slug, and returns the match list with shared-token counts.

### Per-vault activity (future: leaderboard-worker)

```graphql
query VaultActivity($vault: String!) {
  BasketActivity(
    where: { basket_id: { _eq: $vault }, activityType: { _in: ["Deposit", "Redeem"] } }
    order_by: { timestamp: desc }
    limit: 100
  ) {
    activityType
    amountUsdc
    shares
    timestamp
    txHash
    recipient
  }
}
```

Per `growth/X_GROWTH_PLAN.md` UTM contract, the leaderboard worker matches `recipient` against `utm_source=x&utm_campaign=season-1`-tagged session events from the push-worker analytics pipe.

## Schema discovery

If a query fails with `field not found in type`, call the `discover_schema` MCP tool — it runs Hasura introspection ONCE per MCP server lifetime and caches the result. Don't author a raw introspection query unless you specifically need a sub-field shape the cached summary doesn't include.

## Failure modes you must handle

- **Indexer behind on a fresh deploy** — `Basket` rows show up minutes after the on-chain event. If the most recent `createdAt` is older than the current block timestamp by more than ~5 minutes, surface a ticket and stop; do not draft tweets against stale data.
- **Indexer URL rotation** — when `AGENT_DEPLOYMENT_MEMORY.md` is updated with a new URL, the next MCP server start picks it up automatically. There's no in-process rotation; if a `cached: true` response references an old endpoint, kill and restart the MCP.
- **Hasura 502/504** — the MCP fails closed (no retry loop). Surface a ticket; do not retry-loop in the agent.
