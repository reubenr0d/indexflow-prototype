# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Web app: enforced strict data-source fallback policy for indexed/list/history reads: when `NEXT_PUBLIC_SUBGRAPH_URL` is configured and subgraph queries succeed, subgraph data is preferred; when subgraph is unavailable/errors/returns unusable rows, affected views fully fall back to RPC instead of partial mixed sourcing.
- Web app: fixed `/prices/[assetId]` type mismatch by normalizing invalid asset ids to `undefined` (not `null`) before `useOraclePriceHistory` calls.
- Web app: fixed basket detail page compile issues in `/baskets/[address]` by cleaning duplicated/invalid sections and tightening history-source selection.
- Web app: stabilized `/baskets/[address]` deposit/redeem card height to reduce CLS by always rendering a reserved quote section (with placeholder values), upgraded deposit/redeem tabs to equal-width segmented controls, and clear the amount input whenever switching tabs.
- Web app: `/baskets/[address]` deposit/redeem panel now uses icon tabs with text labels for mode switching and removes the top `Quote preview` header/status chip row to simplify the card header area.
- Web app: normalized GMX USD `1e30` notional displays to full-dollar formatting across exposure surfaces, fixing corrupted outputs like `Net: $1000000000000000000.0B` in composition rows and correcting open-interest / pool notional stat rendering.
- Web app: admin basket `Perp Allocation` card now shows `Available to Deposit` (remaining USDC available for perp allocation) alongside current allocation.
- Web app: portfolio page wraps the value / loading skeleton in a `<div>` instead of `<p>` so `Skeleton` (a `<div>`) is not nested inside a paragraph, avoiding invalid HTML and React hydration warnings.
- `DeployLocal` local deploy script: deploy `VaultMath` and link `Vault` creation bytecode from `out/Vault.sol/Vault.json` so `forge script` no longer fails on `vm.getCode("Vault.sol:Vault")` (wrong artifact id and unlinked `VaultMath` placeholders). `foundry.toml` grants read access to `./out` for `vm.readFile`.
- Web app: admin basket `Perp Position Management` now treats size inputs as USD notional and converts to onchain `1e30` before calling `openPosition` / `closePosition` (collateral remains USDC `1e6`), fixing reverted GOLD-long attempts like `size=10`, `collateral=999` (`Vault: _size must be more than _collateral`). Max-size labels/use-max now display USD-notional values, and open/close errors are surfaced via toasts.
- Web app: basket and admin composition cards now fallback to onchain `VaultAccounting.getPositionTracking` exposure reads per configured asset when subgraph exposure rows are missing/stale, so allocation updates appear immediately after position opens/closes.

### Added

- Subgraph: `AssetTokenMapped` indexing support via a new immutable `AssetTokenMapUpdate` entity, plus manifest handler wiring for `VaultAccounting.AssetTokenMapped`.
- Subgraph: `sync:networks` workflow/script to derive `apps/subgraph/networks.json` addresses from `apps/web/src/config/local-deployment.json` and `apps/web/src/config/sepolia-deployment.json`.
- Web app prices drilldown route (`/prices/[assetId]`) with per-asset header status, historical `PriceUpdated` timeline, and price chart window controls (`24H`, `7D`, `30D`; default `7D`).
- Web app oracle price history data path: subgraph-first query for `OraclePriceUpdate` rows with RPC `getLogs` fallback (`PriceUpdated` events) when subgraph history is unavailable.
- Subgraph `OraclePriceUpdate` entity and `OracleAdapter` mapping persistence for immutable per-event oracle history (`assetId`, `price`, `priceTimestamp`, `blockNumber`, `txHash`, `logIndex`, `createdAt`), plus mapping test coverage.
- Web app: in-app docs/wiki under `/docs` with searchable section metadata, role filters, start-here paths, stable subsection routes (`/docs/overview`, `/docs/investor`, `/docs/operator`, `/docs/oracle-price-sync`, `/docs/pool-management`, `/docs/contracts-reference`, `/docs/troubleshooting`, `/docs/security-risk`), reusable per-page template sections (`Who is this for`, `What this section covers`, `Required permissions`, `Step-by-step flow`, `Failure modes`, `Related pages`), role badges, network context callouts, and in-page table-of-contents anchors.
- Web app docs IA expansion: new in-app routes `/docs/perp-risk-math` and `/docs/operator-interactions` with leverage formulas, unit glossary, operator preflight/postflight checklists, and per-contract interaction matrix data (inputs, preconditions, state deltas, failure risks, post-tx checks). Added canonical markdown companions: [docs/PERP_RISK_MATH.md](docs/PERP_RISK_MATH.md) and [docs/OPERATOR_INTERACTIONS.md](docs/OPERATOR_INTERACTIONS.md).
- Web navigation now links to docs from the main header and admin sidebar; admin overview quick actions include `Docs Wiki`.
- [docs/README.md](docs/README.md): maintainer-facing documentation index mirroring the in-app wiki IA and canonical markdown sources.
- [docs/SHARE_PRICE_AND_OPERATIONS.md](docs/SHARE_PRICE_AND_OPERATIONS.md): share-price calculation reference, dry-run oracle update commands, admin position/PnL update flow, and investor withdrawal-with-profit walkthrough.
- Subgraph schema/mapping support for per-basket perp exposure (`BasketExposure`: `longSize`, `shortSize`, `netSize`) and web query hooks for exposure + paginated basket activity history.
- Investor vault detail page (`/baskets/[address]`) now includes a `Vault History` timeline (subgraph-backed with load-more) plus RPC fallback over BasketVault and VaultAccounting logs when subgraph data is unavailable.
- Web app (`/admin/pool`): global GMX pool write controls for all whitelisted tokens:
  - gov-gated `setBufferAmount`
  - direct pool funding flow (`ERC20.transfer(gmxVault, amount)` then `directPoolDeposit(token)`)
  Includes token symbol/decimals/wallet balance reads for human-unit inputs, plus `parseTokenAmountInput` coverage tests.
