# IndexFlow Growth

Growth engine for IndexFlow, structured around a 4-layer funnel targeting a single ICP: **asset managers, fintech firms, institutional issuers, and RWA operators** -- people who will create and operate basket vaults on IndexFlow.

Chain partner outreach (grant committees, ecosystem funds, infrastructure pilots) is handled by **0xlabs** and is out of scope for this growth strategy. VC fundraise outreach runs as a parallel automated pipeline documented in [VC_OUTREACH_PLAYBOOK.md](VC_OUTREACH_PLAYBOOK.md).

## Folder Structure

```
growth/
  README.md                 <- you are here (strategy overview + 4-layer framework)
  CONTENT_CALENDAR.md       # Rolling content calendar tagged by layer/pillar/channel
  VC_OUTREACH_PLAYBOOK.md   # Automated VC pipeline (parallel fundraise track)
  templates/
    blog-post.md            # Blog post outline (1500-2500 words)
    tweet-thread.md         # X thread (5-7 tweet slots, hook/body/CTA)
    substack-issue.md       # Weekly Substack issue (intro/body/CTA)
    linkedin-post.md        # LinkedIn post (professional tone, 200-400 words)
    podcast-pitch.md        # Podcast outreach email
    farcaster-cast.md       # Farcaster cast (punchy, technical)
  drafts/
    README.md               # Naming conventions and workflow for drafts
    (working drafts go here)
```

---

## The 4-Layer Framework

Most B2B funnels only have two layers: generate leads (Layer 1) and close them (Layer 4). Everything between awareness and the sales call is a void. IndexFlow's growth engine fills the gap with four layers, each feeding the next.

```
Layer 1: GENERATE  ──>  Layer 2: CAPTURE  ──>  Layer 3: MANAGE  ──>  Layer 4: CLOSE
(Awareness)              (Catch them on         (Nurture until        (Fit conversation,
                          the way out)           ready to buy)         not a pitch)
```

---

## Layer 1: Lead Generation (Awareness)

Drive asset managers and institutional operators to encounter IndexFlow across multiple channels in a coordinated sequence.

### Channel Strategy

| Priority | Channel     | Audience                             | Cadence          | Purpose                                      |
| -------- | ----------- | ------------------------------------ | ---------------- | -------------------------------------------- |
| 1        | LinkedIn    | Fund managers, fintech execs, BD     | 3-5 posts/week   | Primary channel. Thought leadership, TLAs    |
| 2        | SEO / Blog  | Asset managers researching the space | 2 articles/week  | Long-tail programmatic content, mini-tools   |
| 3        | X (Twitter) | Institutional DeFi, CT              | 3-5 posts/week   | Thought leadership threads, market thesis    |
| 4        | Substack    | Warm leads, newsletter subscribers   | 1/week           | Deep narrative, vault operator insights      |
| 5        | Podcast     | Institutional/fintech audiences      | 1-2 guests/month | Earned media, founder credibility            |
| 6        | YouTube     | All                                  | 2/month          | Protocol demos, architecture explainers      |
| 7        | Farcaster   | Crypto-native operators              | 1-2 casts/week   | Maintain presence, not a growth driver       |
| 8        | GitHub      | Technical evaluators                 | Ongoing          | Building-in-public signals                   |
| 9        | Telegram    | Community, waitlist                  | As needed        | Gated content, community updates             |

### Outbound Motion

Use Clay or Apollo to build and enrich a target account list:
- Crypto fund managers and portfolio managers
- Fintech firms with AUM in tokenized assets
- RWA operators and issuers exploring onchain infrastructure
- Institutional DeFi teams evaluating vault infrastructure

Route enriched leads into tiered outbound sequences (LinkedIn + email) based on fit and intent signals.

### Coordinated Multi-Touch

When a LinkedIn post from the team generates engagement from asset manager profiles, boost it as a Thought Leader Ad targeting the same accounts the outbound pipeline is touching.

```
Monday:    Prospect sees a team member's LinkedIn post
Wednesday: Prospect receives a personalized outbound email
Friday:    Prospect sees a retargeted LinkedIn ad
```

By the time they visit the site, they have encountered IndexFlow 3-5 times across channels. Each touchpoint reinforces the others.

### SEO Strategy

Programmatic content targeting long-tail queries where asset managers research:
- "onchain structured products"
- "DeFi basket vaults for asset managers"
- "crypto portfolio infrastructure"
- "tokenized fund administration"
- "onchain NAV pricing"

Mini-tools (see Layer 2) serve as SEO magnets that rank for these queries and funnel traffic into capture mechanisms.

---

## Layer 2: Lead Capture

