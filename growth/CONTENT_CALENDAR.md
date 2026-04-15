# Content Calendar -- 8-Week Fundraise Phase

## How to Use This Calendar

Each week has a theme tied to a content pillar. Long-form pieces (Blog, Substack) anchor the week; short-form (X, LinkedIn, Farcaster) atomizes them across the week. Copy a template from `templates/`, draft in `drafts/`, then publish.

## Framing Principles

- **60/30/10 rule**: 60% educational/thought leadership, 30% project updates, 10% promotional
- **Hook-first**: Every piece opens with a hook (see `templates/tweet-thread.md` for the six types) -- never "Here are my thoughts on..."
- **Educate before you pitch**: 80% education, 20% IndexFlow across all content
- **Brand voice**: Institutional DeFi infrastructure tone -- precise, systems-language, confident problem/solution. "Smart colleague at a conference."
- **Core memeable distinction**: "Portfolio value and exit liquidity are not the same thing."

## Content Inventory

| Type | Count | Cadence |
| ---- | ----- | ------- |
| Blog posts | 8 | 1/week |
| Substack issues | 8 | 1/week |
| X threads | 18 | 2-3/week |
| X standalone tweets | 24 | 3/week |
| LinkedIn posts | 12 | ~2/week |
| Farcaster casts | 8 | 1/week |
| YouTube videos | 4 | 1 every 2 weeks |
| Podcast pitches | 5-7 | Week 3 outreach |
| **Total pieces** | **~83** | |

---

## Week 1 -- "The Problem" (Pillar: P1 Education + P2 Thesis)

**Blog:**

- **"On-Chain Structured Products Are Broken. Here's What Nobody Is Building."**
  - Source: `docs/WHITEPAPER_DRAFT.md` problem statement + primer PrimerProblem section
  - Hook type: Contrarian
  - Core argument: Three gaps (mercenary TVL, no attribution, fragmented capital) prevent institutions and chains from getting durable exposure. IndexFlow is structured exposure infrastructure.

**Substack:**

- Issue 1: **"Why We Started IndexFlow (And What We're Actually Building)"**
  - Founder letter. Personal narrative on seeing the gap. What the raise is for.

**X Threads:**

- Mon thread: **"$200B in structured product demand has no on-chain home. Here's why."**
  - Hook type: Data. 7-8 tweets. Source: whitepaper market thesis.
- Wed thread: **"Every DeFi vault protocol makes the same mistake. They treat TVL as exit liquidity."**
  - Hook type: Contrarian. 5-6 tweets. Source: whitepaper NAV vs redeemable.

**X Standalone Tweets (Tue/Thu/Fri):**

- Tue: "Wrappers proved packaging. Shared perps proved execution. Manager platforms proved operators. What's missing: combining them. That's IndexFlow."
- Thu: Quote-tweet a relevant DeFi/RWA/structured product take with IndexFlow angle
- Fri: Screenshot of testnet app + "Week 1 of building in public. Here's where we are."

**LinkedIn:**

- Post 1: **"Why Institutional-Grade Basket Infrastructure Doesn't Exist On-Chain Yet"**
- Post 2: Share blog with framing for fund managers / chain BD

**Farcaster:**

- Cast 1: **"We just shipped structured DeFi infrastructure on Sepolia. Deposit USDC, get basket shares priced by oracles, redeem from reserves. Here's what's different."**
- Cast 2: **"Our vaults use perp PnL for NAV pricing but only pay redemptions from idle USDC. That distinction is the whole design."**

**Telegram:** Pin blog, share Substack link

---

## Week 2 -- "How It Works" (Pillar: P1 + P3)

**Blog:**

- **"From USDC to Basket Exposure in One Transaction: The IndexFlow Vault Lifecycle"**
  - Source: `docs/INVESTOR_FLOW.md` + primer PrimerHow section
  - Hook type: Curiosity Gap
  - Include deposit/mint/allocate/track/redeem flow diagram

