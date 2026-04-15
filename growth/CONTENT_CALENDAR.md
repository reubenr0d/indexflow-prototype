# Content Calendar -- Rolling Layer-Tagged Plan

## How to Use This Calendar

Content is organized by **funnel layer**, not by week number. Each piece is tagged with a layer, content pillar, channel, and audience temperature. Pick from the backlog based on what the funnel needs this week.

**Tag format:** `[Layer N | Pillar | Channel | Temperature]`

- **Layer**: 1 (Generate), 2 (Capture), 3 (Manage), 4 (Close)
- **Pillar**: P1-P6 (see `README.md`)
- **Channel**: LinkedIn, Blog, X, Substack, Podcast, YouTube, Farcaster
- **Temperature**: Cold (never heard of us), Warm (engaged but not ready), Hot (evaluating)

## Framing Principles

- **60/30/10 rule**: 60% educational/thought leadership, 30% project updates, 10% promotional
- **Hook-first**: Every piece opens with a hook (see `templates/tweet-thread.md` for the six types) -- never "Here are my thoughts on..."
- **Educate before you pitch**: 80% education, 20% IndexFlow across all content
- **Brand voice**: Institutional DeFi infrastructure tone -- precise, systems-language, confident. "Smart colleague at a conference."
- **Core memeable distinction**: "Portfolio value and exit liquidity are not the same thing."

## Content Inventory Target (per month)


| Type                | Count | Cadence         |
| ------------------- | ----- | --------------- |
| Blog posts          | 8     | 2/week          |
| LinkedIn posts      | 12-20 | 3-5/week        |
| X threads           | 8-12  | 2-3/week        |
| X standalone tweets | 12    | 3/week          |
| Substack issues     | 4     | 1/week          |
| YouTube videos      | 2     | 1 every 2 weeks |
| Podcast pitches     | 3-5   | Ongoing         |
| Farcaster casts     | 4-8   | 1-2/week        |


---

## Layer 1: Generate (Cold Audience)

Goal: make asset managers aware IndexFlow exists and associate it with structured DeFi infrastructure.

### Blog

**"On-Chain Structured Products Are Broken. Here's What Nobody Is Building."**
`[L1 | P2 Thesis | Blog | Cold]`

- Source: `docs/WHITEPAPER_DRAFT.md` problem statement + primer
- Hook type: Contrarian
- Core argument: three gaps (mercenary TVL, opaque redemption, fragmented capital) prevent institutions from getting durable exposure

**"Five Waves of On-Chain Exposure: From Set Protocol to Structured Infrastructure"**
`[L1 | P2 Thesis | Blog | Cold]`

- Source: `docs/WHITEPAPER_DRAFT.md` competitive waves section
- Hook type: Insider Knowledge
- Wave 1 (wrappers) → Wave 2 (shared perps) → Wave 3 (execution venues) → Wave 4 (manager infra) → Wave 5 (IndexFlow = synthesis)

**"NAV Is Not Exit Liquidity: The Design Constraint Every Vault Protocol Ignores"**
`[L1 | P1 Education | Blog | Cold]`

- Source: `docs/WHITEPAPER_DRAFT.md` (NAV vs redeemable), `docs/SHARE_PRICE_AND_OPERATIONS.md`
- Hook type: Contrarian
- The "signature idea" post -- defines IndexFlow's intellectual contribution

**"How Much Can a Vault Operator Earn? The Unit Economics of Onchain Basket Infrastructure"**
`[L1 | P6 Economics | Blog | Cold]`

- Source: `docs/UTILITY_TOKEN_TOKENOMICS.md`, fee model docs
- Hook type: Data
- Worked example: $5M AUM, 50bps fees, projected annual revenue

**"This Is Not a Generic DeFi App: How We're Navigating Regulation as a Permissionless Protocol"**
`[L1 | P5 Regulatory | Blog | Cold]`