- [docs/PRICE_FEED_FLOW.md](docs/PRICE_FEED_FLOW.md): price-feed lifecycle (bootstrap admin, reconfiguration, Chainlink vs custom relayer sync, consumer reads, optional direct `SimplePriceFeed` updates) with Mermaid sequence diagrams; README **Documentation** link.
- [docs/INVESTOR_FLOW.md](docs/INVESTOR_FLOW.md): investor-oriented flow for basket shares, mint/redeem vs NAV, perp allocation, and operational dependencies; README **Documentation** links.
- Web app: SVG favicon (`icon.svg`) and matching inline header logo — white triangle on a black circle.
- `VaultAccounting.getVaultPnL` aggregate **unrealised** mark-to-market PnL per basket vault (sum of GMX `getPositionDelta` over open legs; GMX USD precision; price PnL only, not funding), with per-vault `_openPositionKeys` enumeration. In-place upgrades need a backfill of that list for already-open legs (or redeploy).
- Unit tests for aggregate unrealised PnL (`test/VaultAccounting.t.sol`) and integration checks vs GMX deltas (`test/Integration.t.sol`, `test/VaultAccountingIntegration.t.sol`).
- Web tests: `apps/web/src/lib/wiki.test.ts` validates slug/page registry integrity, docs home start-path route resolution, and non-empty structured docs sections.
- README **Operations** section: PriceSync vs OracleAdapter, keeper setup, Chainlink vs custom relayer price flow, and funding keeper calls.
- Web app: liquidity-aware indicative quotes from `PricingEngine` on Admin → Position Management (open form) and on Live Prices when a USDC notional is entered; uses GMX USDC `poolAmount` as liquidity input (GMX fills may still differ).
- Integration test suite (`test/VaultAccountingIntegration.t.sol`) covering VaultAccounting `openPosition` / `closePosition` against the real GMX Vault: long profitable, long loss, short profitable, and full deposit→open→close→withdraw pipeline with PnL verification.
- Initial changelog and Cursor rule for maintaining this file.
- Per-vault risk limits in VaultAccounting: `maxOpenInterest` and `maxPositionSize` caps with admin setters.
- Emergency pause mechanism (`setPaused`) on VaultAccounting; blocks `openPosition`, `closePosition`, `depositCapital`, and `withdrawCapital` when active.
- Optional `maxPerpAllocation` cap on BasketVault to limit capital sent to the perp pool.
- Events: `MaxOpenInterestSet`, `MaxPositionSizeSet`, `PauseToggled`.
- Risk-limits unit test suite (`test/RiskLimits.t.sol`) covering owner-gated setters, pause/unpause deposit/withdraw blocking, and BasketVault `maxPerpAllocation` enforcement.
- `src/gmx/libraries/VaultMath.sol`: linked library for position PnL / next-average-price pure math; `VaultPricing` delegates `getDelta` and `getNextAveragePrice` to it to reduce `Vault` runtime bytecode.

### Removed

