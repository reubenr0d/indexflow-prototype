# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Web app: admin basket `Perp Allocation` card now shows `Available to Deposit` (remaining USDC available for perp allocation) alongside current allocation.
- Web app: portfolio page wraps the value / loading skeleton in a `<div>` instead of `<p>` so `Skeleton` (a `<div>`) is not nested inside a paragraph, avoiding invalid HTML and React hydration warnings.
- `DeployLocal` local deploy script: deploy `VaultMath` and link `Vault` creation bytecode from `out/Vault.sol/Vault.json` so `forge script` no longer fails on `vm.getCode("Vault.sol:Vault")` (wrong artifact id and unlinked `VaultMath` placeholders). `foundry.toml` grants read access to `./out` for `vm.readFile`.

### Added

- Web app: in-app docs/wiki under `/docs` with searchable section metadata, role filters, start-here paths, stable subsection routes (`/docs/overview`, `/docs/investor`, `/docs/operator`, `/docs/oracle-price-sync`, `/docs/pool-management`, `/docs/contracts-reference`, `/docs/troubleshooting`, `/docs/security-risk`), reusable per-page template sections (`Who is this for`, `What this section covers`, `Required permissions`, `Step-by-step flow`, `Failure modes`, `Related pages`), role badges, network context callouts, and in-page table-of-contents anchors.
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

- Web app UI: added reusable information popups (`InfoTooltip` + `InfoLabel`) across titled cards and table-like headers, including stat cards and admin basket list headers, with centralized tooltip copy keys for consistent operator-facing explanations.
- Web docs and landing page copy: rewrote in-app wiki language and homepage messaging for a more beginner-friendly explanation of deposits, basket shares, shared perp trading, operator roles, and liquidity constraints.
- Web app basket/admin composition cards now use a four-state matrix: allocated composition, assets-added-without-perp-activity, no-assets-allocated-yet (`0.00%` rows), and no-assets-listed-yet; configured assets prefer onchain `getAssetCount/getAssetAt` reads with subgraph fallback to avoid indexing-lag gaps, and configured-asset rows show asset name + address subtext + latest oracle price + last update time.
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
