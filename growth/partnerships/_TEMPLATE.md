<!--
Copy this file to `growth/partnerships/<partner-slug>.md`, then:
  1. Delete this comment block so the YAML frontmatter starts at line 1
     (any tooling that regenerates the README index expects `---` on line 1).
  2. Replace every `<placeholder>` value in the frontmatter and the
     markdown sections below.
  3. Append a row to the table in `growth/partnerships/README.md`.
  4. Link the partner from any active slot in `growth/X_CONTENT_CALENDAR.md`.
Keep the frontmatter shape (key order, indentation, scalar quoting) exactly
as below so the active-partner table can be regenerated from the files.
-->

---
partner: <Partner Name>
canonical_handle: "@<x_handle>"
status: <active | signed_mou | in_discussion | dormant>
# co_marketing: active = running; agreed = confirmed, execution pending;
#   pending_deploy = gated on deploy; not_confirmed = no counterpart confirmation yet
# funding_intros: none | offered (discussed, no intro yet) | intros_made
co_marketing: <active | agreed | pending_deploy | not_confirmed>
funding_intros: <none | offered | intros_made>
counterpart: <Name or "TBD"> (<Role or "TBD">)
indexflow_lead: <Name>
last_touch: <YYYY-MM-DD>
next_milestone: "<one-line milestone>"
next_milestone_date: <YYYY-MM-DD>
co_branded_surfaces:
  x_calendar: <slot date, e.g. 2026-06-04, or "N/A">
  galxe_quest: <quest slug, "TBD (Season 2 candidate)", or "N/A">
  boost_action: <action id, "TBD (Season 1 follow-up if budget permits)", or "N/A">
  ecosystem_grant: <not yet scoped | scoped | applied | in review | granted | declined>
guilds_touched: [<Curators | Allocators | Engineers | Educators | Cross-Chain Couriers>]
---

# <Partner Name>

## Why this partnership exists

<2-4 sentences on the strategic fit. Map the partner specifically to IndexFlow's product surface: basket vaults, the shared perp engine, the hub-and-spoke cross-chain coordination layer, the agent framework, and the permissionless protocol model. Be concrete — name the contract, the doc, or the operator surface the partner most directly touches, not just "L2 integration" or "AI compute".>

## Active campaigns

- <slot date> (<slot type, e.g. "Thu standalone" or "Fri thread">) — `growth/drafts/<YYYY-MM-DD>-<type>-<slug>.md`. <One line describing the slot's angle.> Co-tweet from `@<partner_handle>` quoting our slot with one line of partner context.

## Open requests on both sides

**From them:**

- <e.g. logo placement on the landing page, ecosystem grant application, technical integration scope, joint Spaces.>

**From us:**

- <e.g. co-tweet timing for the slot date, ecosystem fund pre-introduction, shared Galxe quest, joint Spaces.>

## Future surfaces (Season 2+)

- <e.g. joint Boost.xyz Action co-funding.>
- <e.g. dedicated Layer3 Activation post-Season-1.>
- <e.g. technical integration into `services/keeper/` or a new `apps/mcps/<partner>-<surface>/` server.>
- <e.g. joint Substack issue or YouTube video.>

## Historical thread / contact log

- <YYYY-MM-DD> — <touch description; reverse-chronological so the most recent touch is at the top.>