The biggest gap in most early-stage funnels. If the prospect is not ready for a call right now, you need a mechanism to catch them on the way out.

### Mechanism 1: Mini-Tools (SEO + Email Capture)

Build and host on the IndexFlow domain. Each tool gates full results behind an email capture. These also rank for long-tail SEO.

- **Basket Fee Calculator** -- input AUM, deposit/redeem volume, fee bps; output projected fee revenue as a vault operator.
- **Reserve Ratio Simulator** -- model redemption headroom under different allocation/PnL scenarios.
- **NAV vs Redeemable Liquidity Visualizer** -- interactive version of the core protocol insight, showing how allocation decisions affect exit liquidity.
- **Structured Product Compliance Checklist** -- MiCA/MiFID self-assessment for onchain structured products.

### Mechanism 2: Lead Magnets

Gated PDFs that provide practitioner-level value:

- **"The Asset Manager's Playbook for Onchain Basket Infrastructure"** -- distills the whitepaper and `docs/ASSET_MANAGER_FLOW.md` into a guide for operators evaluating the space.
- **"From TradFi Funds to DeFi Vaults: What Changes and What Doesn't"** -- comparison guide for traditional asset managers exploring onchain infrastructure.

### Mechanism 3: VSL (Video Sales Letter)

A 5-8 minute Wistia-hosted video on the landing page that walks an asset manager through:
1. The problem (fragmented liquidity, opaque redemption, no attribution)
2. The solution (IndexFlow vault lifecycle)
3. The economics (fee model, reserve design)
4. Next steps

Viewers who watch past 60% are flagged as high-intent and enter Layer 3 behavioral triggers.

### Mechanism 4: Smart Lead Routing

Single email input on the website. Backend enrichment (company size, AUM, role):
- **Qualified** (asset manager title + relevant firm) → show calendar immediately.
- **Not yet qualified** → route to educational nurture sequence.

One input field, zero friction, qualification happens automatically.

---

## Layer 3: Lead Management (Nurture)

Leads should never leave your world. They orbit in it until they are ready to buy.

### Email Nurture Sequences (Customer.io or similar)

**Welcome sequence** (triggered on any capture):
- Immediate: deliver the requested tool/resource within 1 minute.
- Day 3: "How IndexFlow's NAV mechanism works differently."
- Day 7: "What a vault operator's typical session looks like" (sourced from `docs/ASSET_MANAGER_FLOW.md`).

**Behavioral triggers:**
- Downloaded the playbook → sequence on custody model + regulatory approach.
- Used the fee calculator → sequence on unit economics + fee policy best practices.
- Watched VSL past 60% → direct outreach from team + calendar link.
- Visited pricing/docs page twice → "book a walkthrough" email within hours.
- Started application but did not complete → 30-min follow-up + next-day trust-building email.

### Newsletter: "The Vault Operator's Edge"

Weekly Substack reframed for people who manage capital:
- Reserve design patterns
- Regulatory developments affecting onchain structured products
- Fee architecture comparisons across DeFi vault protocols
- Market structure shifts relevant to institutional operators

Target: 40%+ open rate. Every issue teaches -- it never pitches.

### LinkedIn Content Nurture

Team posts consistently from personal accounts. Content maps to funnel position:

- **Top-of-funnel:** market thesis, contrarian takes on structured DeFi
- **Mid-funnel:** how vaults work, operational deep dives, regulatory clarity
- **Bottom-of-funnel:** case studies, pilot announcements, "book a walkthrough" CTAs

### Lead Scoring

Score leads in a CRM (Clay table or HubSpot):

| Signal | Weight |
| ------ | ------ |
| Title match (asset manager, portfolio manager, CIO, fintech founder) | High |
| Firm AUM or employee count | High |
| Content engagement depth (pages, visits, tool usage) | Medium |
| Email engagement (opens, clicks) | Medium |
| LinkedIn interaction with team posts | Medium |

**Tiered routing:**
- **Tier 1** (high fit + high intent): manual personalized outreach from founder/BD.
- **Tier 2** (good fit + moderate intent): multichannel automated sequence (email + LinkedIn).
- **Tier 3** (fit but low intent): automated email nurture only.

---

## Layer 4: Close

### Qualified Call

Not a pitch. A fit conversation. The VSL and nurture sequence already explained the product. The call explores:
- Their current fund structure
- What assets they want to basket
- Regulatory jurisdiction and compliance requirements
- Timeline and launch goals

### Custom Pilot Pathway

For qualified managers: a testnet pilot with their own vault, their asset selection, their fee structure. Hands-on experience before any commitment.

### Onboarding Pipeline

Post-close, structured onboarding using `docs/ASSET_MANAGER_FLOW.md` as the operational guide. From vault setup through first positions.