**Substack:**

- Issue 2: **"Under the Hood: What Happens When You Deposit Into a Basket Vault"**
  - Progress update + education combo. Walk through the five-step lifecycle.

**X Threads:**

- Mon thread: **"How does a single USDC deposit become exposure to five assets with zero token swaps? Here's the full flow."**
  - Hook type: Curiosity gap. 8 tweets walking through deposit -> mint -> allocate -> track -> redeem.
- Thu thread: **"The difference between 'how much your vault is worth' and 'how much you can withdraw right now.' A thread on the most misunderstood concept in DeFi vaults."**
  - Hook type: Stakes. 6 tweets. Source: `docs/SHARE_PRICE_AND_OPERATIONS.md`

**X Standalone Tweets (Tue/Wed/Fri):**

- Tue: "One deposit. Five assets. Zero token swaps. That's what basket infrastructure should feel like."
- Wed: [IMAGE: side-by-side] "ETF creation (left) vs IndexFlow vault creation (right). The on-chain version is simpler."
- Fri: Dev update -- what shipped this week + screenshot

**LinkedIn:**

- **"The Mechanics of On-Chain Basket Creation: How Structured Exposure Products Actually Work"**

**Farcaster:**

- **"Shares are a pro-rata claim on vault NAV. But redemptions pay from idle USDC only. If more capital is in perps, redemption headroom falls. That's not a bug -- it's the core design constraint."**

**YouTube:**

- Video 1: **"IndexFlow in 60 Seconds: Deposit to Redemption on Testnet"** (screen recording walkthrough)

---

## Week 3 -- "The Core Insight" (Pillar: P1 + P3)

**Blog:**

- **"NAV Is Not Exit Liquidity: The Design Constraint Every Vault Protocol Ignores"**
  - Source: `docs/WHITEPAPER_DRAFT.md` (NAV vs redeemable), `docs/SHARE_PRICE_AND_OPERATIONS.md`, primer PrimerNAV section
  - Hook type: Contrarian
  - This is the "signature idea" post -- the one that defines IndexFlow's intellectual contribution.

**Substack:**

- Issue 3: **"The Gap Between What You Own and What You Can Withdraw"**
  - Accessible version of the NAV insight for non-technical investors. Include the 100k deposit -> 102k NAV -> constrained exit worked example.

**X Threads:**

- Mon thread: **"Your vault says it's worth $10M. But can you actually withdraw $10M right now? For most DeFi vaults, the answer is no -- and nobody tells you."**
  - Hook type: Stakes. 8 tweets. The signature thread.
- Wed thread: **"We built a vault protocol where the constraint is explicit. Reserve depth is a product-quality parameter, not a treasury setting."**
  - Hook type: Insider knowledge. 6 tweets on IndexFlow's reserve design.

**X Standalone Tweets (Tue/Thu/Fri):**

- Tue: "Full NAV: what the fund is worth. Redeemable liquidity: cash you can actually get out today. They diverge by design. Good products make that explicit."
- Thu: "Reserve depth is a product-quality parameter, not a treasury setting." [IMAGE: NAV bar diagram from primer]
- Fri: Building in public -- testnet metrics update

**LinkedIn:**

- **"Why Every Institutional Investor Should Ask Their DeFi Vault Manager One Question: What's My Actual Redemption Headroom?"**

**Farcaster:**

- **"pricingNav = idle USDC + perpAllocated + realizedPnL + unrealizedPnL. But redemptions only pay from idle USDC. That gap is the entire design. Most protocols hide it."**

**Podcast outreach:**

- Send first wave of pitches (Bankless, Bell Curve, The Defiant, Empire, Epicenter)

---

## Week 4 -- "The Competitive Landscape" (Pillar: P2 Thesis)

**Blog:**

