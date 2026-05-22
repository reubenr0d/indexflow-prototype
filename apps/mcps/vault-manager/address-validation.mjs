// Pure validators for EVM address and bytes32 arguments accepted by the
// vault-manager MCP. Kept dependency-free so they can be unit-tested without
// spawning the MCP server, wiring up `cast`, or hitting an RPC.
//
// We started enforcing address shape at the MCP boundary after the
// 2026-05-22 quality-matrix-manager incident where the LLM emitted a 28-byte
// "vault" arg `0xbd7ea7e23ae07f0dd65b2bf6ecc95018c610da029ccb697f17b69b2` —
// the prefix of the real vault concatenated with the suffix of the GRSL.V
// asset id. `cast send` rejected the malformed address with an opaque
// parser-error stderr; the agent had nothing structured to recover from.
// Validating shape here lets us return INVALID_ADDRESS / INVALID_BYTES32
// before broadcast.

export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
export const BYTES32_RE = /^0x[a-fA-F0-9]{64}$/;

export function validateAddress(value) {
  if (typeof value !== "string") {
    return { ok: false, reason: "address must be a string" };
  }
  if (value.length === 0) {
    return { ok: false, reason: "address is empty" };
  }
  if (!ADDRESS_RE.test(value)) {
    return {
      ok: false,
      reason:
        "address must match /^0x[a-fA-F0-9]{40}$/ (0x prefix + exactly 40 hex chars / 20 bytes)",
    };
  }
  return { ok: true };
}

export function validateBytes32(value) {
  if (typeof value !== "string") {
    return { ok: false, reason: "bytes32 must be a string" };
  }
  if (value.length === 0) {
    return { ok: false, reason: "bytes32 is empty" };
  }
  if (!BYTES32_RE.test(value)) {
    return {
      ok: false,
      reason:
        "bytes32 must match /^0x[a-fA-F0-9]{64}$/ (0x prefix + exactly 64 hex chars / 32 bytes)",
    };
  }
  return { ok: true };
}

// Validate a list of {name, value, kind} arguments where kind is "address" or
// "bytes32". Returns the first violation found, or null if all pass. Used at
// every write tool boundary so we can emit a single structured INVALID_ARGUMENT
// payload back to the LLM without invoking cast.
export function validateArgs(specs) {
  for (const spec of specs ?? []) {
    if (!spec) continue;
    const { name, value, kind } = spec;
    const fn = kind === "address" ? validateAddress : kind === "bytes32" ? validateBytes32 : null;
    if (!fn) continue;
    const r = fn(value);
    if (!r.ok) {
      return { name, kind, value, reason: r.reason };
    }
  }
  return null;
}