---

## Content Pillars

Every piece of content maps to one of these pillars:

- **P1 -- Vault Operator Education**: How basket vaults work from the operator's perspective -- lifecycle, NAV, reserves, fees.
- **P2 -- Market Thesis**: Why institutional-grade basket infrastructure matters now, from the asset manager's perspective.
- **P3 -- Technical Credibility**: Architecture deep dives, oracle design, security posture. Builds trust with sophisticated operators.
- **P4 -- Operator Stories**: How a vault session works, fee revenue modeling, reserve management decisions, operational patterns.
- **P5 -- Regulatory Clarity**: MiCA compliance as competitive advantage, the "closed marketplace" insight, how regulatory work de-risks the decision to build on IndexFlow.
- **P6 -- Unit Economics**: Fee model, funding rate mechanics, revenue projections for operators. Token design is secondary/deferred.

## Framing Principles

- **60/30/10 rule**: 60% educational/thought leadership, 30% project updates, 10% promotional
- **Hook-first**: Every piece opens with a hook (Data, Contrarian, Insider Knowledge, Curiosity Gap, Stakes, or Personal Story) -- see `templates/tweet-thread.md` for examples
- **Educate before you pitch**: 80% education, 20% IndexFlow across all content
- **Brand voice**: Institutional DeFi infrastructure tone -- precise, systems-language, confident. "Smart colleague at a conference." Not meme-y, not corporate.
- **Core memeable distinction**: "Portfolio value and exit liquidity are not the same thing."

## Key Phrases

Canonical lines drawn from the whitepaper and primer. Use across content where natural:

- "Portfolio value and exit liquidity are not the same thing."
- "Reserve depth is a product-quality parameter, not a treasury setting."
- "Many baskets, one trading engine."
- "NAV does not mean redeemable liquidity."
- "Seed liquidity first, emit later."
- "Structured exposure infrastructure."
- "The novelty is not a new primitive. It is the architectural synthesis."
- "This is not a generic DeFi app."

## Cross-Channel Workflow

Every piece of long-form content should be atomized:

```
Blog Post (1500-2500 words)
  |
  +---> X Thread (7-10 tweets extracting key insights)
  +---> 3-5 standalone tweets (one insight per tweet, spread across the week)
  +---> LinkedIn post (professional reframe, 1200-1600 chars)
  +---> Substack mention/link (weave into weekly issue)
  +---> YouTube script seed (for the 2/month videos)
  +---> Telegram pin (share with community)
```

---

## Source Material

Existing docs to repurpose (relative to repo root):

| Source Doc | Content Potential |
| ---------- | ----------------- |
| `docs/WHITEPAPER_DRAFT.md` | 5-8 blog posts, 15+ tweet threads, 3+ Substack issues |
| `docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md` | 3-4 technical blog posts, YouTube explainer |
| `docs/ASSET_MANAGER_FLOW.md` | Operator playbook content, VSL script, email sequences |
| `docs/REGULATORY_ROADMAP_DRAFT.md` | 1 blog post, LinkedIn thought leadership series |
| `docs/INVESTOR_FLOW.md` | Demo video, tweet thread |
| `docs/PERP_RISK_MATH.md` | Technical credibility thread |
| `docs/SHARE_PRICE_AND_OPERATIONS.md` | NAV explainer content |
| `docs/UTILITY_TOKEN_TOKENOMICS.md` | 1 blog post, 2 tweet threads |
| Landing page primer sections | Screenshot-based social posts |
| Pitch deck | Slide-by-slide LinkedIn/X content |

## Podcast Outreach Targets

| Podcast | Angle |
| ------- | ----- |
| Bankless | Structured products, institutional DeFi |
| Bell Curve | Technical DeFi infrastructure, mechanism design |
| The Defiant | Institutional DeFi narrative, regulatory approach |
| Empire (Blockworks) | Market thesis, competitive landscape |
| Epicenter | Technical architecture, shared liquidity |
| Uncommon Core | Mechanism design, funding rates |
| Non-crypto fintech pods | Asset management infrastructure, tokenized funds |
| Smaller/mid-tier pods | Higher acceptance rate, good for early reps |

## Using Cursor for Content Production

You can use Cursor to help produce content from existing assets:

- Extract tweet threads from any doc in `docs/`
- Draft blog posts by combining and reframing existing technical docs
- Generate LinkedIn-appropriate rewrites of X threads
- Create Substack issue outlines from weekly changelog entries
- Draft podcast pitch emails using the whitepaper as source material
- Draft email nurture sequences using `docs/ASSET_MANAGER_FLOW.md` as source
