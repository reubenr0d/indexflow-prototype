// Regression coverage for the startup vault-identity guardrail added as the
// second line of defence after the 2026-05-21 cross-agent contamination fix
// in commit 00cfb07.
//
// The runner trusts `state.json.vaultAddress`. If a future bug, manual edit,
// or bad CI restore re-introduces a wrong address, `verifyVaultNameMatch`
// compares the on-chain BasketVault.name() against the agent's configured
// `vaultName` and refuses to run instead of silently trashing a sibling
// agent's vault.

import test from "node:test";
import assert from "node:assert/strict";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const { verifyVaultNameMatch } = __agentRunnerInternals;

test("verifyVaultNameMatch: exact match passes", () => {
  const verdict = verifyVaultNameMatch({
    onChainName: "Minestarters Quality Matrix",
    expectedName: "Minestarters Quality Matrix",
    vaultAddress: "0xccc3",
    agentName: "quality-matrix-manager",
  });

  assert.deepEqual(verdict, { ok: true });
});

test("verifyVaultNameMatch: case-insensitive match passes", () => {
  const verdict = verifyVaultNameMatch({
    onChainName: "minestarters quality matrix",
    expectedName: "Minestarters Quality Matrix",
    vaultAddress: "0xccc3",
    agentName: "quality-matrix-manager",
  });

  assert.deepEqual(verdict, { ok: true });
});

test("verifyVaultNameMatch: tolerates surrounding whitespace on either side", () => {
  const verdict = verifyVaultNameMatch({
    onChainName: "  Minestarters Quality Matrix  ",
    expectedName: "Minestarters Quality Matrix",
    vaultAddress: "0xccc3",
    agentName: "quality-matrix-manager",
  });

  assert.deepEqual(verdict, { ok: true });
});

test("verifyVaultNameMatch: mismatch returns name-mismatch with both names in the error", () => {
  const verdict = verifyVaultNameMatch({
    onChainName: "Minestarters ML Picks",
    expectedName: "Minestarters Quality Matrix",
    vaultAddress: "0x672371609170aE7E9C8e5e0E08Ec5819D5190c38",
    agentName: "quality-matrix-manager",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "name-mismatch");
  assert.ok(
    verdict.error.includes("Minestarters ML Picks"),
    "error must surface the actual on-chain name so operators can diagnose at a glance",
  );
  assert.ok(
    verdict.error.includes("Minestarters Quality Matrix"),
    "error must surface the configured/expected name so operators know which agent is misconfigured",
  );
  assert.ok(
    verdict.error.includes("quality-matrix-manager"),
    "error must surface the agent name so the operator knows which state.json to clear",
  );
  assert.ok(
    verdict.error.includes("0x672371609170aE7E9C8e5e0E08Ec5819D5190c38"),
    "error must surface the vault address so the operator can cross-check on-chain",
  );
  assert.ok(
    verdict.error.includes("agents/memory/quality-matrix-manager/state.json"),
    "error must tell the operator exactly which file to clear to recover",
  );
});

test("verifyVaultNameMatch: empty / null / non-string on-chain name fails with missing-onchain-name", () => {
  for (const bad of [null, undefined, "", "   ", 42, {}, []]) {
    const verdict = verifyVaultNameMatch({
      onChainName: bad,
      expectedName: "Minestarters Quality Matrix",
      vaultAddress: "0xccc3",
      agentName: "quality-matrix-manager",
    });

    assert.equal(verdict.ok, false, `bad on-chain name ${JSON.stringify(bad)} must fail`);
    assert.equal(verdict.reason, "missing-onchain-name");
    assert.ok(
      verdict.error.includes("could not read an on-chain name"),
      "missing-name error must explain that the on-chain read produced no usable name",
    );
    assert.ok(verdict.error.includes("Minestarters Quality Matrix"));
  }
});

test("verifyVaultNameMatch: undefined / empty expectedName returns ok+skipped (legacy agent path)", () => {
  for (const noExpected of [null, undefined, ""]) {
    const verdict = verifyVaultNameMatch({
      onChainName: "Some Vault",
      expectedName: noExpected,
      vaultAddress: "0xccc3",
      agentName: "legacy-agent",
    });

    assert.deepEqual(
      verdict,
      { ok: true, skipped: true },
      `expectedName=${JSON.stringify(noExpected)} should skip the check, not fail it`,
    );
  }
});

test("verifyVaultNameMatch: tolerates missing vaultAddress/agentName fields in the error string", () => {
  const verdict = verifyVaultNameMatch({
    onChainName: "Minestarters ML Picks",
    expectedName: "Minestarters Quality Matrix",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "name-mismatch");
  assert.ok(
    verdict.error.includes("(unknown address)"),
    "missing vault address must render as a placeholder, not undefined/null",
  );
  assert.ok(
    verdict.error.includes("(unknown)"),
    "missing agent name must render as a placeholder, not undefined/null",
  );
});
