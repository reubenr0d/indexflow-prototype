import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const SCRIPT = resolve("scripts/vault-agent-matrix.mjs");

function runMatrix(env = {}, args = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });
}

test("scheduled ticks resolve exactly one sepolia row", () => {
  const res = runMatrix(
    { EVENT_NAME: "schedule", AGENT_INPUT: "", NETWORK_INPUT: "sepolia", HOUR_UTC: "3" },
    ["--strict-empty"],
  );
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const line = res.stdout
    .split("\n")
    .find((l) => l.startsWith("Resolved matrix: "));
  assert.ok(line, "expected resolved matrix output");
  const matrix = JSON.parse(line.replace("Resolved matrix: ", ""));
  assert.equal(matrix.include.length, 1);
  assert.equal(matrix.include[0].network, "sepolia");
});

test("agent=all resolves only sepolia entries", () => {
  const res = runMatrix(
    { EVENT_NAME: "workflow_dispatch", AGENT_INPUT: "all", NETWORK_INPUT: "sepolia" },
    ["--strict-empty"],
  );
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const line = res.stdout
    .split("\n")
    .find((l) => l.startsWith("Resolved matrix: "));
  const matrix = JSON.parse(line.replace("Resolved matrix: ", ""));
  assert.ok(matrix.include.length > 0);
  assert.ok(matrix.include.every((row) => row.network === "sepolia"));
});

test("manual spoke network request fails with deterministic hub-only message", () => {
  const res = runMatrix(
    { EVENT_NAME: "workflow_dispatch", AGENT_INPUT: "all", NETWORK_INPUT: "mantle-sepolia" },
    ["--strict-empty"],
  );
  assert.notEqual(res.status, 0);
  assert.match(
    `${res.stderr}\n${res.stdout}`,
    /configured as a spoke\. Vault-agent CI is hub-only; use 'sepolia'/,
  );
});

