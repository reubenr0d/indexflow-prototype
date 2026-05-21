/**
 * Shared secret redactor.
 *
 * Used by the MCP servers (apps/mcps/*) and the agent runner (scripts/agent-runner.mjs)
 * to scrub the keeper private key (and any other secrets passed in) from any text
 * that leaves the runner: stdout, OpenAI tool responses, run-log entries, agent
 * metadata files, and error messages thrown back to the parent process.
 *
 * The original leak was `cast send <addr> <sig> <args> --private-key 0x...` being
 * embedded verbatim in `Error.message` when `execFileSync` failed. We now pass the
 * key via `ETH_PRIVATE_KEY` env so it never enters argv, but this redactor stays
 * as defense-in-depth for any future code path that bypasses the env approach.
 */

const REDACTED = "[REDACTED_KEY]";

// Matches `--private-key 0x<64 hex>` (with optional whitespace) and any trailing
// quoting. Catches the historical leak format from `Command failed: cast send ...`.
const PRIVATE_KEY_FLAG_RE = /--private-key[\s=]+(?:"|')?0x[a-fA-F0-9]{64}(?:"|')?/g;

// Matches `--private-key <0x-less-64-hex>` (some tools accept the raw hex form).
const PRIVATE_KEY_FLAG_NO_PREFIX_RE = /--private-key[\s=]+(?:"|')?[a-fA-F0-9]{64}(?:"|')?/g;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectEnvSecrets() {
  const candidates = [
    process.env.PRIVATE_KEY,
    process.env.ETH_PRIVATE_KEY,
    process.env.KEEPER_PRIVATE_KEY,
  ];
  return candidates
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length >= 16);
}

/**
 * Redact known secrets from a free-text string.
 *
 * @param {string} text                 - Text to scrub.
 * @param {string[]} [extraSecrets=[]]  - Additional literal secret values that
 *                                        should be redacted (e.g. RPC URLs with
 *                                        embedded basic-auth credentials).
 * @returns {string} The scrubbed text.
 */
export function redactSecrets(text, extraSecrets = []) {
  if (text === null || text === undefined) return text;
  let str = typeof text === "string" ? text : String(text);

  const literalSecrets = new Set([
    ...collectEnvSecrets(),
    ...extraSecrets
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length >= 16),
  ]);

  for (const secret of literalSecrets) {
    const re = new RegExp(escapeRegExp(secret), "g");
    str = str.replace(re, REDACTED);
  }

  // Strip any `--private-key 0x...` flag form even if the value didn't match a
  // known env secret (handles cases where the runner is invoked with a key
  // we never recorded in env, or a future code path uses a different var).
  str = str.replace(PRIVATE_KEY_FLAG_RE, `--private-key ${REDACTED}`);
  str = str.replace(PRIVATE_KEY_FLAG_NO_PREFIX_RE, `--private-key ${REDACTED}`);

  return str;
}

/**
 * Recursively redact secrets from a JSON-like value (object/array/scalar).
 * Useful when serialising structured payloads such as the run summary that may
 * embed error strings deep in the tree.
 */
export function redactSecretsDeep(value, extraSecrets = []) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactSecrets(value, extraSecrets);
  if (Array.isArray(value)) {
    return value.map((v) => redactSecretsDeep(v, extraSecrets));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactSecretsDeep(v, extraSecrets);
    }
    return out;
  }
  return value;
}

export const __testing = {
  PRIVATE_KEY_FLAG_RE,
  PRIVATE_KEY_FLAG_NO_PREFIX_RE,
  REDACTED,
};
