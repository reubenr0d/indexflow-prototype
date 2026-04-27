---
name: Envio HyperIndex migration
overview: Migrate from The Graph subgraphs to Envio HyperIndex for native multi-chain indexing with TypeScript handlers and optional hosted deployment.
todos:
  - id: init-envio
    content: Initialize Envio project in apps/envio with TypeScript
    status: completed
  - id: config-networks
    content: Create config.yaml with Sepolia, Fuji, and Arbitrum Sepolia networks
    status: completed
  - id: migrate-schema
    content: Migrate schema.graphql, add chainId to cross-chain entities
    status: completed
  - id: migrate-factory
    content: Migrate BasketFactory handler with contractRegister for dynamic vaults
    status: completed
  - id: migrate-vault
    content: Migrate BasketVault handlers (8 events) including snapshot logic
    status: completed
  - id: migrate-accounting
    content: Migrate VaultAccounting handlers (10 events)
    status: completed
  - id: migrate-oracle
    content: Migrate OracleAdapter handlers (3 events)
    status: completed
  - id: migrate-relay
    content: Migrate StateRelay handler
    status: completed
  - id: contract-calls
    content: Implement viem-based contract call utilities for state refresh
    status: completed
  - id: update-web
    content: Update web app to use single Envio endpoint with chainId queries
    status: completed
  - id: test-local
    content: Test locally with envio dev
    status: pending
  - id: deploy-cloud
    content: Deploy to Envio Cloud or self-host with Docker
    status: pending
isProject: false
---

# Envio HyperIndex Migration Plan

## Why Envio

- **Single config for all chains** - no more N subgraph deployments
- **10-100x faster sync** than The Graph
- **TypeScript handlers** - no AssemblyScript compilation
- **Envio Cloud hosting** - or self-host with Docker
- **No blockchain nodes required** - uses RPC endpoints like your existing setup

---

## Current Architecture Summary

```
apps/subgraph/
├── schema.graphql          # 14 entities
├── subgraph.template.yaml  # 4 data sources + 1 template
├── networks.json           # anvil, sepolia, fuji addresses
└── src/mappings/
    ├── basketFactory.ts    # BasketCreated → Basket + template
    ├── basketVault.ts      # 8 events → deposits, redeems, etc.
    ├── vaultAccounting.ts  # 10 events → positions, capital
    ├── oracleAdapter.ts    # 3 events → asset prices
    ├── stateRelay.ts       # StateUpdated → ChainPoolState
    └── helpers.ts          # Entity CRUD, contract calls
```

**Key patterns to migrate:**

- Dynamic data source via `BasketVaultTemplate.create(vault)`
- Contract calls in handlers (`refreshBasketFromChain`)
- Time-bucketed snapshots (`syncBasketSnapshots`)

---

## Migration Steps

### 1. Initialize Envio Project

Create `apps/envio/` alongside `apps/subgraph/`:

```bash
cd apps
npx envio init --name envio --language typescript
```

### 2. Configure Multi-Chain Contracts

Replace Envio's generated `config.yaml`:

```yaml
name: snx-baskets
networks:
  - id: 11155111  # Sepolia
    rpc_config:
      url: ${SEPOLIA_RPC_URL}
    start_block: 10689376
    contracts:
      - name: BasketFactory
        address: "0x9c80b76abd7d1470ba9e8aaa49d128b0a99dfec4"
        handler: src/handlers/BasketFactory.ts
        events:
          - event: BasketCreated(indexed address creator, indexed address vault, address shareToken, string name)
      - name: VaultAccounting
        address: "0xc7aa05ccaea98dc26b8739a19b79875b1432ce43"
        handler: src/handlers/VaultAccounting.ts
        events:
          - event: CapitalDeposited(indexed address vault, uint256 amount)
          - event: PositionOpened(indexed address vault, indexed bytes32 assetId, bool isLong, uint256 size, uint256 collateral)
          # ... other events
      - name: OracleAdapter
        address: "0x69329fec8c0ef120ee56379941d8d367b593d399"
        handler: src/handlers/OracleAdapter.ts
        events:
          - event: PriceUpdated(indexed bytes32 assetId, uint256 price, uint256 timestamp)
      - name: StateRelay
        address: "0xB837E0d12b16e14C57d829337578ed4111479CD9"
        handler: src/handlers/StateRelay.ts
        events:
          - event: StateUpdated(indexed uint48 chainSelector, uint256 poolAmount, uint256 reserved)

  - id: 43113  # Fuji
    rpc_config:
      url: ${FUJI_RPC_URL}
    start_block: 54370513
    contracts:
      - name: BasketFactory
        address: "0x743194BAAe87A8A518739a1eB71f04773b46d42e"
        handler: src/handlers/BasketFactory.ts
        events:
          - event: BasketCreated(indexed address creator, indexed address vault, address shareToken, string name)
      # ... same events, different addresses

  - id: 421614  # Arbitrum Sepolia (add when deployed)
    # ...
```