- Source: `docs/REGULATORY_ROADMAP_DRAFT.md`
- Hook type: Contrarian
- Permissionless protocol model, Foundation/Labs/Frontend separation, progressive decentralization, frontend compliance (geo-blocking, OFAC screening)

**"Many Baskets, One Engine: How IndexFlow's Shared Perpetual Liquidity Pool Works"**
`[L1 | P3 Technical | Blog | Cold]`

- Source: `docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md`
- Hook type: Curiosity Gap
- Shared pool mechanics, per-vault PnL attribution

**"Cross-Chain Liquidity Routing Without Bridges: How TWAP + CCIP Replaces Manual Chain Selection"**
`[L1 | P3 Technical | Blog | Cold]`

- Source: `docs/CROSS_CHAIN_COORDINATION.md`, `src/coordination/PoolReserveRegistry.sol`
- Hook type: Contrarian
- Core argument: most multi-chain DeFi forces the user to pick a chain. IndexFlow reads GMX pool depth on every chain via TWAP, syncs state via Chainlink CCIP, and routes deposits proportionally -- user never touches a chain picker
- Technical breakdown: TWAP accumulator, delta-triggered broadcasts, proportional weight routing, escrow safety rails
- **Priority: HIGH** -- first deep technical post on the coordination layer

**"Why We Split One Smart Contract Into Six: Designing Upgradeable Cross-Chain Infrastructure"**
`[L1 | P3 Technical | Blog | Cold]`

- Source: `docs/CROSS_CHAIN_COORDINATION.md`, `src/coordination/`
- Hook type: Insider Knowledge
- PoolReserveRegistry / CCIPReserveMessenger / IntentRouter / CrossChainIntentBridge / OracleConfigBroadcaster / OracleConfigReceiver -- why each exists as a separate contract, how the split addresses contract size limits, upgradeability for user-fund-holding contracts (UUPS), and stateless relays

**"Intent-Based Routing for DeFi Deposits: Escrow, Keepers, and Proportional Flow"**
`[L1 | P3 Technical | Blog | Cold]`

- Source: `docs/CROSS_CHAIN_COORDINATION.md`, `src/coordination/IntentRouter.sol`
- Hook type: Curiosity Gap
- Intent lifecycle (submit → pending → execute/refund), escrow safety with automatic refund, keeper whitelist for basket selection, MEV protection via submitAndExecute, fee and griefing protection

**"Oracle Consistency Across Chains: How One Canonical Source Prevents NAV Drift"**
`[L1 | P3 Technical | Blog | Cold]`

- Source: `src/perp/OracleAdapter.sol`, `src/coordination/OracleConfigBroadcaster.sol`
- Hook type: Data
- Problem: each chain has its own OracleAdapter, nothing prevents config drift. Solution: canonical chain broadcasts via CCIP, remote adapters locked to receiver, configHash for defense-in-depth

**"From USDC to Basket Exposure in One Transaction: The Vault Lifecycle"**
`[L1 | P1 Education | Blog | Cold]`

- Source: `docs/INVESTOR_FLOW.md`
- Hook type: Curiosity Gap
- Deposit → mint → allocate → track → redeem

**"What Running a DeFi Vault Actually Looks Like: A Day in the Life of a Curator"**
`[L1 | P4 Operator | Blog | Cold]`

- Source: `docs/ASSET_MANAGER_FLOW.md`
- Hook type: Personal Story
- Reserve checks, position reviews, allocation decisions, fee collection

**"How Progressive Decentralization Actually Works: 4 Stages with Entry Criteria"**
`[L1 | P3+P5 Technical/Regulatory | Blog | Cold]`

- Source: `docs/REGULATORY_ROADMAP_DRAFT.md` progressive decentralization sequence
- Hook type: Insider Knowledge
- Centralized launch → council governance → token-assisted → full protocol governance, each with explicit entry criteria (30/60/90+ days stable)

**"Foundation, Labs, Frontend: Why Permissionless DeFi Protocols Need Three Entities"**
`[L1 | P5 Regulatory | Blog | Cold]`

