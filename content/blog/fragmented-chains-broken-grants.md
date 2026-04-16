---
title: "100 Chains, 100 Grant Programs, One Outcome: Temporary TVL"
description: "Chain proliferation has fragmented liquidity and turned grant programs into mercenary capital subsidies. The industry needs attributable infrastructure, not more incentives."
date: "2026-04-16"
author: "Reuben Rodrigues"
tags: ["liquidity", "grants", "fragmentation", "infrastructure"]
published: true
image: "/blog/fragmented-chains-broken-grants.png"
---

The EVM ecosystem now has over 100 chains. L1s, L2s, L3s, app-chains, rollups-as-a-service deployments that launched last Tuesday. Each one has a grant program. Each one is competing for the same finite pool of protocols and capital. And each one is producing the same result: a temporary TVL spike that disappears when the incentive runs out.

This is not a coordination failure. It is a structural one. The grant model itself is broken, and the chain proliferation that feeds it is making the underlying liquidity problem worse, not better.

## The Proliferation Problem

Every new chain follows the same playbook. Launch a testnet. Announce a grant program or ecosystem fund. Recruit protocols to deploy. Measure success by TVL. Repeat.

The problem is that the supply of chains is growing faster than the supply of users and capital. Each new deployment fragments the same pool of liquidity across more venues. The result is not a growing pie -- it is the same pie cut into thinner slices.

Consider the arithmetic. If $10B in DeFi liquidity is spread across 10 chains, the average chain has $1B in depth. Spread it across 100 chains and the average drops to $100M. But liquidity does not distribute evenly. It follows power laws. A handful of chains get most of the capital. The rest get thin pools, wide spreads, and poor execution -- exactly the conditions that make users leave.

![Liquidity fragmentation across 100+ chains](/blog/liquidity-fragmentation.svg)

This creates a self-reinforcing cycle. Deep chains get deeper. Thin chains stay thin. And the grant programs designed to bootstrap those thin chains produce temporary capital inflows that exit as soon as the incentive expires.

## How Grant Programs Actually Fail

The typical chain grant lifecycle looks like this:

1. **Chain announces grant program.** $50M-$500M in native tokens earmarked for ecosystem growth. KPIs are vague -- usually "increase TVL" or "grow the developer ecosystem."

2. **Protocols apply.** Many apply to multiple grant programs simultaneously. The same team deploys the same contracts to five chains, adjusting only the RPC endpoint and chain ID.

3. **Capital arrives.** Grant tokens are distributed. Protocols use them for liquidity mining. TVL spikes. The chain's dashboard looks healthy for a quarter.

4. **Incentives expire.** Liquidity mining rewards run out. Mercenary capital migrates to the next chain offering incentives. TVL drops 60-80% within weeks.

5. **Chain cannot attribute results.** The grant committee asks what the program produced. The answer is unclear. Did the TVL represent real usage or just yield farming? Did the volume come from organic activity or incentive-driven wash trading? Did any of the capital stay?

The core failure is **attribution**. Chains spend millions in token incentives and cannot answer a basic question: did this grant produce durable economic activity on our chain?

This is not a new observation. But the response to the failure has been to adjust the incentive structure -- shorter vesting, milestone-based releases, retroactive funding. These are improvements to the delivery mechanism, not to the underlying model. The model itself -- subsidising protocol deployments and hoping for sticky capital -- has a structural flaw: it optimises for TVL, which is the wrong metric.

## TVL Is Not the Right KPI

TVL measures how much capital is parked. It does not measure whether that capital is doing anything useful.

A protocol can have $500M in TVL and generate zero trading volume. A lending market can show high deposits but minimal borrowing utilisation. A DEX can have deep pools that nobody trades against. In all these cases, the TVL number looks impressive, but the chain is not generating meaningful economic activity.

For grant committees, this creates a perverse incentive. Programs that maximise TVL are rewarded, even when that TVL is economically inert. Protocols optimise for the metric being measured, not the outcome the chain actually needs.

The metrics that matter for chain ecosystems are:

- **Volume**: is capital actually being used for execution?
- **Fees**: is the protocol generating on-chain revenue?
- **Retention**: does capital stay after incentives end?
- **Attribution**: can the chain prove that its support produced these outcomes?

These are harder to measure than TVL. They require instrumentation at the protocol level, not just a Dune dashboard. And they require protocols that are architecturally designed to produce and report these metrics -- not protocols that were copy-pasted across chains with no structural difference.

## Fragmented Liquidity Is the User Tax

The user pays for chain proliferation in execution quality.

When liquidity is fragmented, every trade gets worse. Slippage increases because pool depth is thinner. Price impact grows because there is less capital absorbing the order. And users have no reliable way to know which chain has the best execution conditions before they commit.

Most multi-chain DeFi apps make the user pick the chain. Arbitrum or Optimism? Base or Avalanche? The user picks based on habit, gas costs, or whichever bridge they used last. The protocol has no opinion. The result is that capital herds onto whichever chain is most popular, not whichever chain has the deepest available liquidity.

This is the fragmented liquidity tax: users get worse execution because depth is spread across too many venues, and no routing layer exists to direct capital where it would be most efficiently used.