- **"Five Waves of On-Chain Exposure: From Set Protocol to Structured Infrastructure"**
  - Source: `docs/WHITEPAPER_DRAFT.md` competitive waves section
  - Hook type: Insider Knowledge
  - Wave 1 (wrappers) -> Wave 2 (shared perps) -> Wave 3 (execution venues) -> Wave 4 (manager infra) -> Wave 5 (IndexFlow = synthesis)

**Substack:**

- Issue 4: **"Month 1 Investor Update: Testnet Metrics, Architecture, What We Learned"**
  - First monthly investor update. Metrics, milestones, pipeline, what's next.

**X Threads:**

- Mon thread: **"We studied every on-chain basket and index protocol. Set, Index Coop, Enzyme, Sommelier, Tokemak. Here's what they all got wrong -- and what they got right."**
  - Hook type: Insider knowledge. 9 tweets. Wave-by-wave breakdown.
- Thu thread: **"GMX, Synthetix, Gains, Jupiter, Hyperliquid, dYdX -- they all proved shared liquidity works for trading. None of them built structured ownership products on top. That's the gap."**
  - Hook type: Curiosity gap. 6 tweets.

**X Standalone Tweets (Tue/Wed/Fri):**

- Tue: "Wrappers proved packaging. Shared perps proved execution. Manager platforms proved operators. Nobody combined them. That's Wave 5."
- Wed: [IMAGE: competitive landscape diagram] "The evolution of on-chain structured products, in one chart."
- Fri: Building in public update

**LinkedIn:**

- Post 1: **"Why Traditional Asset Managers Are Looking at On-Chain Baskets -- And What's Stopping Them"**
- Post 2: **"The Five Waves of On-Chain Exposure Products"** (share blog with professional framing)

**Farcaster:**

- **"Hot take: the next $100B in DeFi TVL won't come from another perp DEX. It'll come from structured exposure infrastructure that institutions can actually underwrite."**

---

## Week 5 -- "The Architecture" (Pillar: P3 Technical Credibility)

**Blog:**

- **"Many Baskets, One Engine: How IndexFlow's Shared Perpetual Liquidity Pool Works"**
  - Source: `docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md`
  - Hook type: Curiosity Gap
  - Deep technical post: shared pool mechanics, per-vault PnL attribution, what happens when correlated vaults stress the pool.

**Substack:**

- Issue 5: **"The Oracle Problem Nobody Talks About: Pricing Equities and Commodities On-Chain"**
  - Accessible deep dive on Chainlink + custom relayer design and why it matters.

**X Threads:**

- Mon thread: **"How do you track PnL for 10 different baskets trading against one shared liquidity pool -- without mixing their money? Here's our accounting architecture."**
  - Hook type: Curiosity gap. 8 tweets with code snippets / diagrams.
- Wed thread: **"Our oracle feeds price equities AND commodities on-chain. Here's how we built a dual-feed system with Chainlink + custom relayers and why one feed type wasn't enough."**
  - Hook type: Insider knowledge. 7 tweets.

**X Standalone Tweets (Tue/Thu/Fri):**

- Tue: "162 tests. All passing. Every invariant documented. Here's what our test suite actually checks." [IMAGE: test output screenshot]
- Thu: "The shared pool is a feature AND a risk. When correlated vaults all win, withdrawals can stress shared liquidity. We test for this explicitly." [IMAGE: stress test output]
- Fri: GitHub milestone update

**LinkedIn:**

- **"Designing Oracle Infrastructure for Multi-Asset Baskets: Lessons From Building on Chainlink"**

**Farcaster:**

- **"VaultAccounting acts as a single trader opening positions for many baskets against one GMX pool. Per-vault state: depositedCapital, realisedPnL, openInterest, collateralLocked, positionCount. The accounting is where the product lives."**

**YouTube:**

- Video 2: **"IndexFlow Architecture in 5 Minutes: Shared Pools, Per-Vault PnL, and Oracle Design"** (whiteboard-style with Mermaid diagrams)

**GitHub:**

- Publish architecture decision record as public discussion

---

