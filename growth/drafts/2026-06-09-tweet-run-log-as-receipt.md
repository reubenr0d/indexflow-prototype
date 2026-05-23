# X (Twitter) Tweet Draft

---

## Metadata

- **Topic:** Paste a real run-log entry as a receipt from the previous day's quality-matrix-manager run on Sepolia
- **Pillar:** P3 Technical Credibility
- **Calendar week:** Week 3 (Season 1, confidential-infra trinity)
- **Source:** `agents/memory/quality-matrix-manager/run-log.sepolia.jsonl`
- **Hook type:** Data

---

## Tweet

Receipts from yesterday's quality-matrix-manager run on Sepolia:

opened SHORT NAK.TO size $1,200 collateral $240 entry $0.4187 — Red Flag: capex >140% of budget; bearish headline cited in justification; tx 0x9c4f…ae21 committed at <commit hash>

(Real entry from `run-log.sepolia.jsonl`.)

---

## Notes

- **Pre-post fill-in (required, ~5 min):**
  1. `git pull` to make sure local `main` has the latest committed run-log from CI.
  2. `tail -n 20 agents/memory/quality-matrix-manager/run-log.sepolia.jsonl` — find the most recent entry with a non-empty `recentActions[]` array containing an `open_position` or `close_position` write that has a real `txHash` AND a quotable `justification`. Skip dry-run entries (`dryRun: true`) and skip entries where every write returned an MCP error.
  3. Prefer a SHORT over a LONG if there's one available in the last 24h — the short lane is the more novel beat (matrix Red Flag + bearish headline) and pairs better with Week 3's "agents are real and they reason" angle. If no short is available, take the highest-conviction long (top 2 contributing signals quoted in `justification`).
  4. Pull the canonical fields from the chosen action: `tool`, `params.assetId` (resolve back to the symbol — the on-chain ID is keccak256 of the symbol), `params.isLong`, `params.size`, `params.collateral`, `params.entryPrice` (or the matched `oracle_price` from `get_oracle_assets`), and the `txHash`.
  5. Convert `params.size` and `params.collateral` from the raw 1e30 / 1e6 units to human dollars before pasting. Example: `1200000000000000000000000000000000` size = `$1,200`; `240000000` collateral = `$240`. The companion `_usd` / `_usdc` fields in the tool response give you the conversion for free if they're in the run-log payload.
  6. Lift one short phrase from the action's `justification` field — the matrix tier name on a long ("Exceptional GT=754") or the matrix Red Flag + bearish headline on a short ("capex >140% of budget; bearish headline cited"). Don't paraphrase. The point is that the agent itself produced these words and committed them to git.
  7. The `<commit hash>` is the short SHA of the `memory(agent): update agent memory and metadata` commit the `commit-results` job pushed for that tick. Find it with `git log --oneline --grep="memory(quality-matrix-manager)" -n 5`. Use the 7-char short hash. Optional but recommended: link the commit on GitHub in the quote-tweet a couple of hours later.
  8. **Anonymise nothing.** The vault is public, the tx hash is public, the run-log is committed to a public branch. The whole point of the tweet is that the audit trail is real.
- Character budget: the example body above is 271 chars including the line break before "(Real entry…)" — leaves ~9 chars of slack for the real values. If the chosen action overflows 280 chars, drop the parenthetical instead of trimming the action data.
- **No link** in the tweet itself. The receipt has to read as a receipt, not as a CTA. A reply or quote-tweet two hours later can carry the GitHub commit link — that's where the link belongs.
- Posts Tue Jun 9 at 16:30 UTC per the standalone cadence in `growth/X_GROWTH_PLAN.md`.
- Voice gut-check: no hashtag, no emoji, no "thread on…", no "look at this." The body is the proof.
- The placeholder uses a realistic-looking SHORT entry that maps cleanly onto the actual `quality-matrix-manager.md` short rules (Red Flag matrix signal + bearish headline confirmation). Replace with real data before posting.
