import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const {
  buildDeploymentFingerprint,
  shouldInvalidateDeploymentMemory,
  usesVaultLifecycle,
  resolveVaultLifecycle,
  buildNonVaultMemoryState,
  buildSystemPrompt,
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

test("resolveVaultLifecycle reuses remembered vaults across agent file edits", () => {
  const currentHash = "sha256:new";

  assert.deepEqual(resolveVaultLifecycle(null, currentHash), {
    needsNewVault: true,
    agentFileChanged: false,
  });

  assert.deepEqual(
    resolveVaultLifecycle(
      {
        vaultAddress: "0xabc",
        agentFileHash: "sha256:old",
      },
      currentHash
    ),
    {
      needsNewVault: false,
      agentFileChanged: true,
    }
  );

  assert.deepEqual(
    resolveVaultLifecycle(
      {
        vaultAddress: "",
        agentFileHash: "sha256:old",
      },
      currentHash
    ),
    {
      needsNewVault: true,
      agentFileChanged: true,
    }
  );
});

test("usesVaultLifecycle is gated by vaultName frontmatter", () => {
  assert.equal(usesVaultLifecycle({ name: "mining-manager", vaultName: "Minestarters ML Picks" }), true);
  assert.equal(usesVaultLifecycle({ name: "issue-implementer", vaultName: null }), false);
  assert.equal(usesVaultLifecycle({ name: "self-improver-issues" }), false);
});

test("resolveVaultLifecycle does not require vaults for non-vault agents", () => {
  const currentHash = "sha256:new";

  assert.deepEqual(
    resolveVaultLifecycle(null, currentHash, { hasVaultLifecycle: false }),
    {
      needsNewVault: false,
      agentFileChanged: false,
    },
  );

  assert.deepEqual(
    resolveVaultLifecycle(
      {
        agentFileHash: "sha256:old",
      },
      currentHash,
      { hasVaultLifecycle: false },
    ),
    {
      needsNewVault: false,
      agentFileChanged: true,
    },
  );
});

test("buildSystemPrompt injects vault instructions only for vault agents", () => {
  const baseConfig = {
    name: "issue-implementer",
    systemPrompt: "Base prompt.",
    skills: [],
    vaultName: null,
    depositFeeBps: 50,
    redeemFeeBps: 50,
  };

  const nonVaultPrompt = buildSystemPrompt(baseConfig, null, [], false);
  assert.ok(!nonVaultPrompt.includes("## Your Vault"));
  assert.ok(!nonVaultPrompt.includes("create_vault"));

  const vaultPrompt = buildSystemPrompt(
    {
      ...baseConfig,
      name: "mining-manager",
      vaultName: "Minestarters ML Picks",
    },
    null,
    [],
    true,
  );
  assert.ok(vaultPrompt.includes("## Your Vault"));
  assert.ok(vaultPrompt.includes('Call create_vault with name="Minestarters ML Picks"'));
});

test("buildNonVaultMemoryState persists thesis without vault fields", () => {
  const state = {
    vaultAddress: "0xabc0000000000000000000000000000000000001",
    vaultName: "Wrong Vault",
    thesis: "Previous thesis.",
    lastThesisUpdate: "2026-06-01T00:00:00.000Z",
  };
  const next = buildNonVaultMemoryState({
    state,
    currentAgentFileHash: "sha256:new",
    deploymentContext: {
      fingerprint: "sha256:deployment",
      deploymentConfigPath: "/tmp/deployment.json",
    },
    finishedAt: "2026-06-05T17:00:00.000Z",
    extractedThesis: "New thesis.",
  });

  assert.deepEqual(next, {
    agentFileHash: "sha256:new",
    deploymentFingerprint: "sha256:deployment",
    deploymentConfigPath: "/tmp/deployment.json",
    lastRunAt: "2026-06-05T17:00:00.000Z",
    thesis: "New thesis.",
    lastThesisUpdate: "2026-06-05T17:00:00.000Z",
  });
  assert.equal("vaultAddress" in next, false);
  assert.equal("vaultName" in next, false);
  assert.equal("deployedAt" in next, false);
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
