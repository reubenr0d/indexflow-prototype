---
title: "If You Run Money the Old Way, Here's the Crypto Question You'll Eventually Get Asked"
description: "If you run money traditionally, someone will ask you about crypto or tokenized sleeves. The hard part is not the idea—it is whether marks turn into cash when investors redeem."
date: "2026-04-16"
author: "Reuben Rodrigues"
tags: ["tradfi", "asset-managers", "structured-products", "liquidity"]
published: true
image: "/blog/if-you-run-money-the-old-way-crypto-question.svg"
---

Someone on your investment committee, your allocator, or your board will eventually ask a version of this question: **should we have a crypto or tokenized sleeve?**

If you have spent a career in traditional asset management, your instinct is to translate that question into something you already know how to govern: **exposure**, **risk limits**, **valuation policy**, and **counterparties**. Those instincts are right. They are also incomplete.

The question you will actually need to answer is quieter and more operational: **when an investor redeems, what turns into cash, on what timeline, and who owns the failure mode if the system is stressed?**

That is the crypto question. It is not "do we like Bitcoin." It is whether any on-chain structure you approve can pass the same liquidity and accountability tests you already apply to a mutual fund share class, a separately managed account, or a private fund line.

## Why this shows up on your desk now

Tokenized assets and on-chain wrappers stopped being a fringe research topic the moment real balance sheets started experimenting with them. Custodians, transfer agents, and fintech platforms are pitching **composability** and **24/7 rails** to the same institutions that still care deeply about **NAV integrity**, **AML/KYC**, and **stress liquidity**.

You do not have to believe in a narrative to be asked to evaluate infrastructure. You only have to be responsible for outcomes when markets gap and redemption queues form. In practice, that request often arrives as a **pilot**: a small sleeve, a single partner, a board slide with a single bullet you are expected to own. The right time to ask hard liquidity questions is before that pilot becomes precedent.

## The part that looks familiar: marks and policy

Traditional funds separate a few jobs that are easy to conflate when you read marketing decks.

**Portfolio management** is the model: what you own, how you hedge, how you rebalance.

**Fund accounting** is the truth function: how holdings roll up to a NAV that investors can rely on.

**Liquidity management** is the bridge: whether the fund can meet redemptions without fire sales, gates, or awkward side pockets.

On-chain products inherit the same separation of concerns. A sleeve can show you a clean **mark** and still be fragile on the way out if the plumbing that converts positions into **settlement cash** is thin, fragmented, or dependent on manual steps you did not price into the operating model.

If you have ever argued with a prime broker about what counted as "available liquidity" versus "accounting liquidity," you already understand the problem. Crypto just adds new venues and new failure modes.

## The part that is easy to miss: who runs the sleeve

In traditional structures, roles are legible. The investment manager proposes trades. The administrator calculates NAV. The custodian holds assets. Compliance sets the guardrails.

Many on-chain vault-style products compress those roles into **smart contracts and interfaces**. That can be an efficiency. It can also mean **your organization** ends up responsible for operational details that used to sit with a service provider: monitoring reserves, understanding how leverage is applied, and knowing what happens when volatility spikes.

Before you approve anything, it is worth asking the boring questions out loud.

- **Redemption path:** What asset does an investor receive on exit, and how is it sourced?
- **Stress behavior:** What breaks first when volumes spike: pricing, execution, or settlement?
- **Operator model:** Who is the curator day to day, and what powers do they actually have?
- **Transparency:** Can you reconstruct the sleeve's state from data you trust, not only from a vendor dashboard?

None of this requires you to become a protocol engineer. It does require you to refuse the shorthand that "on-chain" equals "automatically safer" or "automatically more liquid."

## Where IndexFlow fits (without turning this into a pitch)

IndexFlow is structured **basket vault** infrastructure: investors deposit stable collateral, receive shares tied to basket NAV, and redeem through the same accounting surface. The protocol is designed around a constraint traditional PMs already respect in practice: **portfolio value and exit liquidity are not the same thing.** A sleeve needs both a credible mark and a credible path to cash when investors want out.

IndexFlow also treats **where execution and pool liquidity live** as a protocol problem, not a retail UX problem. In multi-chain environments, asking every end user to pick the "right" chain is a hidden operational risk for the product layer. IndexFlow routes flow using **reserve and routing signals** so exposure products can aim at deeper execution liquidity without turning chain selection into a manual step for each depositor. (If you want the technical version of that story, it is written up in plain language alongside the rest of the system in the project documentation.)

If your job is to evaluate whether that design pattern fits your governance model, the next step is not conviction about tokens. It is **diligence**: read the architecture, run the testnet flow, and map the failure modes to the same risk framework you already use.

## A narrow disclaimer

IndexFlow is **open-source, permissionless protocol software**, not a fund, not a bank, and not personalized investment advice. Anything you do with it sits inside **your** legal, compliance, and fiduciary stack. The point of this post is to give you the question to ask early—before a board meeting turns into a rushed "yes" based on a slide deck.

If you want to go deeper on mechanics and operator flows, start with the [IndexFlow documentation](https://indexflow.app/docs), then explore Baskets, Assets, and Chains from the public app navigation.