### 3. Define Schema

Create `schema.graphql` (Envio uses same GraphQL schema format):

```graphql
# Copy your existing schema.graphql with minor adjustments:
# - Remove @derivedFrom (Envio handles relations differently)
# - Add chainId field to cross-chain entities

type Basket @entity {
  id: ID!
  chainId: Int!  # NEW: track source chain
  creator: String!
  vault: String!
  # ... rest unchanged
}

type BasketActivity @entity {
  id: ID!
  chainId: Int!  # NEW
  # ... rest unchanged
}
```

### 4. Migrate Handlers

**Key differences from AssemblyScript:**

- Full TypeScript with async/await
- `context.Basket.set()` instead of `entity.save()`
- Contract calls via viem clients
- `event.chainId` available for multi-chain

Example handler migration:

```typescript
// src/handlers/BasketVault.ts
import { BasketVault, Basket, BasketActivity, User } from "generated";

BasketVault.Deposited.handler(async ({ event, context }) => {
  const basketId = `${event.chainId}-${event.srcAddress}`;
  
  // Load or create basket
  let basket = await context.Basket.get(basketId);
  if (!basket) {
    basket = {
      id: basketId,
      chainId: event.chainId,
      vault: event.srcAddress,
      // ... defaults
    };
  }
  
  // Update cumulative stats
  basket = {
    ...basket,
    cumulativeDepositedUsdc: basket.cumulativeDepositedUsdc + event.params.usdcAmount,
    totalDepositCount: basket.totalDepositCount + 1n,
    updatedAt: event.block.timestamp,
  };
  
  context.Basket.set(basket);
  
  // Create activity
  const activityId = `${event.chainId}-${event.transaction.hash}-${event.logIndex}`;
  context.BasketActivity.set({
    id: activityId,
    chainId: event.chainId,
    basket_id: basketId,
    activityType: "deposit",
    amountUsdc: event.params.usdcAmount,
    shares: event.params.sharesMinted,
    user_id: event.params.user,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
  });
});
```

### 5. Handle Dynamic Contracts (BasketVault Template)

Envio supports dynamic contract registration:

```typescript
// src/handlers/BasketFactory.ts
import { BasketFactory, BasketVault } from "generated";

BasketFactory.BasketCreated.contractRegister(({ event, context }) => {
  // Register the new vault for indexing
  context.addBasketVault(event.params.vault);
});

BasketFactory.BasketCreated.handler(async ({ event, context }) => {
  const basketId = `${event.chainId}-${event.params.vault}`;
  
  context.Basket.set({
    id: basketId,
    chainId: event.chainId,
    creator: event.params.creator,
    vault: event.params.vault,
    shareToken: event.params.shareToken,
    name: event.params.name,
    createdAt: event.block.timestamp,
    // ... initialize other fields
  });
});
```

### 6. Contract Calls for State Refresh

Your `refreshBasketFromChain` makes RPC calls. In Envio:

```typescript
import { createPublicClient, http } from "viem";
import { sepolia, avalancheFuji } from "viem/chains";

const clients = {
  11155111: createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) }),
  43113: createPublicClient({ chain: avalancheFuji, transport: http(process.env.FUJI_RPC_URL) }),
};

async function refreshBasketFromChain(chainId: number, vaultAddress: string) {
  const client = clients[chainId];
  const [name, sharePrice, perpAllocated] = await Promise.all([
    client.readContract({ address: vaultAddress, abi: basketVaultAbi, functionName: "name" }),
    client.readContract({ address: vaultAddress, abi: basketVaultAbi, functionName: "getSharePrice" }),
    client.readContract({ address: vaultAddress, abi: basketVaultAbi, functionName: "perpAllocated" }),
  ]);
  return { name, sharePrice, perpAllocated };
}
```

### 7. Update Web App Integration

Replace subgraph client with Envio endpoint:

```typescript
// apps/web/src/config/subgraphs.ts
export const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_URL 
  ?? "https://indexer.bigdevenergy.link/your-slug/v1/graphql";

// No more per-chain URLs - single endpoint serves all chains
```

Update queries to filter by `chainId`:

```graphql
query GetBasketsForChain($chainId: Int!) {
  baskets(where: { chainId: $chainId }) {
    id
    chainId
    name
    tvlBookUsdc
  }
}

query GetAllBaskets {
  baskets {
    id
    chainId
    name
    tvlBookUsdc
  }
}
```

### 8. Deployment Options

**Option A: Envio Cloud (Hosted)**

```bash
cd apps/envio
npx envio deploy
```

- Managed hosting, no infra to maintain
- Pay per indexed event (free tier available)

**Option B: Self-Hosted Docker**

```bash
docker compose up -d  # Envio provides docker-compose.yml
```

- Postgres + Envio indexer containers
- Use your existing RPC endpoints

---

## File Structure After Migration

```
apps/
├── subgraph/           # Keep for reference, can delete later
└── envio/
    ├── config.yaml     # All chains + contracts
    ├── schema.graphql  # Entities with chainId
    ├── src/
    │   ├── handlers/
    │   │   ├── BasketFactory.ts
    │   │   ├── BasketVault.ts
    │   │   ├── VaultAccounting.ts
    │   │   ├── OracleAdapter.ts
    │   │   └── StateRelay.ts
    │   └── utils/
    │       └── contractCalls.ts
    ├── abis/           # Copy from subgraph/abis/
    └── package.json
```

---

## Migration Checklist


| Step                             | Effort | Notes                            |
| -------------------------------- | ------ | -------------------------------- |
| Init Envio project               | 10 min | `npx envio init`                 |
| Configure networks + contracts   | 30 min | Translate networks.json          |
| Migrate schema                   | 15 min | Add chainId, remove @derivedFrom |
| Migrate BasketFactory handler    | 1 hr   | Include contractRegister         |
| Migrate BasketVault handlers     | 2 hr   | 8 event handlers + snapshots     |
| Migrate VaultAccounting handlers | 1.5 hr | 10 event handlers                |
| Migrate OracleAdapter handlers   | 30 min | 3 event handlers                 |
| Migrate StateRelay handler       | 30 min | 1 event handler                  |
| Contract call utilities          | 1 hr   | viem clients for state refresh   |
| Update web app queries           | 1 hr   | Add chainId filters              |
| Test locally                     | 2 hr   | `npx envio dev`                  |
| Deploy to Envio Cloud            | 30 min | `npx envio deploy`               |


**Total estimate: 1-2 days**

---

## Trade-offs vs Current Setup


| Aspect              | The Graph (current)        | Envio                            |
| ------------------- | -------------------------- | -------------------------------- |
| Deployments         | N per chain                | 1 total                          |
| Handler language    | AssemblyScript             | TypeScript                       |
| Sync speed          | Baseline                   | 10-100x faster                   |
| Hosting             | Graph Studio / self-hosted | Envio Cloud / Docker             |
| Decentralization    | Yes (mainnet)              | No (centralized)                 |
| Dynamic contracts   | Templates                  | contractRegister                 |
| Multi-chain queries | Client fan-out             | Single query with chainId filter |

