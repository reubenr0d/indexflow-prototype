# IndexFlow Whitepaper

Status: draft whitepaper  
Date: 2026-04-14

## Abstract

IndexFlow is a protocol architecture for launching structured exposure products on top of a shared perpetual liquidity layer. It is designed for asset managers, issuers, fintech platforms, real-world asset operators, and ecosystem partners that need more than a token wrapper. The system combines basket-style product packaging, shared execution liquidity, reserve-backed redemptions, and chain-specific deployment attribution into a single operating model.

The core design truth is simple: portfolio value and exit liquidity are not the same thing. IndexFlow defines that difference as the gap between `full NAV` and `redeemable liquidity`, and treats it as the primary architectural constraint. The result is a product model built around redemption quality, manager flexibility, and chain-attributable growth rather than raw TVL alone.

## The Problem: Fragmented Structured Exposure and Unattributable Liquidity Support

Onchain finance has developed strong primitives, but the product stack remains fragmented.

Perpetual venues are strong at execution, leverage, and price discovery. Strategy vaults are strong at packaging manager behavior. Tokenized index products are strong at wrapping exposure into a simple interface. None of these categories fully solve the problem faced by institutions, issuers, or chain ecosystems that want structured exposure products with durable liquidity and measurable ecosystem outcomes.

Three gaps remain.

First, most community grant programs create short-lived TVL spikes without durable attribution. Capital arrives for incentives, leaves when incentives fade, and produces weak evidence that the chain or ecosystem actually bought lasting usage.

Second, product structures often obscure the difference between portfolio value and redeemability. Investors may own a claim on a strategy, but the system does not always make clear how quickly that claim can be turned back into cash under real operating conditions.

Third, capital efficiency is fragmented. One product holds its own liquidity, another venue maintains its own execution surface, and another wrapper tries to distribute exposure on top. This creates duplicated liquidity needs, weaker routing, and thinner depth where depth matters most.

## Why Now, Why This Category, Why IndexFlow

The timing for IndexFlow comes from the evolution of the market itself. Tokenized wrappers proved that exposure can be packaged. Shared-liquidity perps proved that execution capacity can be concentrated. Manager platforms proved that onchain products can support professional operators and configurable strategy logic. What has remained unresolved is how to combine those advances into a product that is easy to own, honest about redemption, and measurable as infrastructure.

IndexFlow emerges at that intersection. It uses a shared perpetual liquidity layer without reducing the user experience to trading. It uses a product wrapper without reducing the system to passive packaging. It uses manager flexibility without treating liquidity architecture as an afterthought. That combination is what makes the category newly viable now.

IndexFlow is therefore not a general-purpose perp venue, not only a strategist vault framework, and not only a tokenized wrapper. It is a structured exposure system whose defining feature is the way it connects product ownership, liquidity discipline, and chain-level attribution.

## IndexFlow Thesis

IndexFlow is built around a simple product thesis: complex market exposure should be packaged into an instrument that is simple to own, transparent to value, and disciplined to redeem.

In this model, a basket share represents a proportional claim on a product that can hold idle reserve capital, capital allocated into a shared perpetual liquidity path, and profit and loss produced by that activity. The product is not merely a passive basket of spot assets. It is a managed structured exposure surface.

That thesis leads to three operating principles.

The first is product-first design. Users and allocators should interact with a share that represents an exposure policy, not a collection of execution steps.

The second is shared-liquidity efficiency. A protocol should not require every product to bootstrap an entirely separate execution venue.

The third is redemption honesty. A well-designed product must distinguish between `full NAV` and `redeemable liquidity`.

These principles make IndexFlow suitable for managers and issuers that need configurable products, custom return logic, custom reference data, and ring-fenced reserve policy without collapsing back into opaque off-chain administration.

## Architecture Overview

IndexFlow can be understood as five linked layers.

### 1. Product Layer

The product layer is a set of structured basket vaults that accept stable collateral and issue transferable shares. Each basket represents a product definition rather than a single trade.

