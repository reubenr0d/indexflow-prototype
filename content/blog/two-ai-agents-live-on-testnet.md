---
title: "Two AI Agents Are Live on Our Testnet — Trading Mining Equities at Leverage"
seoTitle: "Two AI Agents Live on Testnet: Mining Equities at Leverage"
description: "Two IndexFlow AI agents are live on testnet, trading leveraged synthetic exposure to global mining equities with real market prices."
date: "2026-05-26"
author: "Reuben Rodrigues"
tags: ["AI-agents", "testnet", "mining", "vaults", "leverage"]
published: true
image: "/blog/two-ai-agents-live-on-testnet.svg"
---

Two AI agents have been managing live testnet vaults on IndexFlow since May 21. They are selecting mining equities, opening leveraged long positions, rotating between tickers as their signals change, and using the same contracts a human vault operator would use through the web app.

The agents are different by design.

One runs on a machine-learning signal engine. The other runs on an analyst-grade quality matrix. They both manage mining-focused vaults, but they see the market through different models, make different picks, and leave different audit trails.

That is the point. The testnet is no longer just a deployed contract system. It is an operating environment where autonomous vault managers can compete side by side, using real market symbols and real oracle prices.

You can watch both vaults live:

- **Mining Manager / Atlas ML vault:** [`0x4dcd...`](https://indexflow.org/baskets/0x4dcd435461e27f8bfb580d216b8d69490023a0ba)
- **Quality Matrix vault:** [`0xbd7e...`](https://indexflow.org/baskets/0xbd7ea7e23ae07f0dd65e0738babf8864fdd741f3)

The live dashboard is the source of truth. We are not freezing a PnL number into this post because the agents keep running, prices keep moving, and the point is to observe the system as it operates.

## Two Agents, One Protocol

The first agent is `mining-manager`, a vault manager driven by the Atlas ML engine. It scores mining equities, looks for strong predicted returns, checks live news context, and opens positions when the current top picks clear its rules. Its latest runs have favored names like `ABRA.TO`, `EEE.L`, and `CUU.V` — a silver developer, a UK-listed explorer, and a Canadian copper name.

The second agent is `quality-matrix-manager`. Instead of using the ML model, it uses an analyst-style Quality Matrix across eight categories: Drilling, Resources, Metallurgy, Economics, Permitting, Offtake, Capital Raises, and Construction. Its recent thesis has focused on high-scoring drill results and project-quality signals in names like `GRSL.V`, `AUAU.V`, `MC2.AX`, and `FDY.TO`.

The two agents share the same infrastructure. They both use IndexFlow basket vaults, the same perp accounting layer, the same oracle adapter, and the same write tools: wire assets, set tracked assets, allocate to the perp module, open positions, close positions. The difference is not a new contract or a special agent-only execution path. The difference is the markdown file that defines the agent and the signal source it consults.

That matters because it keeps the protocol surface simple. A human operator, an ML-driven agent, and a rules-driven analyst agent all use the same contract boundary. The protocol does not need to know who is making the decision. It only enforces the vault rules, ownership permissions, accounting, and PnL attribution.

Each run follows a visible operating loop:

1. Read vault state.
2. Pull the current signal set.
3. Check oracle assets and prices.
4. Plan the position.
5. Pass through the risk-officer review.
6. Execute the on-chain write.
7. Append the run to the public agent metadata.

That loop is not theoretical. The current run logs show hundreds of open and close attempts across the two agents, including position rotations, churn-guard checks, risk-officer downsizing, and failed transactions when a proposed action violates a rule or hits an execution constraint.

That is what we want from a testnet: not a perfect demo path, but an operating surface that exposes the real edge cases an autonomous manager has to handle.

For a deeper technical walkthrough of the agent framework, read [Your Vault Manager Is a Markdown File](/blog/autonomous-ai-agents-managing-vaults).

## The Universe Is the Product

The most interesting part of this testnet is not that the agents can trade "stocks." It is which stocks they can trade.

The agents are not choosing from a short list of US mega-caps. They are trading the long tail of the global mining market: TSX-V juniors, Canadian listings, ASX names, LSE tickers, and small-cap resource companies that almost never appear in synthetic-asset products.

Recent agent activity has touched symbols like:

- `ABRA.TO` — AbraSilver Resource
- `EEE.L` — Empire Metals
- `BIG.V` — Hercules Metals
- `AHR.V` — Amarc Resources
- `USA.TO` — Americas Gold and Silver
- `FFM.TO` — FireFly Metals
- `CUU.V` — Copper Fox Metals
- `PMT.AX` — PMET Resources
- `SURG.V` — Surge Copper
- `FDY.TO` — Faraday Copper

This is where IndexFlow starts to look different from earlier synthetic-equity experiments.

[Helix on Injective](https://helixapp.com/) offers synthetic stock perps today, but the focus is US majors. [Mirror Protocol](https://mirror.xyz/) attempted synthetic stocks at scale before [Terra collapsed in 2022](https://www.coindesk.com/learn/the-fall-of-terra-a-timeline-of-the-meteoric-rise-and-crash-of-ust-and-luna/). [Synthetix](https://blog.synthetix.io/) shipped stock synths, then discontinued them under regulatory pressure. Those systems proved that synthetic equity exposure is a real category. They did not solve the long-tail problem.

No active venue — synthetic or traditional — gives a user leveraged exposure to a small TSX-V copper explorer or an ASX lithium developer through a vault-managed strategy.

IndexFlow can point at that universe because the oracle layer is built for it. The `OracleAdapter` supports custom relayer assets. A keeper pulls live market quotes from Yahoo Finance, converts them into the protocol's expected price format, submits them on-chain, and syncs them into the perp pricing path.

In plain English: if the market has a real symbol and the relayer can resolve it, the protocol can represent it.

That does not make every symbol safe. Thin equities are hard. Junior mining names can have wide spreads, sparse trading, and gaps. But it does mean the design space is much wider than "synthetic AAPL, synthetic TSLA, synthetic NVDA." For a mining-focused vault, that is the entire point.

Most of the opportunity in mining does not sit in the largest names. It sits in companies where geology, drilling results, permitting, capital structure, and commodity cycles collide before the broader market has fully priced them. That is exactly the kind of universe where a specialized signal model or quality matrix has room to matter.

## What "Up on Testnet" Actually Means

There is an important caveat.

The PnL visible in these vaults is synthetic perpetual PnL on testnet. It is computed against on-chain oracle prices and settled through the protocol's GMX-style accounting path. It is not the same thing as a realized cash-equity return in a real-market execution account.

That distinction matters. Real markets have real spreads. Small-cap mining equities have real liquidity constraints. A real order has commissions, market impact, exchange hours, settlement, borrow constraints, and much lower leverage than a synthetic perp can express.

So the correct claim is not: "The bots made real-world trading profits."

The correct claim is: **two autonomous agents are running on a public testnet, using real market prices, managing vaults, opening leveraged synthetic positions, rotating between real mining equities, and currently showing positive on-chain vault performance.**

That is still a meaningful milestone.

Most testnets use fake prices. Fixed feeds, random walks, or hand-seeded values make a strategy look alive without testing it against market reality. IndexFlow's testnet is different because the agents are reacting to the same named assets a human operator would see on a market screen. When the ML agent chooses `ABRA.TO`, it is not choosing a placeholder. When the Quality Matrix agent opens `FDY.TO`, it is acting on a real company, a real symbol, and a real oracle price.

The result is not institutional-grade proof of a live trading strategy. Not yet.

It is proof that the operating loop works.

## Why Leverage Is the Wedge

The leverage these agents are using is not a testnet accident. It is the protocol working as designed.

Traditional equity markets cap margin far below what synthetic perps can express, especially outside large liquid US names. That is a structural limitation, not a UX problem. A traditional trading platform can help you buy a stock, maybe with conservative margin. It cannot give a broad user base vault-managed leveraged exposure to the global mining long tail.

Crypto venues have not filled that gap either. The synthetic-equity experiments that did exist mostly focused on large US names, and many of them are no longer live. The long tail of mining equities remains effectively inaccessible at leverage.

That is the wedge IndexFlow is testing: vault-managed leveraged exposure to real-world equities that are too specific, too fragmented, or too operationally awkward for traditional platforms and generic perp venues.

The agents are one layer of that wedge. They are not the whole product. The core product is the infrastructure: basket vaults, shared perp liquidity, oracle-supported asset registration, per-vault PnL attribution, and an operator model where strategies can be human-run, agent-run, or somewhere in between.

If the testnet keeps working, the future shape is clear: capital enters a vault, the vault exposes it to a curated strategy, and the manager — human or AI — operates leveraged positions across a universe that ordinary platforms do not support.

There is still serious work ahead. LP depth matters. Oracle design matters more when the underlying market is thin. Risk controls matter more when leverage is available. Regulatory positioning matters because synthetic equity exposure is not a casual product surface.

We are not handwaving those problems away. They are the design constraints.

## The Next Proof Step

The testnet tells us the protocol loop works. The next question is whether the signal survives real-market execution.

We are actively planning a sidecar that mirrors successful on-chain trades into a regulated paper-trading environment. The goal is simple: compare what the testnet showed against what real fills would have done, with spreads, slippage, and execution constraints included.

That bridge will start as paper-only. If it works, the direction is to publish reconciliation reports and eventually attested statements so the testnet performance can be compared against an external execution venue. We are still early in that work. No dates, no commitments, no venue relationship implied.

The reason to mention it now is not to tease another product. It is to be precise about the standard of proof.

Positive PnL on a synthetic testnet is interesting. Positive PnL that reconciles against real-market fills is much stronger. We want to build toward the stronger claim.

## Watch the Agents Trade

The live testnet is the best way to understand the system.

Start with the two AI-managed vaults:

- **Mining Manager / Atlas ML vault:** [`0x4dcd435461e27f8bfb580d216b8d69490023a0ba`](https://indexflow.org/baskets/0x4dcd435461e27f8bfb580d216b8d69490023a0ba)
- **Quality Matrix vault:** [`0xbd7ea7e23ae07f0dd65e0738babf8864fdd741f3`](https://indexflow.org/baskets/0xbd7ea7e23ae07f0dd65e0738babf8864fdd741f3)

Watch the tracked assets. Read the latest agent thesis. Look at the recent actions. Follow the position rotations.

The most important thing about this milestone is not that the agents had a good run. It is that the system is now producing observable behavior: decisions, transactions, risk reviews, oracle updates, and vault-level outcomes.

That is how financial infrastructure gets real. Not through a whitepaper claim. Through a loop that runs, leaves evidence, and improves under pressure.

The bots are live. The testnet is live. The long-tail mining market is now an on-chain strategy surface.

## Further reading

- [The IndexFlow Agent Company](/blog/indexflow-agent-company) -- the manifest, budgets, and governance constraints that sit around these agents.
- [Price feed flow documentation](/docs/price-feed-flow) -- how the on-chain oracle resolves long-tail mining tickers from real market data.
