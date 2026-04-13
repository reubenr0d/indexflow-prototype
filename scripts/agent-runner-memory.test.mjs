import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const {
  buildDeploymentFingerprint,
  shouldInvalidateDeploymentMemory,
  rotateFileToArchive,
  shortHash,
} = __agentRunnerInternals;

test("shouldInvalidateDeploymentMemory handles legacy and fingerprint changes", () => {
  const fpA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const fpB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  assert.equal(shouldInvalidateDeploymentMemory(null, fpA), false);
  assert.equal(shouldInvalidateDeploymentMemory({ deploymentFingerprint: fpA }, fpA), false);
  assert.equal(shouldInvalidateDeploymentMemory({ deploymentFingerprint: fpA }, fpB), true);
  assert.equal(shouldInvalidateDeploymentMemory({ vaultAddress: "0xabc" }, fpA), true);
});

test("buildDeploymentFingerprint changes when deployment config content changes", () => {
  const tempDir = mkdtempSync(resolve(tmpdir(), "agent-runner-memory-"));
  const configPath = resolve(tempDir, "local-deployment.json");
  writeFileSync(configPath, JSON.stringify({ basketFactory: "0x1" }) + "\n");

  const originalConfig = process.env.DEPLOYMENT_CONFIG;
  const originalRpc = process.env.RPC_URL;

  process.env.DEPLOYMENT_CONFIG = configPath;
  process.env.RPC_URL = "http://127.0.0.1:8545";
  const before = buildDeploymentFingerprint("local");

  writeFileSync(configPath, JSON.stringify({ basketFactory: "0x2" }) + "\n");
  const after = buildDeploymentFingerprint("local");

  if (originalConfig === undefined) delete process.env.DEPLOYMENT_CONFIG;
  else process.env.DEPLOYMENT_CONFIG = originalConfig;
  if (originalRpc === undefined) delete process.env.RPC_URL;
  else process.env.RPC_URL = originalRpc;
  rmSync(tempDir, { recursive: true, force: true });

  assert.notEqual(before.fingerprint, after.fingerprint);
  assert.equal(before.deploymentConfigPath, configPath);
  assert.equal(after.deploymentConfigPath, configPath);
});

test("rotateFileToArchive moves file into archive directory", () => {
  const tempDir = mkdtempSync(resolve(tmpdir(), "agent-runner-rotate-"));
  const fileDir = resolve(tempDir, "memory");
  mkdirSync(fileDir, { recursive: true });
  const statePath = resolve(fileDir, "state.json");
  writeFileSync(statePath, '{"vaultAddress":"0xabc"}\n');

  const archived = rotateFileToArchive(statePath, "deployment-test");

  assert.ok(archived);
  assert.equal(existsSync(statePath), false);
  assert.equal(existsSync(archived), true);
  assert.ok(archived.includes("/archive/"));
  assert.equal(shortHash("sha256:1234567890abcdef"), "1234567890");

  rmSync(tempDir, { recursive: true, force: true });
});