### 2. Shared Liquidity Layer

Below the product layer sits a shared perpetual liquidity engine. Basket capital can be routed into that shared layer so products do not need to maintain isolated execution venues.

### 3. Valuation and Pricing Layer

Product value is determined by idle reserves, capital allocated into the shared liquidity path, and the resulting profit and loss, using auditable reference data and transparent pricing policy.

### 4. Reserve and Redemption Layer

The reserve layer determines whether a share is redeemable with confidence. It is the part of the architecture that governs redemption quality.

### 5. Attribution and Governance Layer

At the top sits the coordination layer: chain-specific deployment boundaries, KPI attribution, support allocation, and later-stage token governance. Cross-chain coordination follows a hub-and-spoke topology described in detail in a later section.

## Basket Lifecycle: Deposit, Exposure, Valuation, Redemption

The user lifecycle begins with a stable collateral deposit into a basket product. In return, the user receives transferable basket shares that represent a proportional claim on that product.

From there, the manager or product logic can keep capital idle as reserve, allocate part of it into the shared perpetual liquidity path, or realize gains and losses over time as the product operates. The share therefore represents the full economic surface of the basket rather than just the idle cash sitting inside it.

Valuation is based on `full NAV`. This includes on-hand reserve capital, capital allocated into the shared execution path, and accumulated profit and loss. Redemption, by contrast, depends on `redeemable liquidity`: the cash immediately available to satisfy exits.

This creates what IndexFlow treats as the redemption-quality flywheel: more reserve depth improves redemption reliability; better redemption reliability improves confidence; stronger confidence supports deposits and capital reuse; more capital reuse supports activity and fees. That flywheel is why reserve policy is a product-quality mechanism rather than a passive treasury setting.

## Shared Liquidity and Reserve Design

IndexFlow is designed around a two-layer liquidity model.

At the product layer, reserve support improves redemption quality. At the shared layer, pooled support improves execution depth. These two forms of liquidity serve different purposes and should not be conflated.

This structure avoids two common failure modes. The first is isolated fragmentation, where every product needs its own execution surface and never reaches durable depth. The second is undisciplined pooling, where capital appears available on paper but no product has a credible redemption boundary.

IndexFlow takes a middle path. Execution capacity is shared, while reserve discipline remains product-aware. That separation is what allows the protocol to benefit from capital efficiency while preserving the redemption-quality flywheel.

GMX execution depth exists only on the hub chain. Spoke vaults hold idle USDC as redemption reserves; perp capital allocation and GMX pool seeding (`VaultAccounting.seedPool()`) are hub-only operations. USDC deposited on spoke chains never bridges for perp capital — perps use only hub-local USDC. The full cross-chain architecture and its implications for reserve design are described in the Cross-Chain Architecture section below.

## Chain-Specific Deployment and Attribution Model

IndexFlow is designed to be chain-agnostic at the protocol level and chain-specific at the deployment level.

Each supported chain receives its own deployment instance, its own liquidity support boundaries, and its own attribution model. There is no cross-chain dilution of results. Capital committed to a chain should be measurable against that chain's outcomes.

This architecture makes the system unusually well suited for pilot programs, grant committees, ecosystem funds, and other partners that need causal visibility into what their support produced.

The KPI surface is straightforward.

TVL shows whether the product base is growing. Volume shows whether the shared liquidity layer is actually being used. Fees show whether supported activity is becoming economically meaningful. These outcomes can be tracked per deployment rather than lost inside a generic multichain narrative.

This ring-fenced deployment model also creates better expansion logic. A chain does not need to underwrite a global pool with unclear spillovers. It can support a specific deployment, observe its metrics, and scale support according to results. That makes chain-attributable growth more accountable and more defensible than generalized incentive programs.

Attribution remains per-chain even as the protocol operates cross-chain. A deposit on Chain B credits Chain B's KPIs. A redemption from Chain C is measured against Chain C's reserve depth. The hub-and-spoke coordination model described in the next section preserves this ring-fenced growth model while enabling capital to flow between chains when operationally necessary.

