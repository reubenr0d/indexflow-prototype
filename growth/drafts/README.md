# Drafts

Working drafts for content pieces live here. Move to published/archived status by prefixing `DONE-` when published.

## Naming Convention

```
YYYY-MM-DD-<type>-<slug>.md
```

**Types:**

| Type | Description |
| ---- | ----------- |
| `blog` | Blog post |
| `thread` | X (Twitter) thread |
| `tweet` | X (Twitter) standalone tweet (single-tweet variant of thread) |
| `substack` | Substack issue |
| `linkedin` | LinkedIn post |
| `farcaster` | Farcaster cast |
| `podcast-pitch` | Podcast outreach email |
| `youtube` | YouTube video script / outline |

**Examples:**

```
2026-04-21-blog-introducing-indexflow.md
2026-04-21-thread-basket-problem-defi.md
2026-04-22-substack-why-were-building.md
2026-04-23-linkedin-institutional-baskets.md
2026-04-24-farcaster-testnet-launch.md
2026-04-25-podcast-pitch-bankless.md
DONE-2026-04-21-blog-introducing-indexflow.md
```

## Workflow

1. Copy the relevant template from `growth/templates/`
2. Rename using the convention above
3. Draft in this folder
4. Review and publish
5. Prefix with `DONE-` after publishing (or delete if no longer needed)

## X Content Calendar workflow

During an X-channel campaign season (currently Season 1 — Operator Trials, Mon May 25 → Sun Jun 21, 2026), the active schedule lives at [`growth/X_CONTENT_CALENDAR.md`](../X_CONTENT_CALENDAR.md). It is the canonical source for what posts on what date.

The model is **seeded drafts**, not blank stubs:

- Every row in the calendar already has a corresponding draft file in this folder.
- Each draft contains a complete first pass — metadata, full thread or single-tweet body, suggested standalone extracts (for threads), `[IMAGE: …]` placeholders, a CTA line with `utm_source=x&utm_campaign=<slug>`, and brand-voice reminders.
- The drafts are intentionally postable as-is in a pinch. The expected workflow is a **10–15 minute pass per draft** to inject your voice, then post.

Per-row status moves through `seeded` → `polished` → `scheduled` → `posted`:

1. **`seeded`** — a complete first-pass draft exists at `draft_path`. Default state when the calendar lands.
2. **`polished`** — you've done the 10–15 minute voice pass. Post-ready.
3. **`scheduled`** — queued in the X composer (optional intermediate state).
4. **`posted`** — live on X. Fill in the `posted_url` column on the same edit so analytics can attribute downstream `BasketCreated` events back to the source post via `utm_source=x`.

Threads and standalones follow the templates in [`growth/templates/`](../templates/):

- Threads: [`growth/templates/tweet-thread.md`](../templates/tweet-thread.md) (7–10 tweets, hook + body + CTA).
- Standalones: [`growth/templates/tweet-standalone.md`](../templates/tweet-standalone.md) (single tweet, ≤280 chars, hook = whole tweet).

Naming for X-calendar drafts:

```
growth/drafts/YYYY-MM-DD-thread-<slug>.md
growth/drafts/YYYY-MM-DD-tweet-<slug>.md
growth/drafts/YYYY-MM-DD-spaces-<slug>.md   # for Spaces rundown notes
```

After publishing, prefix with `DONE-` per the convention above, and confirm the row in `X_CONTENT_CALENDAR.md` is marked `posted` with a non-empty `posted_url`.
