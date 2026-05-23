---
name: License, COC, Contributing
overview: "Add three repo-root governance files modeled on established DeFi/Foundry projects: `LICENSE` (MIT, matching every existing `SPDX-License-Identifier` in `src/**/*.sol`), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), and `CONTRIBUTING.md` (IndexFlow-specific workflow covering Foundry, npm workspaces, ABI regen, and security disclosure)."
todos:
  - id: license
    content: "Add `LICENSE` at repo root: standard MIT text, `Copyright (c) 2026 IndexFlow Contributors`."
    status: pending
  - id: coc
    content: "Add `CODE_OF_CONDUCT.md` at repo root: Contributor Covenant v2.1 with `conduct@indexflow.app` as enforcement contact and a TODO note to re-point post-Foundation."
    status: pending
  - id: contributing
    content: "Add `CONTRIBUTING.md` at repo root: 12-section guide covering setup, tests, security disclosure (`security@indexflow.app`), ABI regen policy, changelog rule, PR checklist, and MIT-licensing of contributions."
    status: pending
isProject: false
---

# Add LICENSE, CODE_OF_CONDUCT.md, [CONTRIBUTING.md](http://CONTRIBUTING.md)

## Context

The repo currently has no `LICENSE`, `CODE_OF_CONDUCT.md`, or `CONTRIBUTING.md` at root, but every Solidity source file already declares `SPDX-License-Identifier: MIT` (62 files under `src/`, including new IndexFlow code in `src/vault/`, `src/perp/`, `src/coordination/`). `lib/forge-std/` and `lib/solady/` (vendored deps) ship MIT licenses, and the upstream GMX v1 fork is MIT. The README also flags a future bug-bounty (Immunefi) and audit work — so contributing/security entry points need to be clearly named so external auditors and bounty hunters know where to land.

Confirmed decision: **MIT license** for the whole repo (consistent with existing SPDX headers; no source-file changes needed). Copyright holder will be a placeholder ("IndexFlow Contributors") and contact addresses will use the `indexflow.app` domain already referenced in [README.md](README.md) (`ops@indexflow.app`). A TODO note will flag that these should be re-pointed once the Foundation entity is incorporated (per [docs/REGULATORY_ROADMAP_DRAFT.md](docs/REGULATORY_ROADMAP_DRAFT.md)).

Inspiration sources:

- License text: standard SPDX MIT template (same form used by [lib/forge-std/LICENSE-MIT](lib/forge-std/LICENSE-MIT) and [lib/solady/LICENSE.txt](lib/solady/LICENSE.txt)).
- Code of Conduct: Contributor Covenant v2.1 — the de facto standard used by Uniswap, Aave, OpenZeppelin, Foundry, and most major DeFi/web3 projects.
- Contributing: Structured after [lib/forge-std/CONTRIBUTING.md](lib/forge-std/CONTRIBUTING.md) (Foundry-native phrasing) and the Uniswap/Aave conventions (clear separation of bug-report vs security-disclosure paths), then adapted to IndexFlow's actual repo layout (multi-language monorepo: Foundry + Node workspaces + Envio indexer).

## File 1: `LICENSE`

Plain MIT text, no modifications.

- Header: `MIT License`
- Copyright line: `Copyright (c) 2026 IndexFlow Contributors`
- Standard MIT body (permission grant + warranty disclaimer), no extra clauses.
- No SPDX header changes anywhere in `src/`, `apps/`, `services/`, `scripts/` — they all already match.

## File 2: `CODE_OF_CONDUCT.md`

Contributor Covenant v2.1 verbatim, with these project-specific substitutions:

