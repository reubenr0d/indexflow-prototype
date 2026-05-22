// Pure validators for the `set_vault_assets` MCP tool. Kept dependency-free
// so they can be unit-tested without spawning the MCP server, wiring up
// `cast`, or hitting an RPC.
//
// The handler in `index.js` consumes these to reject hallucinated /
// unknown assetIds locally with a structured `INVALID_ASSET_ID` payload
// instead of letting `cast send setAssets(bytes32[]) [...]` revert on-chain
// with a generic `TX_FAILED`. See the 2026-05-22 quality-matrix-manager
// retry storm (run-log `2026-05-22T21:45:16.591Z`, 31 identical failing
// turns) for the failure mode this prevents.

export const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

// `0x` + 64 hex chars, no leading/trailing whitespace. Mixed case allowed.
export function validateAssetIdFormat(id) {
  if (typeof id !== "string") {
    return { ok: false, reason: "assetId must be a string" };
  }
  if (id.length === 0) {
    return { ok: false, reason: "assetId is empty" };
  }
  if (!BYTES32_RE.test(id)) {
    return {
      ok: false,
      reason:
        "assetId must match /^0x[0-9a-fA-F]{64}$/ (0x prefix + exactly 64 hex chars)",
    };
  }
  return { ok: true };
}

// Split a proposed assetIds array into:
//   - malformed: entries that fail `validateAssetIdFormat`
//   - unknown:   well-formed entries that are not in `knownActiveIds`
//   - valid:     well-formed entries that ARE in `knownActiveIds`
//
// Input order is preserved within each bucket. Duplicates are NOT collapsed
// — the contract decides what to do with them and surfacing duplicate
// behaviour is out of scope here. Case-insensitive matching: the known set
// is normalised to lowercase and inputs are compared as lowercase.
export function classifyAssetIds(assetIds, knownActiveIds) {
  const malformed = [];
  const unknown = [];
  const valid = [];

  if (!Array.isArray(assetIds)) {
    return { malformed, unknown, valid };
  }

  const knownSet = new Set(
    (Array.isArray(knownActiveIds) ? knownActiveIds : [])
      .filter((id) => typeof id === "string")
      .map((id) => id.toLowerCase()),
  );

  for (const raw of assetIds) {
    const fmt = validateAssetIdFormat(raw);
    if (!fmt.ok) {
      malformed.push(raw);
      continue;
    }
    const lower = raw.toLowerCase();
    if (knownSet.has(lower)) {
      valid.push(raw);
    } else {
      unknown.push(raw);
    }
  }

  return { malformed, unknown, valid };
}
