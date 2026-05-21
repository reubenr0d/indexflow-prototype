import test from "node:test";
import assert from "node:assert/strict";
import { redactSecrets, redactSecretsDeep } from "./lib/redact-secrets.mjs";

const SAMPLE_KEY = "0x" + "a".repeat(64);
const OTHER_HEX_64 = "0x" + "b".repeat(64);
const VAULT_ADDR = "0x672371609170aE7E9C8e5e0E08Ec5819D5190c38";
const TX_HASH = "0x" + "c".repeat(64);

function withEnv(env, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("redacts the historical cast error string with --private-key flag", () => {
  const input =
    `Command failed: cast send ${VAULT_ADDR} allocateToPerp(uint256) 995000000 ` +
    `--private-key ${SAMPLE_KEY} --rpc-url https://example.com --json`;
  const out = withEnv({ PRIVATE_KEY: SAMPLE_KEY }, () => redactSecrets(input));
  assert.ok(!out.includes(SAMPLE_KEY), "raw key must not appear");
  assert.ok(!out.includes(SAMPLE_KEY.slice(2)), "raw key (without 0x) must not appear");
  assert.match(out, /--private-key \[REDACTED_KEY\]/);
  assert.match(out, /allocateToPerp\(uint256\) 995000000/);
  assert.ok(out.includes(VAULT_ADDR), "vault address must be preserved");
});

test("redacts standalone occurrence of process.env.PRIVATE_KEY", () => {
  const input = `Sender used key: ${SAMPLE_KEY} (oops)`;
  const out = withEnv({ PRIVATE_KEY: SAMPLE_KEY }, () => redactSecrets(input));
  assert.ok(!out.includes(SAMPLE_KEY));
  assert.match(out, /\[REDACTED_KEY\]/);
});

test("redacts ETH_PRIVATE_KEY and KEEPER_PRIVATE_KEY env values", () => {
  const ethKey = "0x" + "d".repeat(64);
  const keeperKey = "0x" + "e".repeat(64);
  const input = `eth=${ethKey} keeper=${keeperKey}`;
  const out = withEnv(
    { PRIVATE_KEY: undefined, ETH_PRIVATE_KEY: ethKey, KEEPER_PRIVATE_KEY: keeperKey },
    () => redactSecrets(input),
  );
  assert.ok(!out.includes(ethKey));
  assert.ok(!out.includes(keeperKey));
});

test("does NOT redact non-secret 0x hex (vault addresses, tx hashes that aren't the key)", () => {
  const input = `Vault ${VAULT_ADDR} tx ${TX_HASH} other-hex ${OTHER_HEX_64}`;
  const out = withEnv({ PRIVATE_KEY: SAMPLE_KEY }, () => redactSecrets(input));
  assert.ok(out.includes(VAULT_ADDR), "20-byte address must be untouched");
  assert.ok(out.includes(TX_HASH), "non-secret 32-byte hex must be untouched");
  assert.ok(out.includes(OTHER_HEX_64), "non-secret 32-byte hex must be untouched");
});

test("--private-key flag form is redacted even when the value isn't in env", () => {
  const out = withEnv({ PRIVATE_KEY: undefined, ETH_PRIVATE_KEY: undefined, KEEPER_PRIVATE_KEY: undefined }, () =>
    redactSecrets(`cast send 0x... --private-key ${OTHER_HEX_64}`),
  );
  assert.ok(!out.includes(OTHER_HEX_64));
  assert.match(out, /--private-key \[REDACTED_KEY\]/);
});

test("no-op for empty / non-string input", () => {
  assert.equal(redactSecrets(null), null);
  assert.equal(redactSecrets(undefined), undefined);
  assert.equal(redactSecrets(""), "");
});

test("ignores extremely short env values to avoid spurious matches", () => {
  // A 4-char "secret" should not trigger replacement, otherwise common
  // substrings could be redacted from harmless logs.
  const out = withEnv({ PRIVATE_KEY: "abcd" }, () => redactSecrets("the abcd thing"));
  assert.equal(out, "the abcd thing");
});

test("redactSecretsDeep walks objects, arrays, and nested error fields", () => {
  const input = {
    summary: `Tx failed: --private-key ${SAMPLE_KEY}`,
    errors: [{ tool: "x", error: `key ${SAMPLE_KEY} leaked` }],
    nested: { writeActions: [{ note: SAMPLE_KEY }] },
    safe: 42,
    addr: VAULT_ADDR,
  };
  const out = withEnv({ PRIVATE_KEY: SAMPLE_KEY }, () => redactSecretsDeep(input));
  assert.ok(!JSON.stringify(out).includes(SAMPLE_KEY), "no leaked key in any nested field");
  assert.ok(JSON.stringify(out).includes(VAULT_ADDR), "address preserved");
  assert.equal(out.safe, 42);
});

test("extraSecrets parameter scrubs non-env values like RPC URLs with creds", () => {
  const rpcWithCreds = "https://user:p4ssw0rd-ABCDEF@rpc.example.com";
  const input = `RPC=${rpcWithCreds} retrying`;
  const out = redactSecrets(input, [rpcWithCreds]);
  assert.ok(!out.includes(rpcWithCreds));
  assert.match(out, /\[REDACTED_KEY\]/);
});