## Cross-Chain Architecture: Hub-and-Spoke Model

IndexFlow uses a hub-and-spoke topology for cross-chain coordination. This section describes the model in detail, covering its motivation, the contracts involved, deposit routing, share pricing, cross-chain redemptions, and the scalability properties that follow from these design choices.

### Motivation and Design Constraints

A naive approach to multi-chain structured products would replicate the full stack — oracles, perpetual venues, accounting, and reserve management — on every supported chain. That approach fails on three dimensions. First, oracle infrastructure and perp liquidity are expensive to bootstrap and fragment depth. Second, cross-chain state synchronization becomes an O(N²) messaging problem that grows unmanageably as chains are added. Third, every chain becomes a potential source of pricing inconsistency if oracle feeds or venue behavior diverge.

IndexFlow addresses these constraints by concentrating all perp infrastructure on a single hub chain and reducing spoke chains to minimal deposit-and-reserve surfaces. The result is a system where adding a new chain requires deploying only three lightweight contracts rather than replicating an entire execution stack.

### Hub Chain

The hub chain (Sepolia in testnet; a production-grade EVM L1 or L2 in mainnet) hosts the complete execution infrastructure:

- **OracleAdapter** and price feeds for all supported assets.
- **GMX perpetual liquidity** and the shared execution pool.
- **VaultAccounting**, which tracks capital allocation, PnL, and pool positions.
- **PricingEngine**, which computes basket valuations from oracle data and position state.
- **BasketVault** instances that can allocate capital into perps via `allocateToPerp()`.
- **StateRelay**, which receives keeper-posted state like all other chains.

The hub is the authoritative source of perp PnL. All other chains derive their PnL view from keeper-posted adjustments rather than from local position data.

### Spoke Chains

Each spoke chain is a deposit-only surface with minimal infrastructure:

- **BasketVault** — accepts USDC deposits, issues basket shares, holds idle USDC as local reserve, and enforces the deposit routing guard. Spoke vaults do not have `allocateToPerp()` capability; they cannot open or manage perp positions.
- **StateRelay** — a lightweight contract that stores keeper-posted routing weights and per-vault global NAV adjustments.
- **RedemptionReceiver** — a Chainlink CCIP receiver that accepts keeper-initiated USDC transfers for cross-chain redemption fills.
- **BasketFactory** — creates new basket vaults on the spoke.
- **MockUSDC / USDC** — the deposit collateral token.

No oracles, no GMX pools, no `VaultAccounting`, and no `PricingEngine` are deployed on spokes. This minimal footprint is what enables scaling to a large number of chains without proportional infrastructure cost.

### StateRelay Contract

`StateRelay` is deployed on every chain, hub and spokes alike. It serves as the on-chain cache for two categories of keeper-posted data:

**Routing weights.** A basis-point table mapping each chain to a deposit weight. Weights across all chains sum to 10,000 bps. The keeper computes weights inversely proportional to each chain's idle USDC: under-funded chains receive higher weight to steer deposits toward them. Each `StateRelay` instance caches its own chain's weight in a `localWeight` field for O(1) reads by `BasketVault.deposit()`.

**Per-vault global NAV adjustments.** Signed integer adjustments that allow spoke vaults to reflect the hub's perp PnL in their share price calculations. The hub's adjustment is always zero (it reads PnL directly from `VaultAccounting`). Each spoke receives its pro-rata share of hub PnL as a signed adjustment.

State updates are gated to a registered keeper address and require strictly monotonic timestamps to prevent replay. Weights must sum to 10,000 bps (enforced on-chain). A `maxStaleness` parameter controls how long an adjustment remains valid before the vault falls back to local-only NAV.

### On-Chain Deposit Routing

Deposits are local transactions. A user on a spoke chain deposits USDC into that spoke's `BasketVault` and receives basket shares in the same transaction. No cross-chain messaging occurs on the deposit path.

