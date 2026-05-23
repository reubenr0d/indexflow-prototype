# Partnerships

Active partnerships are tracked here as a first-class growth workstream alongside [`growth/CONTENT_CALENDAR.md`](../CONTENT_CALENDAR.md) and the date-slotted Season 1 schedule in `growth/X_CONTENT_CALENDAR.md`. Each partner has a markdown file with YAML frontmatter so the active-partner table below can be regenerated programmatically from the files. New partners use [`_TEMPLATE.md`](_TEMPLATE.md) as a starting point.

## Active partners

| partner | handle | status | guilds | next_milestone | next_milestone_date | x_calendar slot |
| ------- | ------ | ------ | ------ | -------------- | ------------------- | --------------- |
| [Secret Network](secret-network.md) | `@SecretNetwork` | active | Curators | Confirm @SecretNetwork co-tweet timing for Sat Jun 13 | 2026-06-10 | 2026-06-13 |
| [Mantle](mantle.md) | `@Mantle_Official` | active | Cross-Chain Couriers, Curators | Confirm @Mantle_Official co-tweet timing for Thu Jun 4; flag potential ecosystem grant track to user | 2026-06-01 | 2026-06-04 |
| [iExec](iexec.md) | `@iEx_ec` | active | Engineers | Confirm @iEx_ec co-tweet for Fri Jun 12; scope iApp confidential-compute PoC for an IndexFlow agent | 2026-06-09 | 2026-06-12 |
| [Nox](nox.md) | `@nox_TBD` (pending) | active | Engineers, Cross-Chain Couriers | Confirm Nox canonical X handle + co-tweet timing for Sun Jun 14 | 2026-06-11 | 2026-06-14 |

## Workflow

To add a new partner:

1. Copy [`_TEMPLATE.md`](_TEMPLATE.md) to `growth/partnerships/<partner-slug>.md`.
2. Fill in every `<placeholder>` value in the YAML frontmatter and the markdown sections.
3. Append a row to the **Active partners** table above, reading values directly from the new file's frontmatter (`partner`, `canonical_handle`, `status`, `guilds_touched`, `next_milestone`, `next_milestone_date`, `co_branded_surfaces.x_calendar`).
4. Wire the partner into any matching slot in `growth/X_CONTENT_CALENDAR.md` (and add a draft file under `growth/drafts/` if the slot does not have one yet).
5. Commit the new partner file, the updated `README.md` row, and any calendar wiring together so the index, the per-partner file, and the date-slotted schedule stay in lockstep.

When a partnership moves to dormant: ~~strikethrough~~ the row in the table but keep the file. Update the file's frontmatter `status` to `dormant` and append a final entry to the contact log explaining why the relationship is no longer active.

## Partnership × platform

Which platform surface each partner co-funds or co-tweets on. All four Season 1 partners are X co-tweet only; Galxe quests and Boost.xyz actions are recorded as Season 2 candidates so they do not drop when Season 2 scoping starts. Layer3 Activations are out of scope for Season 1 entirely (per the Option C platform-stack design).

| partner | X (Season 1) | Galxe (Season 2 candidate) | Boost.xyz (Season 1 follow-up if budget permits) | Ecosystem grant track |
| ------- | ------------ | -------------------------- | ----------------------------------------------- | --------------------- |
| Secret Network | Co-tweet 2026-06-13 | Educators Guild quiz: "Pass a Secret Network privacy primer" | Co-funded action on encrypted-weighting basket registration | Not yet scoped |
| Mantle | Co-tweet 2026-06-04 | Onboarding task: "Follow @Mantle_Official" | Co-funded action on first N Mantle-spoke basket creations | Candidate (warm intro requested, not yet applied) |
| iExec | Co-tweet 2026-06-12 | Engineers Guild quiz on confidential compute | Co-funded action on first N agents shipped inside an iApp | Not yet scoped |
| Nox | Co-tweet 2026-06-14 | Engineers Guild quiz on MPC threshold signing | Co-funded action on keeper-signing PoC participation | Not yet scoped |

## File layout

```
growth/partnerships/
  README.md             # this file (index + status table + workflow)
  _TEMPLATE.md          # per-partner schema with placeholders
  secret-network.md     # State leg of the Week 3 confidential-infra trinity
  mantle.md             # Cross-Chain Couriers spoke demo (Week 2)
  iexec.md              # Compute leg of the Week 3 confidential-infra trinity
  nox.md                # Signing leg of the Week 3 confidential-infra trinity
```