- Source: `docs/REGULATORY_ROADMAP_DRAFT.md` foundation structure section
- Hook type: Contrarian
- Entity chart, IP flow, why separation protects both the protocol and the operators building on it

### LinkedIn

**"Why Institutional-Grade Basket Infrastructure Doesn't Exist On-Chain Yet"**
`[L1 | P2 Thesis | LinkedIn | Cold]`

- Professional reframe of the problem statement for fund managers

**"The Five Waves of On-Chain Exposure Products"**
`[L1 | P2 Thesis | LinkedIn | Cold]`

- Carousel format: one slide per wave, last slide = IndexFlow positioning

**"Why Every Institutional Investor Should Ask One Question: What's My Actual Redemption Headroom?"**
`[L1 | P1 Education | LinkedIn | Cold]`

- NAV vs redeemable insight written for fund allocators

**"Our Regulatory Roadmap: Permissionless Protocol, Foundation Structure, Progressive Decentralization"**
`[L1 | P5 Regulatory | LinkedIn | Cold]`

- Regulatory content outperforms all other pillars on LinkedIn
- Angle: how the Foundation/Labs/Frontend separation and staged governance transition de-risk building on IndexFlow

**"Unit Economics of On-Chain Basket Infrastructure: How Vault Operators Generate Revenue"**
`[L1 | P6 Economics | LinkedIn | Cold]`

- Fee model breakdown for fintech/fund manager audience

**"Cross-Chain Liquidity Routing Is the Infrastructure Problem Nobody Talks About"**
`[L1 | P3 Technical | LinkedIn | Cold]`

- Professional reframe of the coordination layer for institutional operators
- Angle: if you're building structured products across multiple chains, fragmented liquidity routing is a reliability and capital-efficiency problem -- not just a UX problem
- How IndexFlow's GMX pool-depth TWAP + CCIP messaging + intent-based routing solves this without trusting users to pick the right chain

**"We Built an On-Chain Coordination Layer So Users Never Have to Pick a Chain"**
`[L1 | P3 Technical | LinkedIn | Cold]`

- Building-in-public style post announcing the cross-chain coordination layer
- Walk through the architectural decision: why read GMX pool depth instead of TVL, why TWAP instead of spot, why proportional routing instead of winner-take-all

**"Why MiCA Clarity Is Bullish for Compliant DeFi Infrastructure"**
`[L1 | P5 Regulatory | LinkedIn | Cold]`

- Market commentary angle: MiCA is pushing the industry toward the kind of structural clarity IndexFlow's permissionless model already provides
- IndexFlow is not MiCA-regulated; the post positions the permissionless protocol model as ahead of the regulatory curve

### X Threads

**"$200B in structured product demand has no on-chain home. Here's why."**
`[L1 | P2 Thesis | X | Cold]`

- Hook type: Data. 7-8 tweets. Source: whitepaper market thesis.

**"Every DeFi vault protocol makes the same mistake. They treat TVL as exit liquidity."**
`[L1 | P1 Education | X | Cold]`

- Hook type: Contrarian. 5-6 tweets. Source: whitepaper NAV vs redeemable.

**"We studied every on-chain basket and index protocol. Here's what they all got wrong -- and what they got right."**
`[L1 | P2 Thesis | X | Cold]`

- Hook type: Insider knowledge. 9 tweets. Wave-by-wave breakdown.

**"Your vault says it's worth $10M. But can you actually withdraw $10M right now?"**
`[L1 | P1 Education | X | Cold]`

- Hook type: Stakes. 8 tweets. The signature thread.

**"Most DeFi protocols treat regulation as an afterthought. We mapped our entire regulatory perimeter before writing the first blog post."**
`[L1 | P5 Regulatory | X | Cold]`

- Hook type: Contrarian. 8 tweets.

**"Every multi-chain DeFi app makes you pick the chain. We deleted the chain picker."**
`[L1 | P3 Technical | X | Cold]`