- Enforcement contact: `conduct@indexflow.app` (placeholder, flagged in a comment near the top).
- Project name in the introductory paragraph: "the IndexFlow project".
- Footer credit + link back to [https://www.contributor-covenant.org/version/2/1/code_of_conduct.html](https://www.contributor-covenant.org/version/2/1/code_of_conduct.html) (per license terms — Covenant is CC-BY-4.0).

Sections (standard Covenant 2.1 structure):

1. Our Pledge
2. Our Standards
3. Enforcement Responsibilities
4. Scope
5. Enforcement (with the IndexFlow contact email)
6. Enforcement Guidelines (Correction / Warning / Temporary Ban / Permanent Ban)
7. Attribution

## File 3: `CONTRIBUTING.md`

Bespoke guide tailored to this repo. Outline:

### 1. Welcome / Scope

- One paragraph framing IndexFlow as a protocol prototype (cite [README.md](README.md) and [docs/README.md](docs/README.md) as entry points).
- Make it explicit that the repo contains both Solidity contracts (under `src/`) and supporting Node services/UI (under `apps/`, `services/`, `scripts/`).

### 2. Code of Conduct

- One-line pointer to [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) with the enforcement email.

### 3. Reporting Security Vulnerabilities (privileged path)

- Strongly worded "do NOT open a public issue for security bugs" block, modeled on Aave/Uniswap.
- Disclosure email: `security@indexflow.app` (placeholder, TODO comment to repoint to Immunefi once the bounty program in the [README.md](README.md) Mainnet Readiness TODO is live).
- Pointer to the relevant contracts to focus disclosure on (from [README.md](README.md) audit list: `BasketVault`, `VaultAccounting`, `OracleAdapter`, `PriceSync`, `FundingRateManager`, `PricingEngine`, GMX fork integration, `StateRelay`, `RedemptionReceiver`).

### 4. Ways to Contribute

- File an issue (bug, feature, doc gap).
- Improve docs under `docs/` and in-app docs (`apps/web/src/lib/wiki.ts`) — cite the `docs-sync.mdc` cursor rule expectation.
- Add tests under `test/` (Foundry) or `apps/web/tests/` (Playwright).
- Submit a PR for a code change.

### 5. Local Development Setup

Mirror the README "Setup" section so contributors get one source of truth:

```sh
forge install
npm install
forge build
forge test -vv
```

- Note Foundry needs to be on `PATH` (link to [foundry.toml](foundry.toml)).
- Point at [docker-compose.local.yml](docker-compose.local.yml) + `npm run local:up` for full-stack dev.
- Reference the [.env.example](.env.example) files for required env vars.

### 6. Running the Test Suite

- Solidity: `npm run test` (which calls [scripts/forge-test.sh](scripts/forge-test.sh)) and `npm run test:v` for verbose.
- E2E: `npm run test:e2e` (see [docs/E2E_TESTING.md](docs/E2E_TESTING.md)).
- Push-worker: `npm run test:push-worker`.
- Mention that CI runs all of these on PR — link to [.github/workflows/test.yml](.github/workflows/test.yml).

### 7. Coding Standards

- Solidity: pragmas already split (`0.6.12` for GMX fork in `src/gmx/`, `^0.8.24` for new code) — cite [MODIFICATIONS.md](MODIFICATIONS.md). All new contracts must keep `// SPDX-License-Identifier: MIT` and natspec on public/external functions.
- Run `forge fmt` before committing.
- Web/Node: `npm run lint:web`. Follow conventions in [apps/web/AGENTS.md](apps/web/AGENTS.md) and [apps/web/CLAUDE.md](apps/web/CLAUDE.md).

### 8. ABI & Deployment Conventions

Direct quote of the "ABI Regeneration Policy" from [AGENTS.md](AGENTS.md) so external contributors don't hand-edit generated files under `apps/web/src/abi/` or `apps/envio/abis/`. Provide the regen command:

```sh
forge build
node scripts/extract-abis.js
for c in BasketFactory BasketVault BasketShareToken VaultAccounting OracleAdapter StateRelay; do \
  jq '.abi' "out/$c.sol/$c.json" > "apps/envio/abis/$c.json"; \
done
```

### 9. Changelog Discipline

- Cite the `changelog-updates.mdc` cursor rule: user/operator-visible changes must land in [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]` using Keep-a-Changelog headings (Added / Changed / Deprecated / Removed / Fixed / Security).

### 10. Pull Request Process

- Branch from `main`, keep PRs focused, one logical change per PR.
- Required PR checklist:
  - `forge fmt` passes
  - `forge test` passes
  - `npm run lint:web` passes (if web changed)
  - Docs updated (`README.md`, `docs/`, in-app wiki) per `docs-sync.mdc`
  - `CHANGELOG.md` updated
  - No manual edits to generated ABIs
- Squash-on-merge default; commit body should explain the *why*.

### 11. License of Contributions

- One short paragraph: by submitting a PR, contributor agrees their code is licensed under MIT (same as the rest of the repo).
- No CLA at this stage.

### 12. Where to Get Help

- Link to GitHub Discussions / Issues, the docs index ([docs/README.md](docs/README.md)), and the Telegram community (referenced in [README.md](README.md) "Growth" section).

## Non-goals / Out of scope for this change

- Not creating `SECURITY.md`, `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`, or `.github/FUNDING.yml`. The user asked only for the three governance files; I'll mention these as obvious follow-ups in the wrap-up message.
- Not flipping any existing SPDX headers — MIT was chosen partly so this is unnecessary.
- Not registering the COC email aliases (`conduct@`, `security@`) at the DNS layer; placeholder addresses with TODO comments.
- No `CHANGELOG.md` entry needed for adding these files (governance docs are documentation-only and not user/operator-visible behavior changes, per the `changelog-updates.mdc` "What to skip" rules).

