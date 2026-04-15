# IndexFlow Growth

Content strategy and marketing assets for the IndexFlow fundraise phase.

## Folder Structure

```
growth/
  README.md                 <- you are here
  CONTENT_CALENDAR.md       # 8-week calendar with per-week / per-channel detail
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

## Channel Strategy

| Priority | Channel     | Audience                     | Cadence           | Purpose                                      |
| -------- | ----------- | ---------------------------- | ----------------- | -------------------------------------------- |
| 1        | X (Twitter) | DeFi natives, VCs, CT        | 5-7 posts/week    | Daily presence, threads, engagement          |
| 2        | Substack    | Investors, serious followers | 1/week            | Deep updates, investor narrative             |
| 3        | Blog        | All audiences (SEO)          | 2/month           | Pillar content, thought leadership           |
| 4        | LinkedIn    | Institutional, fund mgrs, BD | 2-3 posts/week   | Professional credibility, partner outreach   |
| 5        | Farcaster   | Crypto-native builders, VCs  | 3-5 casts/week   | High-signal DeFi discourse, VC deal flow     |
| 6        | Telegram    | Community, whitepaper access | As needed         | Gated content, community updates             |
| 7        | YouTube     | All                          | 2/month           | Protocol demos, architecture explainers      |
| 8        | Podcast     | DeFi audience                | 1-2 guests/month | Earned media, founder authority              |
| 9        | GitHub      | Devs, technical VCs          | Ongoing           | Building-in-public signals                   |

## Content Pillars

Every piece of content maps to one of these pillars:

- **P1 -- Protocol Education**: What IndexFlow is, how basket vaults work, the NAV mechanism
- **P2 -- Market Thesis**: Why structured DeFi now, competitive landscape, institutional demand
- **P3 -- Technical Credibility**: Architecture deep dives, security posture, oracle design
- **P4 -- Building in Public**: Testnet progress, milestones, dev updates
- **P5 -- Regulatory Awareness**: Compliance thinking, EU-first approach
- **P6 -- Tokenomics and Economics**: Token design, funding rate mechanics, fee structure

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
- "No cross-chain dilution of results."
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
  +---> Farcaster cast (1-2 punchy casts with the core take)
  +---> Substack mention/link (weave into weekly issue)
  +---> Telegram pin (share with community)
  +---> YouTube script seed (for the 2/month videos)
```

## Source Material

Existing docs to repurpose (relative to repo root):

| Source Doc | Content Potential |
| ---------- | ----------------- |
| `docs/WHITEPAPER_DRAFT.md` | 5-8 blog posts, 15+ tweet threads, 3+ Substack issues |
| `docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md` | 3-4 technical blog posts, YouTube explainer |
| `docs/UTILITY_TOKEN_TOKENOMICS.md` | 1 blog post, 2 tweet threads, Substack deep dive |
| `docs/REGULATORY_ROADMAP_DRAFT.md` | 1 blog post, LinkedIn thought leadership series |
| `docs/INVESTOR_FLOW.md` | Demo video, tweet thread |
| `docs/PERP_RISK_MATH.md` | Technical credibility thread |
| `docs/SHARE_PRICE_AND_OPERATIONS.md` | NAV explainer content |
| Landing page primer sections | Screenshot-based social posts |
| Pitch deck | Slide-by-slide LinkedIn/X content |

## Podcast Outreach Targets

Start outreach in Week 3, aim for appearances in Weeks 5-8:

| Podcast | Angle |
| ------- | ----- |
| Bankless | Structured products |
| Bell Curve | Technical DeFi infrastructure |
| The Defiant | Institutional DeFi narrative |
| Empire (Blockworks) | Market thesis |
| Epicenter | Technical architecture |
| Uncommon Core | Mechanism design / funding rates |
| Smaller/mid-tier pods | Higher acceptance rate, good for early reps |

## Using Cursor for Content Production

You can use Cursor to help produce content from existing assets:

- Extract tweet threads from any doc in `docs/`
- Draft blog posts by combining and reframing existing technical docs
- Generate LinkedIn-appropriate rewrites of X threads
- Create Substack issue outlines from weekly changelog entries
- Draft podcast pitch emails using the whitepaper as source material