The routing guard ensures balanced capital distribution. When `BasketVault.deposit()` is called, it checks `StateRelay.getLocalWeight()` against the vault's `minDepositWeightBps` threshold. If the spoke's weight falls below the threshold — meaning the chain already holds a disproportionately large share of total idle capital — the deposit reverts. This prevents capital concentration on any single chain without requiring synchronous cross-chain coordination.

The frontend reads the full weight table from any chain's `StateRelay` (all instances hold identical data after a keeper epoch) and orchestrates multi-chain deposit splitting. Given a deposit amount, the UI divides it proportionally across chains according to their weights and presents the split to the user. The user approves and signs one transaction per target chain. Each chain independently enforces its own routing guard, so the on-chain invariant holds even if the frontend is bypassed.

### Global NAV and Consistent Share Pricing

Share pricing must be consistent across all chains. A basket share minted on Spoke A and a basket share minted on Spoke B represent the same proportional claim on the product's total value, including perp PnL that accrues only on the hub.

The keeper achieves this by computing a global NAV for each vault:

```
globalNAV = Σ(idleUSDC across all chains) + hubPerpPnL
```

Each chain's `BasketVault._pricingNav()` combines its local idle USDC with the keeper-posted `globalPnLAdjustment` from `StateRelay`:

- **Hub vault:** reads `VaultAccounting.getVaultPnL()` directly for perp PnL. The keeper posts a zero adjustment for the hub.
- **Spoke vault:** `VaultAccounting` is not deployed, so local PnL is zero. The keeper posts a signed adjustment equal to `(spokeDeposits / totalDeposits) × hubPerpPnL`, which the vault adds to its local idle USDC to compute pricing NAV.

