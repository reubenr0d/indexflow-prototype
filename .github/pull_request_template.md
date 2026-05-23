<!--
  Thanks for opening a PR. Please fill in every section below. Sections
  marked "(agents)" are for self-improver / vault-agent PRs — humans can
  leave them blank.

  Repo conventions live in:
    - AGENTS.md                                 (repo-wide rules incl. ABI regen + commit policy)
    - .cursor/rules/docs-sync.mdc               (docs sync rule)
    - .cursor/rules/changelog-updates.mdc       (CHANGELOG.md rule)
    - docs/AGENTS_FRAMEWORK.md                  (agent runner + self-improver loop)
-->

## Summary

<!-- 1–3 sentences focused on the *why*, not the *what*. -->

## Type of change

<!-- Check every box that applies. -->

- [ ] Bug fix
- [ ] Feature / enhancement
- [ ] Refactor / internal cleanup
- [ ] Docs only
- [ ] Agent-authored self-improvement (also fill in **Agent metadata** below)
- [ ] Infra / CI / build
- [ ] Dependency bump

## Linked issues

<!-- e.g. "Closes #123", "Refs #456". Use "Refs" when the PR doesn't fully resolve the issue. -->

Closes #

## Test plan

<!--
  Tick every applicable command you actually ran locally. CI re-runs the same
  matrix via .github/workflows/test.yml — keep this list aligned with the
  surfaces you touched.
-->

- [ ] `forge fmt --check` is clean
- [ ] `forge test` passes (use `-vvv` if you touched any contract under `src/`)
- [ ] `npm run lint:web` passes (required if `apps/web/**` changed)
- [ ] `npm --prefix apps/web run test` (Vitest) passes
- [ ] `npm --prefix apps/web run test:e2e:ci` passes (required if a user-facing flow changed)
- [ ] `npm --prefix apps/push-worker run test` passes (required if `apps/push-worker/**` changed)
- [ ] `npm test --prefix services/keeper` passes (required if `services/keeper/**` changed)
- [ ] N/A — this PR is docs / governance only

### Manual verification steps

<!-- Free-text checklist of what a reviewer should click / run to verify. -->

-

## Risk + rollback

<!--
  Be explicit. "Low / Medium / High" plus one sentence per item is enough.
-->

- **Blast radius:**
- **Affected surfaces / networks:**
- **Rollback path:** <!-- e.g. "revert this PR; no migrations" or "revert + redeploy contracts X/Y" -->

## Docs + ABIs + changelog

- [ ] Updated `README.md` / `docs/**` / `apps/web/src/lib/wiki.ts` (and `apps/web/src/lib/tooltip-copy.ts` if labels/tooltips changed) per [`.cursor/rules/docs-sync.mdc`](.cursor/rules/docs-sync.mdc), or confirmed no docs impact.
- [ ] Updated `CHANGELOG.md` under `## [Unreleased]` per [`.cursor/rules/changelog-updates.mdc`](.cursor/rules/changelog-updates.mdc), or confirmed no user/operator-visible change.
- [ ] No hand-edits to `apps/web/src/abi/**` or `apps/envio/abis/**` — any ABI changes were regenerated via `forge build && node scripts/extract-abis.js && for c in BasketFactory BasketVault BasketShareToken VaultAccounting OracleAdapter StateRelay; do jq '.abi' "out/$c.sol/$c.json" > "apps/envio/abis/$c.json"; done` per [`AGENTS.md`](AGENTS.md).
- [ ] No edits to `AGENT_DEPLOYMENT_MEMORY.md` outside of explicit deployment ownership.

## Agent metadata (agents)

<!--
  Humans: leave this empty.

  Agents (self-improver, vault-manager, mining-manager, quality-matrix-manager,
  self-improver-issues, etc.): fill in every field. `scripts/apply-self-improvement-
  proposals.mjs::buildPrBody` renders against this exact heading structure.
-->

- **agent:** <!-- e.g. `self-improver` (matches `agents/<name>.md`) -->
- **runId / tickTimestamp:** <!-- e.g. run-uuid / 2026-05-23T07:00:00Z -->
- **manifestPath:** <!-- e.g. `.agent-self-improvement/proposed-edits.json` -->
- **requiresReviewKind:** <!-- `prompt` | `runner` | `mcp` | `shared` -->
- **convictionWeight (strongest edit):** <!-- 0.00 – 1.00 -->
- **riskOfficerVerdict:** <!-- `approve` | `downsize` | `veto` (then reason) -->

### Trigger signals

<!-- One bullet per signal emitted by `scripts/detect-self-improvement-signal.mjs`. -->

- `<kind>` on `<agent>` (`<network>`): <summary>

## Reviewer checklist

- [ ] PR title follows `<type>: <short imperative>` (e.g. `feat:`, `fix:`, `agent:`).
- [ ] All required Test plan boxes are ticked or explicitly N/A.
- [ ] If this is an agent PR, I read **Agent metadata** and skimmed the linked manifest.
- [ ] If this is an agent PR, I re-ran `node scripts/apply-self-improvement-proposals.mjs --apply-locally-only` locally and inspected `git diff`.
- [ ] No secrets, private keys, or `.env*` files are touched.