For structured products -- baskets, vaults, managed exposure instruments -- the problem is even worse. These products depend on reliable execution depth for allocation changes, position management, and redemptions. Thin pools do not just mean worse prices; they mean the product itself cannot operate reliably.

## The Real Problem: No Infrastructure Layer Between Grants and Outcomes

The gap in the current model is not the grant mechanism. It is the absence of infrastructure that connects ecosystem funding to measurable, attributable, durable outcomes.

What chain ecosystems actually need is not more protocols deployed to their chain. They need infrastructure that:

1. **Produces attributable KPIs** -- TVL, volume, and fee generation that can be traced back to a specific chain deployment, not lost in a generic multichain aggregate.

2. **Creates structurally sticky capital** -- capital that stays because the product design creates retention mechanics (reserve depth, redemption quality, execution reliability), not because an incentive is paying it to stay.

3. **Routes by depth, not by default** -- a system where capital flows to chains with the deepest available execution liquidity, rather than whichever chain the user arbitrarily selects.

4. **Ring-fences deployments per chain** -- each chain gets its own deployment boundary with independent metrics, so ecosystem support is fully traceable to outcomes on that specific chain.

This is what distinguishes infrastructure from incentive programs. Incentives are temporary inputs that produce temporary outputs. Infrastructure is a permanent capability that produces compounding returns.

![Incentive model vs infrastructure flywheel](/blog/infrastructure-flywheel.svg)

The incentive model is linear: spend tokens, get temporary TVL, lose it when spending stops. The infrastructure model is a flywheel: deeper reserves improve redemption confidence, which attracts more deposits, which generates more activity, which funds deeper reserves. The flywheel compounds. The incentive does not.

## What a Better Model Looks Like

A chain ecosystem should be able to fund an infrastructure deployment and know exactly what it produced. Not "we gave $2M to protocols and TVL went up for a while." Instead: "this deployment generated $15M in chain-local TVL, $150M in annualised trading volume, and $390K in on-chain fee revenue -- all attributable to our chain, with independent KPIs that we can audit."

That requires a protocol architecture designed from the ground up for attribution. Not a generic DeFi application that happens to be deployed on your chain, but infrastructure where:

- Each chain deployment is ring-fenced with its own liquidity boundaries and its own KPI surface.
- Capital is structurally retained because the product depends on reserve depth for redemption quality -- not because an incentive is subsidising its presence.
- Cross-chain coordination exists so capital can be routed efficiently, but attribution remains per-chain: a deposit routed to Chain B credits Chain B's metrics.
- Volume and fee generation are intrinsic to the product operation, not artifacts of incentivised trading.

## How IndexFlow Approaches This

IndexFlow is built around this architectural thesis. Each chain deployment runs its own basket vaults backed by a shared perpetual liquidity layer, with independent KPIs (TVL, volume, fees) that are ring-fenced per chain. Ecosystem support is fully attributable -- a chain partner can fund a specific deployment and measure exactly what that funding produced.

The protocol's reserve-backed redemption model creates structural capital retention. Portfolio value and exit liquidity are not the same thing -- IndexFlow makes that distinction explicit by separating full NAV from redeemable liquidity. Reserve depth is a product-quality parameter, not a treasury setting. Deeper reserves mean better redemption reliability, which means more confidence, which means more deposits. The flywheel is built into the product architecture, not bolted on through incentives.

Cross-chain coordination via [TWAP pool depth tracking and Chainlink CCIP](/blog/cross-chain-liquidity-routing) enables proportional routing -- capital flows to chains with the deepest available execution liquidity automatically. Users never pick a chain. The protocol routes by depth, not by default. But attribution stays per-chain: even when deposits are routed cross-chain, the destination chain gets credit for the activity.

This creates a different operating model for chain ecosystem partnerships. Instead of subsidising protocol deployments with tokens and hoping for the best, a chain can deploy measurable infrastructure with a clear KPI surface: TVL shows whether the product base is growing, volume shows whether the shared liquidity layer is being used, and fees show whether supported activity is becoming economically meaningful. All per-chain, all auditable, all attributable.

## The Category Shift

The industry is overdue for a shift from incentive-driven growth to infrastructure-driven growth. Grant programs will continue to exist -- they serve a useful purpose in bootstrapping early-stage ecosystems. But the current model, where hundreds of millions in tokens are spent producing temporary TVL with no durable attribution, is not sustainable.

What changes this is not better incentive design. It is better infrastructure: protocols that produce measurable outcomes by design, that create structural capital retention through product architecture, and that give chain ecosystems the attribution visibility they need to justify continued support.

The chains that figure this out first -- that shift from funding deployments to funding infrastructure with attributable returns -- will have a durable competitive advantage. The rest will keep running the same grant program playbook and getting the same temporary results.

## Learn More

Read the [IndexFlow whitepaper](https://t.me/+vAT7osyaJCVmMDY1) for the full protocol thesis, explore the [technical documentation](/docs/technical-architecture-roadmap), or try a deposit on the [live testnet](https://indexflow.app) to see how structured exposure infrastructure works in practice.