- Hook type: Contrarian. 8-10 tweets.
- 1: Hook. 2: Why chain selection is bad UX. 3: GMX pool depth as signal. 4: TWAP smoothing. 5: CCIP sync. 6: Proportional routing. 7: Privy smart wallets = same address everywhere. 8: IntentRouter escrow + refund. 9: Summary. 10: CTA.
- Source: `docs/CROSS_CHAIN_COORDINATION.md`

**"We built 6 contracts to replace 'pick a chain'. Here's the architecture."**
`[L1 | P3 Technical | X | Cold]`

- Hook type: Insider Knowledge. 9 tweets.
- Contract-by-contract walkthrough: PoolReserveRegistry, CCIPReserveMessenger, IntentRouter, CrossChainIntentBridge, OracleConfigBroadcaster, OracleConfigReceiver.
- Source: `src/coordination/`

**"Your DeFi app says it's multi-chain. But do all chains agree on the same oracle parameters?"**
`[L1 | P3 Technical | X | Cold]`

- Hook type: Stakes. 6 tweets.
- Oracle config drift problem, canonical broadcast solution, configHash integrity check, hasBrokenFeeds fallback.
- Source: `src/perp/OracleAdapter.sol`, `docs/CROSS_CHAIN_COORDINATION.md`

**"'Decentralize later' is what every protocol says. Here's our 4-stage plan with explicit entry criteria."**
`[L1 | P3+P5 Technical/Regulatory | X | Cold]`

- Hook type: Insider Knowledge. 7-8 tweets. Source: regulatory roadmap progressive decentralization stages.
- Stage 0 (centralized launch) → Stage 1 (council + timelock) → Stage 2 (token-assisted) → Stage 3 (full governance). Each stage has entry criteria and explicit timelines.

### Substack

**"Why We Started IndexFlow (And What We're Actually Building)"**
`[L1 | P2 Thesis | Substack | Cold]`

- Founder letter. Personal narrative on seeing the gap.

### Podcast Targets


| Show                    | Angle                                             | Pillar |
| ----------------------- | ------------------------------------------------- | ------ |
| Bankless                | Structured products, institutional DeFi           | P2     |
| Bell Curve              | Technical DeFi infrastructure, mechanism design   | P3     |
| The Defiant             | Institutional DeFi narrative, regulatory approach | P5     |
| Empire (Blockworks)     | Market thesis, competitive landscape              | P2     |
| Epicenter               | Technical architecture, shared liquidity          | P3     |
| Uncommon Core           | Mechanism design, funding rates                   | P3     |
| Non-crypto fintech pods | Asset management infra, tokenized funds           | P6     |


---

## Layer 2: Capture (Cold → Warm)

Goal: convert visitors who are not ready for a call into leads with an email address and a reason to come back.

### Testnet Access (Product-Led Capture)

`[L2 | P1+P4 | Testnet | Cold→Warm]`

The live testnet is the primary Layer 2 capture mechanism. Open exploration is ungated; operator-level actions gate behind email capture.

- **Open exploration** -- browse existing baskets, view live oracle prices, read docs. No gate.
- **Guided pilot pathway** -- structured walkthrough: create a vault, set assets, allocate to perp, open a position. Gated behind email capture at vault creation.
- **Operator waitlist** -- asset managers who want to run a vault on mainnet register interest for early access.

### Lead Magnets

**"The Asset Manager's Playbook for Onchain Basket Infrastructure"**
`[L2 | P1 Education | Blog/LinkedIn | Cold→Warm]`

- Gated PDF distilling whitepaper + `docs/ASSET_MANAGER_FLOW.md`
- Promoted via LinkedIn posts and blog CTAs

**"From TradFi Funds to DeFi Vaults: What Changes and What Doesn't"**
`[L2 | P4 Operator | Blog/LinkedIn | Cold→Warm]`

- Comparison guide for traditional asset managers

### VSL Script Outline