## Week 6 -- "Regulation as Competitive Advantage" (Pillar: P5 Regulatory)

**Blog:**

- **"This Is Not a Generic DeFi App: Why We're Taking an EU-First Regulatory Approach"**
  - Source: `docs/REGULATORY_ROADMAP_DRAFT.md`
  - Hook type: Contrarian
  - Opens with "This repo is not a generic DeFi app" (direct quote from doc)
  - Covers: MiCA vs MiFID/AIF distinction, the "closed marketplace is not unregulated" insight, Phase 0-5 roadmap

**Substack:**

- Issue 6: **"Compliance Is a Feature, Not a Tax: What We Learned Mapping Our Regulatory Perimeter"**
  - Investor-facing narrative. How regulatory clarity de-risks the investment.

**X Threads:**

- Mon thread: **"Most DeFi protocols treat regulation as an afterthought. We mapped our entire regulatory perimeter before writing the first blog post. Here's what we found."**
  - Hook type: Contrarian. 8 tweets. Phase-by-phase overview.
- Wed thread: **"'Closed marketplace' does not mean unregulated. 'Non-custodial' does not mean no AML. 'Utility token' does not mean no securities law. Five things DeFi builders get wrong about compliance."**
  - Hook type: Stakes. 6 tweets.

**X Standalone Tweets (Tue/Thu/Fri):**

- Tue: "If you can't explain your product to a regulator in one sentence, institutions won't touch it. Ours: 'Basket vaults that accept USDC, issue shares, and redeem from reserves.'"
- Thu: Quote-tweet MiCA/regulatory news with IndexFlow positioning
- Fri: Dev update

**LinkedIn:**

- Post 1: **"Our Regulatory Roadmap for Structured DeFi Products in the EU: Phase 0 Through Launch"**
- Post 2: **"Why MiCA Clarity Is Bullish for Compliant DeFi Infrastructure Builders"**
  - THIS IS THE LINKEDIN WEEK -- regulatory content outperforms all other pillars on LinkedIn

**Farcaster:**

- **"Contrarian take for /defi: the protocols that map their regulatory perimeter early will outperform the ones that move fast and figure it out later. Here's why."**

---

## Week 7 -- "The Economics" (Pillar: P6 Tokenomics + P4 Building in Public)

**Blog:**

- **"How IndexFlow Makes Money: Funding Rates, Fee Architecture, and the Backstop Thesis"**
  - Source: `docs/UTILITY_TOKEN_TOKENOMICS.md` + `docs/PERP_RISK_MATH.md`
  - Hook type: Data
  - Covers fee flow, funding rate mechanics, backstop staking model, "seed liquidity first, emit later" philosophy

**Substack:**

- Issue 7: **"Token Design Philosophy: Why We're Deferring the Token Until the Product Works"**
  - Narrative on "not token-first" approach. Honest about what's draft vs committed.

**X Threads:**

- Mon thread: **"Funding rates in IndexFlow aren't just a fee. They're an oracle-anchored balancing mechanism that keeps the shared pool solvent. Here's the math."**
  - Hook type: Data. 8 tweets with worked examples.
- Wed thread: **"Most protocols launch a token and figure out utility later. We wrote the tokenomics doc, then decided to defer the token. Here's why."**
  - Hook type: Personal story / contrarian. 7 tweets.

**X Standalone Tweets (Tue/Thu/Fri):**

- Tue: "Seed liquidity first, emit later. The token is not required for initial usage. It becomes the coordination layer after the system is working."
- Thu: [IMAGE: fee flow diagram] "Where the money goes: deposit fees, redemption fees, trading fees, funding rates. Every path documented."
- Fri: "5x leverage. +10% price move. +50% return on collateral. -10% price move. -50% loss on collateral. The math is simple. The risk management isn't." [IMAGE: worked example from PERP_RISK_MATH.md]

**LinkedIn:**

- **"Unit Economics of On-Chain Basket Infrastructure: How Structured DeFi Products Generate Revenue"**

