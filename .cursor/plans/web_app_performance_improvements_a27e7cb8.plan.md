---
name: Web App Performance Improvements
overview: Improve website performance through data-fetching optimizations, code-splitting, reduced RPC/subgraph fan-out, and bundle-size reductions across the Next.js web app.
todos:
  - id: batch-fanout
    content: "Eliminate per-card/per-row query fan-out: create batched trend-snapshots and oracle-price hooks, lift fetching to parent list components"
    status: pending
  - id: tiered-intervals
    content: Introduce tiered refetch intervals (fast/medium/slow) across wagmi hooks to reduce RPC polling pressure
    status: pending
  - id: oracle-waterfall
    content: Collapse useSupportedOracleAssets 6-stage waterfall into 2 batched multicalls
    status: pending
  - id: code-split
    content: Add next/dynamic for SharePriceChart, PositionsTable, DepositRedeemPanel, and admin heavy components
    status: pending
  - id: slim-errors-abi
    content: Generate errors-only ABI in extract-abis.js to avoid importing 7 full ABIs via all-errors.ts
    status: pending
  - id: loading-ui
    content: Add loading.tsx skeleton files for main routes (/baskets, /baskets/[address], /dashboard, /portfolio, /prices, /admin)
    status: pending
  - id: minor-wins
    content: Dashboard useMemo, primer CSS scoping, subgraph refetchOnWindowFocus, home SSR
    status: pending
isProject: false
---

# Web App Performance Improvements

The investigation found five high-impact themes, ordered from most impactful to least. Each maps to concrete changes.

---

## 1. Eliminate per-card/per-row query fan-out (highest RPC + subgraph cost)

Several list views mount **one hook instance per row**, causing N parallel subgraph/RPC calls that scale linearly with item count.

**Hotspots:**

- `**BasketCard`** ([apps/web/src/components/baskets/basket-card.tsx](apps/web/src/components/baskets/basket-card.tsx)) -- each card calls `useBasketTrendSnapshots(vault)`, producing N separate subgraph/RPC trend queries on the baskets grid.
- `**HoldingCard`** in [apps/web/src/app/portfolio/page.tsx](apps/web/src/app/portfolio/page.tsx) -- same pattern, one trend query per holding.
- `**AssetPriceRow**` in [apps/web/src/app/prices/page.tsx](apps/web/src/app/prices/page.tsx) -- each row runs `useReadContract` for `assetList`, `useOracleAssetPrice`, `useOracleIsStale`, `useOracleAssetConfig`, and `usePricingExecutionQuoteBothSides`. Cost grows linearly with oracle asset count.
- `**OracleAssetCard**` in [apps/web/src/app/admin/oracle/page.tsx](apps/web/src/app/admin/oracle/page.tsx) -- same per-index hook explosion.

**Fix:** Lift data fetching to the parent list component using batched `useReadContracts` (multicall) or a single subgraph query that returns all trend snapshots at once, then pass data down as props. Create:

- A `useBasketTrendSnapshotsBatch(vaults)` hook that fetches all vaults' trends in one query.
- A batched oracle-price hook that multicalls all asset prices/configs in one `useReadContracts`.

---

## 2. Reduce polling pressure and add tiered refetch intervals

Almost every wagmi hook uses `refetchInterval: 15_000` (15s) uniformly. On data-heavy pages like the basket detail ([apps/web/src/hooks/useBasketDashboardData.ts](apps/web/src/hooks/useBasketDashboardData.ts)), this creates **many independent 15s pollers** hitting the RPC in parallel.

**Fix:** Introduce tiered intervals:

- **Fast (15s):** Prices, vault PnL, stale checks -- data that users expect to be live.
- **Medium (60s):** Asset lists, fee configs, reserve ratios -- change infrequently.
- **Slow (5min):** Factory basket count, registered vaults, basket names -- near-static.

Define these as named constants in [apps/web/src/lib/constants.ts](apps/web/src/lib/constants.ts) and assign appropriately across hooks.

---

## 3. Fix the `useSupportedOracleAssets` waterfall

[apps/web/src/hooks/useOracle.ts](apps/web/src/hooks/useOracle.ts) has a **6-stage sequential waterfall**: `getAssetCount` -> `assetList(i)` per index -> `isAssetActive` per id -> `assetTokens` per id -> ERC20 `symbol` per token -> `assetSymbols` per id. Each stage waits on the prior React hook's data.

**Fix:** Collapse stages 2-6 into a single `useReadContracts` multicall that fetches all per-asset data (`assetList`, `isAssetActive`, `assetTokens`, `assetSymbols`) in one batch after `getAssetCount` resolves. Then do a second multicall for ERC20 `symbol` lookups. This reduces 6 rounds to 2.

---

## 4. Code-split heavy components with `next/dynamic`

Currently only the home page uses `next/dynamic`. Several heavy dependencies are pulled synchronously into page bundles.

**Targets:**

- **Recharts** -- wrap `SharePriceChart` ([apps/web/src/components/baskets/share-price-chart.tsx](apps/web/src/components/baskets/share-price-chart.tsx)) and any other chart components in `dynamic(() => import(...))`.
- **Basket detail page** ([apps/web/src/app/baskets/[address]/page.tsx](apps/web/src/app/baskets/[address]/page.tsx)) -- split `PositionsTable`, `SharePriceChart`, and `DepositRedeemPanel` into dynamic imports so the initial JS for the route is smaller.
- **Admin oracle/risk pages** -- dynamic-import per-card components.

---

## 5. Slim down `all-errors.ts` ABI bundle

[apps/web/src/abi/all-errors.ts](apps/web/src/abi/all-errors.ts) imports **7 full contract ABIs** to extract error fragments. Any page using `useContractErrorToast` pulls all of them.

**Fix:** Generate a dedicated errors-only ABI at build time (in `scripts/extract-abis.js`) that contains only `type: "error"` entries, or filter at module level so the full ABIs are not retained.

---

## 6. Add route-level loading UI and Suspense boundaries

There are **no `loading.tsx` files** under `apps/web/src/app/`. Users see no feedback during route transitions.

**Fix:** Add lightweight `loading.tsx` skeleton files for the main routes (`/baskets`, `/baskets/[address]`, `/dashboard`, `/portfolio`, `/prices`, `/admin`).

---

## 7. Minor / lower-priority wins

- **Dashboard memoization** ([apps/web/src/app/dashboard/page.tsx](apps/web/src/app/dashboard/page.tsx)): `openInterestByVault` and sorted lists are computed inline without `useMemo`; wrap in `useMemo`.
- **Primer CSS scoping**: Marketing keyframes/animation rules in [globals.css](apps/web/src/app/globals.css) ship to every route; extract primer-specific CSS into a co-located module import.
- **Home page SSR**: The landing page uses `ssr: false`, hurting LCP/SEO. Consider enabling SSR for the static marketing content.
- **Subgraph refetchOnWindowFocus**: The global `QueryClient` has no `defaultOptions`; consider setting `refetchOnWindowFocus: false` for subgraph queries to avoid surprise refetches on tab switch.
- `**useBasketDashboardData` subgraph overlap**: The hook fetches `useBasketDetailQuery(vault, 1, 0)` for assets/exposures while the basket page separately calls `useBasketActivitiesQuery` -- consider combining or sharing cache.