The result is that `getSharePrice()` returns the same value on every chain (within the precision of the keeper's last epoch). Share fungibility is maintained without requiring oracles or perp state on spokes.

If a `StateRelay` adjustment becomes stale (older than `maxStaleness`), the vault excludes it from pricing and reverts to local-only NAV. This is a conservative fallback: the share price may temporarily diverge from the global value, but it will not reflect outdated PnL data.

### Cross-Chain Redemptions

Redemptions are designed around a principle of local-first fulfillment with asynchronous cross-chain backfill.

**Local redemption.** When a user redeems basket shares on any chain, the vault first attempts to pay entirely from local idle USDC. If reserves are sufficient, the redemption completes in a single transaction: shares are burned, USDC is transferred, and no cross-chain interaction is needed.

**Partial fill and pending queue.** When local reserves are insufficient to cover the full redemption, the vault executes a partial fill: it pays what it can from available USDC and locks the remaining shares in the vault as a `PendingRedemption`. The vault emits a `RedemptionQueued` event with the redemption ID, the shortfall amount, and the redeemer's address.

**Keeper-initiated cross-chain fill.** The off-chain keeper monitors `RedemptionQueued` events across all chains. When a pending redemption is detected, the keeper identifies a chain with excess reserves — typically the hub or a spoke with disproportionately high idle USDC — and initiates a Chainlink CCIP USDC transfer from the excess chain to the spoke's `RedemptionReceiver` contract. The CCIP message includes a payload specifying the target vault and redemption ID.

**RedemptionReceiver processing.** The `RedemptionReceiver` contract on the spoke chain validates the inbound CCIP transfer against a `trustedSenders` allowlist (keyed by source chain selector). On successful validation, it forwards the received USDC to the target vault and calls `processPendingRedemption(id)`. The vault burns the locked shares and transfers USDC to the redeemer, completing the redemption.

CCIP is used exclusively for redemption fills. No deposit flow, weight update, or NAV adjustment depends on cross-chain messaging. This isolation means that a CCIP outage delays cross-chain redemption fills but does not block deposits, local redemptions, or state updates.

### USDC Isolation: Spoke Capital Never Bridges for Perps

A critical design invariant is that USDC deposited on spoke chains never leaves the spoke for perp capital allocation. Perp positions on the hub chain use only hub-local USDC — capital deposited directly on the hub or seeded there during initial deployment.

This invariant simplifies the trust model. Spoke depositors know that their USDC remains on the chain where they deposited it (except when it is sent to another spoke to fill a redemption shortfall, which is a conservative liquidity operation rather than a speculative capital deployment). It also eliminates bridge risk on the deposit-to-perp path: there is no scenario in which a bridge failure or exploit drains spoke deposits into a compromised execution venue.

The tradeoff is that hub perp capacity is bounded by hub-local capital. This is an intentional constraint. Scaling perp capacity is a hub-side concern addressed through direct hub deposits, protocol-owned liquidity, or future hub-to-hub expansion — not by siphoning spoke reserves.

### Scalability Properties

The hub-and-spoke model is designed to scale to 100+ spoke chains. The properties that enable this are:

**Minimal spoke infrastructure.** Each spoke deploys only `BasketVault`, `StateRelay`, `RedemptionReceiver`, `BasketFactory`, and a USDC token. No oracles, perp venues, or accounting contracts are needed. Deploying a new spoke is a scripted operation that takes minutes.

**O(N) keeper operations.** The keeper reads state from N chains and posts updates to N chains. There is no O(N²) cross-chain messaging. Weight computation is a single centralized calculation; the keeper posts the same table to every `StateRelay` via direct RPC calls rather than CCIP messages.

**No per-chain oracle infrastructure.** Oracles and price feeds exist only on the hub. Spokes receive their PnL view through keeper-posted adjustments. Adding a spoke does not require bootstrapping a new oracle network or securing additional price feed subscriptions.

**Graceful spoke failure.** If a spoke chain becomes unavailable, the keeper excludes it from the next weight computation and its weight drops to zero, steering deposits to the remaining chains. Pending redemptions on the unavailable spoke are delayed but not lost. No other chain is affected.

**Independent chain attribution.** Despite the shared keeper and hub PnL source, each spoke maintains its own TVL, deposit volume, and redemption metrics. Attribution does not require cross-chain tracing — a deposit on Chain B is credited to Chain B, period. This preserves the ring-fenced growth model even at scale.

## Oracle, Pricing, and Market Integrity

Structured exposure only works if product valuation is credible.

IndexFlow therefore depends on auditable reference data, transparent pricing policy, and controlled product admission. The system is designed for assets and strategies that can be supported by reliable oracles or specialized but auditable price streams. This is especially important because the protocol is intended to serve managers, issuers, and real-world asset operators that may need domain-specific reference data rather than simple spot feeds.

Market integrity in IndexFlow is not only about fair pricing at entry and exit. It is also about confidence that reported NAV reflects a coherent valuation framework and that the shared liquidity layer is operating against aligned market data.

Because `getSharePrice()` is a public view function computed entirely from on-chain state, it creates an independently verifiable valuation surface. Audit partners, fund administrators, and regulators operating regulated vehicles on top of IndexFlow can query the chain at any block height to verify basket NAV without depending on off-chain administrator calculations or manager-reported values. This on-chain verifiability is a structural compliance advantage over traditional fund structures where NAV is an opaque off-chain output.

This design supports two important outcomes.

First, it allows more complex products than a passive wrapper can support.

Second, it keeps product creation within a bounded admission framework. IndexFlow is not a permissionless landfill for arbitrary exposure claims. It is infrastructure for launching structured products whose valuation and liquidity profile can be defended.

## Governance, Token Sequencing, and Capital Formation

IndexFlow should not begin with token-first thinking.

The system's first liquidity problem is not token trading. It is product redeemability and execution depth. Reserve credibility comes first. Execution liquidity comes second. Token market liquidity comes later.

That sequencing matters because many onchain systems invert the order. They establish a token narrative before they establish product reliability. IndexFlow is designed to do the opposite.

In the early phase, governance is operational rather than political. The priorities are product design, reserve support, risk limits, audit readiness, legal and compliance work, and credible pilot deployments.

As the system matures, a token can become a coordination layer rather than a usage prerequisite. Its role is to govern concrete control points in the system: which baskets receive protocol support, which managers are admitted, which chains receive expansion, how incentives are directed, when protocol-owned liquidity grows, and which assets or oracle paths are admitted.

This produces a healthier governance model. The token does not invent demand by itself. It coordinates a system that is already economically working.

Capital formation follows the same logic. The first uses of capital are development, compliance, audit work, and reserve support. Only after liquidity credibility has been demonstrated does wider token market formation become strategically important.

The protocol launches permissionless, and the architecture is designed so that licensed operators can use it as infrastructure today. Operators that hold their own financial-services licenses (AIFM, MiFID, SEC RIA, or equivalent) can build on IndexFlow immediately, using the permissionless contracts as execution and settlement infrastructure beneath their own compliance wrapper -- a regulated fund vehicle, an institutional custodian, and the operator's own investor qualification and reporting obligations. Because the entire on-chain flow is USDC-in / basket-shares-out with synthetic-only exposure, custody requirements are simplified: no underlying equities or commodities are held in the contracts, so only USDC and basket share tokens need to be custodied. On-chain NAV verification via `getSharePrice()` further simplifies the fund administrator's valuation workflow: the chain itself is the calculation engine, and audit firms can verify basket NAV at any block without relying on off-chain administrator outputs. This is the same pattern used by crypto hedge funds that already route through Uniswap, Aave, and GMX under their own fund structures.

A separately licensed entity that provides KYC/KYB onboarding, compliant product issuance, NAV governance, and regulatory reporting on top of the same protocol remains an optional future business decision, not a committed roadmap step. Whether to pursue it depends on market demand and whether third-party service providers fill the gap independently. See the [Regulatory Roadmap](./REGULATORY_ROADMAP_DRAFT.md) for details on both the operator-license path and the optional regulated access tier.

## Competitive Landscape

The market around IndexFlow is best understood as an evolution of product design rather than a list of isolated competitors. That evolution is why this category can emerge now rather than earlier. Each wave solved a real problem. Each wave also left an architectural gap that the next generation tried to close.

### Wave 1: Tokenized Wrappers and Index Products

The first major wave focused on ownership abstraction. Protocols such as Set and Index Coop showed that complex exposure could be packaged into a single transferable instrument. This was an important step because it made diversified or rules-based exposure easier to distribute, understand, and hold. What this wave did not solve was active liquidity design. These products were strong wrappers, but they were not built around shared execution infrastructure, explicit redemption-quality management, or manager extensibility for more complex payoff structures.

### Wave 2: Shared-Liquidity Perps

The next wave focused on execution efficiency. Synthetix, GMX, Gains, and Jupiter showed that a common liquidity surface could support large amounts of leveraged trading while simplifying the user experience. This unlocked shared collateral models, pooled counterparty design, and deeper execution capacity than isolated products could typically sustain. But these systems optimized for trading first. The user was still primarily interacting with a venue, not owning a structured product whose liquidity profile and redemption path were part of the product definition itself.

### Wave 3: Execution-Specialized Venues

As the market matured, some protocols pushed further toward execution specialization. Drift, Hyperliquid, and dYdX represent a wave that optimized for throughput, order-book depth, market structure, and venue performance. This wave brought the ecosystem closer to professional trading infrastructure, whether through hybrid designs or chain-specialized order-book systems. The tradeoff is that the center of gravity moved even further toward venue quality. These systems are strong destinations for trading flow, but they are not designed primarily as structured ownership products for issuers, managers, or chain partners.

### Wave 4: Manager and Strategist Infrastructure

In parallel, another wave focused on manager flexibility. Enzyme and Sommelier demonstrated that onchain systems could support configurable vaults, portfolio logic, strategist workflows, and transferable vault shares. This was an important move beyond passive wrappers because it gave professional operators more expressive control over product behavior. What remained less developed was a shared perpetual-liquidity nucleus combined with explicit reserve-backed redemption discipline. Manager infrastructure improved, but the liquidity architecture often remained separate from the product thesis.

### Wave 5: Structured Exposure Infrastructure

IndexFlow sits in the next step of that progression. It takes the product simplicity of tokenized wrappers, the capital efficiency of shared-liquidity systems, and the configurability of manager platforms, then reorganizes them around a different organizing principle: the relationship between `full NAV` and `redeemable liquidity`. In IndexFlow, the product is not a trading venue and not only a configurable vault. It is a structured exposure instrument whose credibility depends on reserve depth, whose execution draws on shared liquidity, and whose deployment can be ring-fenced to produce chain-attributable growth.

The novelty is therefore not a new primitive. It is the architectural synthesis and deployment model. Earlier waves solved ownership abstraction, execution depth, and manager flexibility separately. IndexFlow's claim is that the next category is a system that combines them around structured exposure, reserve-backed redeemability, and chain-attributable growth. That is why it should be understood less as another competitor inside an existing box and more as an attempt to define the next box.

## Conclusion

IndexFlow defines a category of structured exposure infrastructure built around a simple principle: product value and product liquidity must be treated as related but distinct design problems.

For managers, issuers, and chain partners, that creates a clearer operating model - one that combines shared execution efficiency, reserve-aware product design, and measurable deployment outcomes in a single system.

## References

### Internal Context

1. IndexFlow Technical Architecture & Roadmap. Repository document.
2. Share Price and Operations. Repository document.
3. Global Pool Management Flow. Repository document.
4. Asset Manager Flow. Repository document.
5. Investor Flow. Repository document.
6. Cross-Chain Coordination Layer. Repository document.
7. Utility Token Tokenomics. Repository planning document.
8. IndexFlow slide deck: Perp-Driven Basket Vaults, Infrastructure for Measurable Liquidity Growth.

### External References

9. Synthetix documentation. https://docs.synthetix.io/
10. Index Coop, Index Protocol. https://docs.indexcoop.com/index-coop-community-handbook/protocol/index-protocol
11. Index Coop, Set Protocol V2. https://docs.indexcoop.com/index-coop-community-handbook/protocol/set-protocol-v2
12. Enzyme Vault overview. https://docs.enzyme.finance/onyx-user-documentation/enzyme-vault/overview
13. ERC-4626: Tokenized Vault Standard. https://eips.ethereum.org/EIPS/eip-4626
14. ERC-7540: Asynchronous Tokenized Vaults. https://eips.ethereum.org/EIPS/eip-7540
15. Uniswap v2 Whitepaper. https://docs.uniswap.org/whitepaper.pdf
16. GMX providing liquidity documentation. https://docs.gmx.io/docs/providing-liquidity
17. GMX V1 liquidity documentation. https://docs.gmx.io/docs/providing-liquidity/v1/
18. Gains Network gToken vaults. https://docs.gains.trade/liquidity-farming-pools/gtoken-vaults
19. Jupiter Perpetuals overview. https://station.jup.ag/assets/files/Jupiter-Perpetuals-Feb-2024-66183264a9656eef393cedfb0e2d5db1.pdf
20. Drift documentation. https://docs.drift.trade/
21. Drift JIT auctions. https://docs.drift.trade/developers/market-makers/jit-auctions
22. Drift Safety Module. https://docs.drift.trade/protocol/risk-and-safety/drift-safety-module
23. Sommelier Portfolio V1.5 architecture. https://sommelier-finance.gitbook.io/sommelier-documentation/smart-contracts/advanced-smart-contracts/portfolio-v1.5-contract-architecture
24. Hyperliquid documentation. https://hyperliquid.gitbook.io/hyperliquid-docs
25. dYdX Integration Documentation. https://docs.dydx.xyz/
26. Chainlink CCIP Documentation. https://docs.chain.link/ccip