- Dead vendored GMX code: duplicate math libraries, unused OZ subtrees (ERC721, introspection, Strings, EnumerableMap/Set, vendored ERC20/Ownable), unused token implementations (WETH, Token), reference-only contracts (VaultPriceFeed, FastPriceFeed, FastPriceEvents), and ~20 unused interfaces for stripped modules (staking, AMM, governance, GLP, PositionRouter).
- Reader.sol functions for stripped features: `getTotalStaked`, `getStakingInfo`, `getVestingInfo`, `getPairInfo`.

### Changed

- Web app: basket deposit/redeem panel now shows a live quote preview, action icons, inline transaction rail states, and clearer submit/approval status feedback; shared status/trend pill primitives and basket icon helpers were added for consistency.
- Web app UI: added reusable information popups (`InfoTooltip` + `InfoLabel`) across titled cards and table-like headers, including stat cards and admin basket list headers, with centralized tooltip copy keys for consistent operator-facing explanations.
- Web docs and landing page copy: rewrote in-app wiki language and homepage messaging for a more beginner-friendly explanation of deposits, basket shares, shared perp trading, operator roles, and liquidity constraints.
- Web app basket/admin composition cards now use a four-state matrix: allocated composition, assets-added-without-perp-activity, no-assets-allocated-yet (`0.00%` rows), and no-assets-listed-yet; configured assets prefer onchain `getAssetCount/getAssetAt` reads with subgraph fallback to avoid indexing-lag gaps, and configured-asset rows show asset name + address subtext + latest oracle price + last update time.
- Web app basket/admin composition section now keeps one stable card/table layout (same heading, row geometry, allocation rail, and aggregate row) across allocated/zero-alloc/loading/empty states, with compact per-state notes and placeholder/skeleton rows to reduce CLS.
- Web app `Perp-Driven Composition` allocated rows now consistently render asset name + address on both public/admin pages (instead of raw asset ids on public), with aligned net/long/short detail hierarchy while preserving the stable low-CLS layout.
- Web app `Perp-Driven Composition` allocated rows now use a shared public/admin renderer with a diverging long-vs-short graphic, net-direction badge, full-dollar notional labels (`Net`, `Long`, `Short`), and subordinated allocation rail so exposure skew is immediately visible.
- Web app home page (`/`) redesigned to a high-energy, proof-first landing flow: stronger hero hierarchy, live protocol metrics strip (TVL/open interest/active baskets/perp utilization), tighter capital-flow narrative, explicit trust surface, and CTA priority toward opening baskets.
- Basket contracts are now weightless and fully perp-driven for pricing:
  - `BasketFactory.createBasket` no longer accepts initial `assetIds/weights`.
  - `BasketVault.setAssets` now accepts only `bytes32[] assetIds`.
  - Share pricing/mint/redeem flows use NAV (`idle USDC + perp allocated + realised/unrealised perp PnL`) instead of weighted basket oracle pricing.
  - `BasketVault.withdrawFromPerp` and `VaultAccounting.withdrawCapital` now support withdrawing realised profits (not only principal) while keeping accounting state consistent.
- Web admin basket setup no longer collects base weights; asset registration is ID-only.
- Web basket/admin composition UI removed base-weight presentation and now renders perp-driven exposure composition from indexed `long/short/net` sizes.
- `foundry.toml`: `optimizer_runs` lowered (200 → 1), `bytecode_hash = "none"`, and `cbor_metadata = false` so the deployed `Vault` stays under the EIP-170 runtime limit together with `VaultMath` linking.
- `VaultPricing.sol`: `_getDeltaInner` / `_getNextAveragePriceInner` isolate storage reads and library calls to satisfy the stack depth limit under `via_ir`.

- README: CI and Codecov line-coverage badges; NatSpec coverage table removed. CI runs `forge coverage --ir-minimum` and uploads LCOV to Codecov via OIDC.
- Documentation: expanded NatSpec across first-party Solidity 0.8.x contracts and interfaces in `src/perp/` and `src/vault/` (external/public API, structs, and errors) for even coverage and easier auditing.
- `PerpReader.getTotalVaultValue` includes unrealised PnL from `getVaultPnL` so basket NAV is mark-to-market (previously realised only).
- Web app: MetaMask in the RainbowKit modal uses wagmi’s injected extension connector (`eth_requestAccounts` / `wallet_requestPermissions`) instead of the MetaMask SDK path, so the browser extension prompt reliably appears.
- CI: push runs only on `main`, `develop`, and `feature/**`; test job runs after build (`needs: build`); single `forge test -vvv` step; removed non-enforcing TODO/FIXME grep from lint.