`[L2 | P1+P6 | Landing Page | Cold→Warm]`

1. **Hook** (0:00-0:30): "Your vault says $10M. Can you withdraw $10M?"
2. **Problem** (0:30-2:00): fragmented liquidity, opaque redemption, no attribution
3. **Solution** (2:00-4:00): IndexFlow vault lifecycle walkthrough
4. **Economics** (4:00-6:00): fee model, reserve design, operator revenue
5. **Proof** (6:00-7:00): testnet demo, architecture credibility
6. **CTA** (7:00-7:30): book a walkthrough or try the testnet

---

## Layer 3: Manage (Warm Audience)

Goal: keep captured leads in orbit until they are ready to buy.

### Email Sequences

**Welcome Sequence** (all new captures)
`[L3 | P1 Education | Email | Warm]`

- Immediate: deliver requested resource
- Day 3: "How IndexFlow's NAV mechanism works differently"
- Day 7: "What a vault operator's typical session looks like" (from `docs/ASSET_MANAGER_FLOW.md`)

**Testnet Pilot Follow-Up** (created a vault on testnet)
`[L3 | P6 Economics | Email | Warm]`

- Day 1: "Here's how top operators set their fee policy" + best practices from `docs/ASSET_MANAGER_FLOW.md`
- Day 4: "Reserve management: the balancing act every vault operator faces"
- Day 8: "Book a walkthrough to model your specific use case"

**Playbook Follow-Up** (downloaded playbook)
`[L3 | P5 Regulatory | Email | Warm]`

- Day 1: "How IndexFlow handles custody -- and how it doesn't"
- Day 4: "Our regulatory roadmap: permissionless protocol with clear legal structure"
- Day 8: Case study or pilot announcement

**High-Intent Follow-Up** (watched VSL past 60% or visited pricing twice)
`[L3 | P4 Operator | Email | Hot]`

- Immediate: personal email from team + calendar link
- Day 2: "Here's what a pilot looks like" + testnet walkthrough offer

**Incomplete Application Follow-Up**
`[L3 | P1 Education | Email | Hot]`

- 30 minutes: direct link to complete + reminder
- Day 1: trust-building resource (architecture overview or regulatory doc)

### Substack: "The Vault Operator's Edge"

Weekly issues for warm leads. Sample topics:

**"Reserve Design Patterns: How Much Idle USDC Is Enough?"**
`[L3 | P4 Operator | Substack | Warm]`

- Source: `docs/ASSET_MANAGER_FLOW.md` reserve management section

**"What MiCA Means for Your Onchain Fund Product"**
`[L3 | P5 Regulatory | Substack | Warm]`

- Source: `docs/REGULATORY_ROADMAP_DRAFT.md`
- Angle: MiCA's relevance to operators building onchain structured products -- not about IndexFlow's own compliance posture (IndexFlow uses a permissionless protocol model)

**"Fee Architecture Comparison: IndexFlow vs Enzyme vs Sommelier"**
`[L3 | P6 Economics | Substack | Warm]`

- Competitive positioning through education

**"The Regulated Access Tier: How Permissionless Protocols Can Serve Institutional Clients"**
`[L3 | P5+P4 Regulatory/Operator | Substack | Warm]`

- Source: `docs/REGULATORY_ROADMAP_DRAFT.md` Phase 6 (regulated access tier)
- How a separately licensed subsidiary can offer KYC/KYB onboarding, compliant product issuance, and regulatory reporting on top of the same permissionless contracts
- Key distinction: the protocol stays permissionless; the regulated tier is a service layer, not a gatekeeper

**"The Funding Rate Mechanism That Keeps the Shared Pool Solvent"**
`[L3 | P3 Technical | Substack | Warm]`

- Source: `docs/PERP_RISK_MATH.md`

**"Inside IndexFlow's Cross-Chain Coordination Layer: TWAP, CCIP, and Intent-Based Routing"**
`[L3 | P3 Technical | Substack | Warm]`

