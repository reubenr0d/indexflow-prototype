---
title: "Five Waves of On-Chain Exposure: From Set Protocol to Structured Infrastructure"
description: "The market for on-chain exposure products has evolved through five distinct waves. Each solved a real problem. Each left an architectural gap. Here's the full progression -- and what comes next."
date: "2026-04-16"
author: "Reuben Rodrigues"
tags: ["thesis", "competitive-landscape", "structured-products", "DeFi"]
published: true
image: "/blog/five-waves-transition.png"
---

We studied every on-chain basket and index protocol we could find. Set Protocol, Index Coop, Enzyme, Sommelier, GMX, Synthetix, Gains, Drift, Hyperliquid, dYdX, Jupiter. Every one of them got something important right. Every one of them left an architectural gap that the next generation tried to close.

The market for on-chain exposure products is not a flat competitive landscape. It is an evolution. Understanding that evolution explains why a new category -- structured exposure infrastructure -- can emerge now rather than three years ago, and why earlier approaches, despite being technically sound, were never going to converge on this design by iteration alone.

## Why This Matters

If you are an asset manager evaluating on-chain infrastructure, the question is not "which protocol has the most TVL." The question is: what did each generation solve, what did it leave unsolved, and does the infrastructure you are considering address the full stack?

The five waves are not a ranking. They are a design genealogy.

## Wave 1: Tokenized Wrappers

**Set Protocol. Index Coop. TokenSets.**

The first wave solved ownership abstraction. Before Set Protocol, getting diversified on-chain exposure meant manually buying and rebalancing multiple tokens. Set showed that complex exposure could be packaged into a single transferable ERC-20 instrument: buy one token, own a rules-based basket.

This was a genuine breakthrough. It made diversified exposure composable, transferable, and legible to wallets and interfaces that understood ERC-20s. Index Coop extended the model with community-governed index methodologies and an issuance/redemption layer.

What this wave did not solve: active liquidity design. These products were strong wrappers, but they were not built around shared execution infrastructure, explicit redemption-quality management, or manager extensibility for complex payoff structures. The basket was the product, but the liquidity backing the basket was someone else's problem.

## Wave 2: Shared-Liquidity Perps

**Synthetix. GMX. Gains Network. Jupiter.**

The second wave solved execution efficiency. Instead of isolated liquidity per product, these protocols pooled collateral into a shared surface that could support leveraged trading at scale. GMX's GLP pool, Synthetix's debt pool, Gains' gToken vaults -- each demonstrated that a common liquidity nucleus could deliver deeper execution and simpler UX than fragmented alternatives.

This unlocked pooled counterparty design and demonstrated that shared collateral models work. But these systems optimized for trading first. The user interacted with a venue, not a structured product. There was no concept of a managed basket whose liquidity profile and redemption path were part of the product definition itself. You could trade on the venue. You could not own a structured instrument built on top of it.

## Wave 3: Execution-Specialized Venues

**Drift. Hyperliquid. dYdX.**

As the market matured, a third wave pushed further toward execution specialization. Hyperliquid built a dedicated L1 for order-book perpetuals. dYdX migrated to an app-chain. Drift combined AMM and order-book mechanics on Solana. These protocols optimized for throughput, order-book depth, latency, and market structure -- the metrics that professional trading desks care about.

This wave brought the ecosystem closer to institutional-grade execution infrastructure. But the center of gravity moved even further from structured ownership. These are strong destinations for trading flow. They are not designed as structured exposure products for issuers, managers, or chain partners who want to create, manage, and distribute basket instruments.

## Wave 4: Manager and Strategist Infrastructure

**Enzyme. Sommelier.**

In parallel, a fourth wave focused on manager flexibility. Enzyme demonstrated that on-chain systems could support configurable vaults, portfolio logic, strategist workflows, and transferable vault shares. Sommelier added off-chain strategy computation with on-chain execution via a validator set. Both gave professional operators more expressive control over product behavior than any prior generation.

This was an important step beyond passive wrappers. But what remained less developed was the liquidity nucleus. Manager infrastructure improved, but the execution engine was typically external or fragmented. There was no shared perpetual-liquidity pool purpose-built for the structured products the managers were creating, and no explicit reserve-backed redemption discipline that separated NAV from redeemable liquidity.

## Wave 5: Structured Exposure Infrastructure

**IndexFlow.**

IndexFlow sits at the convergence point of these four prior waves. It takes the product simplicity of tokenized wrappers, the capital efficiency of shared-liquidity systems, the execution quality that comes from deep pooled reserves, and the configurability of manager platforms. Then it reorganizes all of them around a different organizing principle: the relationship between full NAV and redeemable liquidity.

In IndexFlow, the product is not a trading venue and not only a configurable vault. It is a structured exposure instrument whose credibility depends on reserve depth, whose execution draws on a shared GMX-fork liquidity pool, and whose deployment can be ring-fenced to produce chain-attributable growth.

The key distinction is reserve-backed redeemability. When a vault operator creates a basket on IndexFlow, the system enforces explicit separation between the vault's total NAV and the liquidity actually available for redemption. Portfolio value and exit liquidity are not the same thing. Making that constraint visible, enforceable, and configurable is what allows institutional operators to build products they can stand behind.

This is not a replacement for any prior wave. Set Protocol solved ownership abstraction. GMX solved pooled execution. Hyperliquid solved venue performance. Enzyme solved manager workflows. IndexFlow's claim is that the next category requires a system that combines these capabilities around structured exposure, reserve-backed redeemability, and per-chain attribution. The novelty is not a new primitive. It is the architectural synthesis.

## What This Means

If you are evaluating on-chain infrastructure for basket products, here is the lens this evolution provides:

**Ownership abstraction** is table stakes. Any credible system should produce a transferable, composable instrument.

**Shared liquidity** is a capital-efficiency requirement. Isolated liquidity per vault fragments execution and raises costs for everyone.

**Execution depth** matters for redemption quality. If the pool backing your product is thin, your NAV number is aspirational, not operational.

**Manager extensibility** is necessary for professional operators. Asset managers need custom allocation logic, fee structures, and risk parameters.

**Reserve-backed redeemability** is what turns a DeFi product into a structured instrument an institution can use. Without explicit separation between NAV and redeemable liquidity, the product's implied promise to investors is unenforceable.

Each wave solved one of these. The question for any new infrastructure is whether it addresses all five.

## Get Started

Read the full competitive landscape analysis in our [whitepaper](/docs/whitepaper), explore the protocol architecture in the [technical docs](/docs/technical-architecture), or try creating a basket vault on [testnet](https://indexflow.app) to see structured exposure infrastructure in action.