**Farcaster:**

- **"Real yield from protocol fees + insurance backstop staking. Not ponzi emissions. The question isn't 'what's the APY' -- it's 'what's the fee base and loss surface.'"**

**YouTube:**

- Video 3: **"IndexFlow Fee Flow Explained: Where the Money Goes"** (short animated or whiteboard)

---

## Week 8 -- "The Vision" (Pillar: P4 Building in Public + P2 Thesis)

**Blog:**

- **"What We Learned Forking GMX v1: Every Architecture Decision We Made and Why"**
  - Source: build experience, `docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md` GMX fork section, `docs/AGENTS_FRAMEWORK.md`
  - Hook type: Personal Story
  - Engineering retrospective with honest decisions (what was kept, changed, added)

**Substack:**

- Issue 8: **"Month 2 Investor Update: Traction, Pipeline, Roadmap to Mainnet"**
  - Second monthly update. Metrics growth, content traction, pipeline, what Q3 looks like.

**X Threads:**

- Mon thread: **"We forked GMX v1 and built structured basket vaults on top. Here's every decision we made, what we kept, what we changed, and what we'd do differently."**
  - Hook type: Personal story. 10 tweets. Engineering retrospective.
- Wed thread: **"Our vaults are managed by AI agents that research markets, allocate capital, and open perp positions autonomously. Here's how the agent framework works."**
  - Hook type: Insider knowledge. 8 tweets. Source: `docs/AGENTS_FRAMEWORK.md`
- Fri thread: **"In 2 years, every L2 will need basket infrastructure. Not another perp DEX. Not another yield vault. Structured exposure with attribution. Here's the thesis."**
  - Hook type: Stakes / vision. 7 tweets. Closing vision thread.

**X Standalone Tweets (Tue/Thu):**

- Tue: "8 weeks of building in public. 8 blog posts. 8 Substack issues. 16+ threads. Here are the 5 most important ideas." (recap + links)
- Thu: "A chain doesn't need to underwrite a global pool with unclear spillovers. It can support a specific deployment, observe its metrics, and scale support according to results. That's chain-specific attribution."

**LinkedIn:**

- Post 1: **"What Building DeFi Infrastructure Taught Me About Product-Market Fit"** (founder reflection)
- Post 2: **"Our Thesis: Structured DeFi Becomes a Chain-Level Primitive"** (chain partnership pitch)

**Farcaster:**

- **"We define vault operators as markdown files. System prompt = strategy. MCP tools = on-chain actions. Memory = state.json. Agents research, allocate, and trade through the same API a human would. Here's the repo."**

**YouTube:**

- Video 4: **"AI Agents Managing DeFi Vaults: A Live Demo"** (the agent framework is a differentiator nobody else has)

---

## Key Phrases to Reuse Across Content

These are IndexFlow's canonical lines, drawn from the whitepaper and primer. Use where natural:

- "Portfolio value and exit liquidity are not the same thing."
- "Reserve depth is a product-quality parameter, not a treasury setting."
- "Many baskets, one trading engine."
- "NAV does not mean redeemable liquidity."
- "Seed liquidity first, emit later."
- "Structured exposure infrastructure."
- "No cross-chain dilution of results."
- "The novelty is not a new primitive. It is the architectural synthesis."
- "This is not a generic DeFi app."

---

## Podcast Outreach Targets

Start outreach in Week 3, aim for appearances in Weeks 5-8:

| Podcast | Angle |
| ------- | ----- |
| Bankless | Structured products, institutional DeFi |
| Bell Curve | Technical DeFi infrastructure, mechanism design |
| The Defiant | Institutional DeFi narrative, regulatory approach |
| Empire (Blockworks) | Market thesis, competitive landscape |
| Epicenter | Technical architecture, shared liquidity |
| Uncommon Core | Mechanism design, funding rates |
| Smaller/mid-tier pods | Higher acceptance rate, good for early reps |