- Source: `docs/CROSS_CHAIN_COORDINATION.md`, `src/coordination/`
- Deep-dive for technical operators: TWAP accumulator math, delta-triggered state sync cost model, intent lifecycle and escrow safety, oracle config broadcast mechanism, proportional routing weight formula
- Include code snippets from contracts

### YouTube

**"IndexFlow in 60 Seconds: Deposit to Redemption on Testnet"**
`[L3 | P1 Education | YouTube | Warm]`

- Screen recording walkthrough

**"IndexFlow Architecture in 5 Minutes: Shared Pools, Per-Vault PnL, and Oracle Design"**
`[L3 | P3 Technical | YouTube | Warm]`

- Whiteboard-style with Mermaid diagrams

**"Cross-Chain Coordination Layer Architecture Walkthrough"**
`[L3 | P3 Technical | YouTube | Warm]`

- Whiteboard-style video: PoolReserveRegistry → CCIPReserveMessenger → IntentRouter → CrossChainIntentBridge, with data flow arrows and CCIP message format
- Walk through a deposit that gets routed cross-chain: submit intent → escrow USDC → select chain by weight → CCIP bridge → mint shares on destination

**"AI Agents Managing DeFi Vaults: A Live Demo"**
`[L3 | P4 Operator | YouTube | Warm]`

- Agent framework differentiator

---

## Layer 4: Close (Hot Audience)

Goal: convert high-intent leads into pilots and partnerships.

### Content for Hot Leads

**"What a Pilot Looks Like: Your Own Vault on Testnet in 30 Minutes"**
`[L4 | P4 Operator | Email/Direct | Hot]`

- Sent directly to Tier 1 leads after qualification

**"IndexFlow vs Building Your Own: The Build-vs-Buy Analysis"**
`[L4 | P2 Thesis | Email/Direct | Hot]`

- For asset managers evaluating whether to build in-house

### Call Prep Materials

- One-pager distilled from whitepaper (problem, solution, economics, next steps)
- Testnet walkthrough guide for pilot onboarding
- `docs/ASSET_MANAGER_FLOW.md` as operational reference

---

## VC Content Track (Parallel)

Content that serves both the asset manager growth engine and the VC fundraise pipeline. See [VC_OUTREACH_PLAYBOOK.md](VC_OUTREACH_PLAYBOOK.md) for the full automated pipeline.

### Double-Duty Content

These pieces build credibility with asset managers AND warm VCs:

**Monthly Investor Update Email**
`[VC | All Pillars | Email | Warm VCs]`

- Metrics, milestones, pipeline, burn, what's next
- Sent to all VCs who have engaged (opened deck, replied, took a call)

**Substack: Market Thesis Issues**
`[L1+VC | P2 Thesis | Substack | Cold/Warm]`

- "Why structured DeFi infrastructure is the next $10B category"
- These naturally circulate in VC circles when shared

**LinkedIn: Founder Building-in-Public**
`[L1+VC | P4 Operator | LinkedIn | Cold/Warm]`

- Traction milestones, market thesis takes
- Not "we're raising" -- signals momentum

**Deck Refresh Touchpoints**
`[VC | All Pillars | Email | Warm VCs]`

- Quarterly deck refresh with new metrics
- Re-send to warm VCs: "Updated deck -- we've added [X metric] since we last spoke"

---

## Key Phrases to Reuse Across Content

- "Portfolio value and exit liquidity are not the same thing."
- "Reserve depth is a product-quality parameter, not a treasury setting."
- "Many baskets, one trading engine."
- "NAV does not mean redeemable liquidity."
- "Seed liquidity first, emit later."
- "Structured exposure infrastructure."
- "The novelty is not a new primitive. It is the architectural synthesis."
- "This is not a generic DeFi app."
- "The user should never pick the chain. The protocol should."
- "Route by depth, not by default."
- "Six contracts, zero chain pickers."
- "TWAP the pool, sync the state, route the intent."

