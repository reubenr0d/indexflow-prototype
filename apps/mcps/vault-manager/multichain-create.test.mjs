// Unit tests for the multi-chain `create_vault` plumbing.
//
// These tests exercise the spoke discovery + twin-deploy orchestration
// without spawning the MCP stdio server or any real `cast` process. The
// `cast` helpers (`castSendOnRpc`, `parseReceipt`,
// `extractVaultAddressFromCreateVaultReceipt`, `redactSecrets`) are stubbed
// so we can assert on the exact argument shapes that hit `cast`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  SPOKE_STUB_ASSET_ID,
  rpcEnvKey,
  discoverSpokeContexts,
  deploySpokeTwin,
} from "./multichain-create.mjs";

const FAKE_PROJECT_ROOT = "/tmp/fake-project";

test("SPOKE_STUB_ASSET_ID equals keccak256('USDC')", () => {
  // Stable on-chain id — matches script/DeploySpoke.s.sol stub asset.
  assert.equal(
    SPOKE_STUB_ASSET_ID,
    "0xd6aca1be9729c13d677335161321649cccae6a591554772516700f986f942eaa",
  );
});

test("rpcEnvKey: upper-cases the alias + appends _RPC_URL", () => {
  assert.equal(rpcEnvKey("fuji"), "FUJI_RPC_URL");
  assert.equal(rpcEnvKey("arbitrum_sepolia"), "ARBITRUM_SEPOLIA_RPC_URL");
  assert.equal(rpcEnvKey(""), null);
  assert.equal(rpcEnvKey(undefined), null);
});

test("discoverSpokeContexts: returns only configured spokes with RPC + deployment", () => {
  const chains = {
    sepolia: { role: "hub", rpcAlias: "sepolia" },
    fuji: { role: "spoke", rpcAlias: "fuji" },
    "arbitrum-sepolia": { role: "spoke", rpcAlias: "arbitrum_sepolia" },
    "local-spoke": { role: "spoke", rpcAlias: "local_spoke" },
  };
  const deployments = {
    fuji: {
      basketFactory: "0xFuji_Factory",
      stateRelay: "0xFuji_StateRelay",
      usdc: "0xFuji_USDC",
    },
    // arbitrum-sepolia deliberately missing -> should be marked skipped
  };
  const env = {
    FUJI_RPC_URL: "https://fuji.example",
    // arbitrum-sepolia RPC missing -> should be marked skipped even if its
    // deployment had been present
  };

  const result = discoverSpokeContexts({
    projectRoot: FAKE_PROJECT_ROOT,
    env,
    chainsConfig: chains,
    loadDeployment: (chainKey) => deployments[chainKey] ?? null,
  });

  assert.equal(result.length, 2, "hub + local-spoke are excluded; arbitrum is reported as skipped");
  const byChain = Object.fromEntries(result.map((r) => [r.chainKey, r]));

  assert.deepEqual(byChain.fuji, {
    chainKey: "fuji",
    rpcUrl: "https://fuji.example",
    basketFactory: "0xFuji_Factory",
    stateRelay: "0xFuji_StateRelay",
    usdc: "0xFuji_USDC",
  });

  assert.equal(byChain["arbitrum-sepolia"].skipped, true);
  assert.match(
    byChain["arbitrum-sepolia"].reason,
    /apps\/web\/src\/config\/arbitrum-sepolia-deployment\.json/,
    "missing-deployment skips should name the file the operator must create",
  );
});

test("discoverSpokeContexts: reports missing RPC env var with explicit key name", () => {
  const result = discoverSpokeContexts({
    projectRoot: FAKE_PROJECT_ROOT,
    env: {},
    chainsConfig: {
      fuji: { role: "spoke", rpcAlias: "fuji" },
    },
    loadDeployment: () => ({
      basketFactory: "0xff",
      stateRelay: "0xfd",
      usdc: "0xfc",
    }),
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].skipped, true);
  assert.match(result[0].reason, /FUJI_RPC_URL/);
});

test("discoverSpokeContexts: flags incomplete deployment config (no basketFactory or stateRelay)", () => {
  const result = discoverSpokeContexts({
    projectRoot: FAKE_PROJECT_ROOT,
    env: { FUJI_RPC_URL: "https://fuji.example" },
    chainsConfig: { fuji: { role: "spoke", rpcAlias: "fuji" } },
    loadDeployment: () => ({ usdc: "0xff" }), // missing basketFactory + stateRelay
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].skipped, true);
  assert.match(result[0].reason, /incomplete deployment config/);
});

// ── deploySpokeTwin -----------------------------------------------------------

function makeStubDeps({ extractedAddress = "0xTWIN", successOverrides = {} } = {}) {
  const calls = [];
  const castSendOnRpc = (rpcUrl, contractAddr, sig, args) => {
    calls.push({ rpcUrl, contractAddr, sig, args });
    return JSON.stringify({
      __sig: sig,
      __contract: contractAddr,
      transactionHash: `0xhash-${calls.length}`,
    });
  };
  const parseReceipt = (raw) => {
    const r = JSON.parse(raw);
    // Allow per-sig overrides for failure scenarios.
    const status = successOverrides[r.__sig] ?? "success";
    return {
      transactionHash: r.transactionHash,
      status,
      blockNumber: 1,
    };
  };
  const extractVaultAddressFromCreateVaultReceipt = () => extractedAddress;
  const redactSecrets = (msg) => msg;
  return {
    calls,
    deps: {
      castSendOnRpc,
      parseReceipt,
      extractVaultAddressFromCreateVaultReceipt,
      redactSecrets,
      stubAssetId: SPOKE_STUB_ASSET_ID,
    },
  };
}

const SPOKE = {
  chainKey: "fuji",
  rpcUrl: "https://fuji.example",
  basketFactory: "0xFuji_Factory",
  stateRelay: "0xFuji_StateRelay",
};

test("deploySpokeTwin: happy path issues createBasket -> setStateRelay -> setAssets and returns full record", () => {
  const { calls, deps } = makeStubDeps({ extractedAddress: "0xTwinAddr" });
  const record = deploySpokeTwin(
    SPOKE,
    { name: "Minestarters ML Picks", depositFeeBps: 10, redeemFeeBps: 10 },
    deps,
  );

  assert.equal(record.success, true);
  assert.equal(record.chain, "fuji");
  assert.equal(record.vaultAddress, "0xTwinAddr");
  assert.equal(record.factory, "0xFuji_Factory");
  assert.deepEqual(Object.keys(record.txHashes), [
    "createBasket",
    "setStateRelay",
    "setAssets",
  ]);

  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], {
    rpcUrl: "https://fuji.example",
    contractAddr: "0xFuji_Factory",
    sig: "createBasket(string,uint256,uint256)",
    args: ["Minestarters ML Picks", "10", "10"],
  });
  assert.deepEqual(calls[1], {
    rpcUrl: "https://fuji.example",
    contractAddr: "0xTwinAddr",
    sig: "setStateRelay(address)",
    args: ["0xFuji_StateRelay"],
  });
  assert.deepEqual(calls[2], {
    rpcUrl: "https://fuji.example",
    contractAddr: "0xTwinAddr",
    sig: "setAssets(bytes32[])",
    args: [`[${SPOKE_STUB_ASSET_ID}]`],
  });
});

test("deploySpokeTwin: returns success=false with descriptive error when createBasket reverts", () => {
  const { calls, deps } = makeStubDeps({
    successOverrides: { "createBasket(string,uint256,uint256)": "reverted" },
  });
  const record = deploySpokeTwin(
    SPOKE,
    { name: "Foo", depositFeeBps: 0, redeemFeeBps: 0 },
    deps,
  );
  assert.equal(record.success, false);
  assert.equal(calls.length, 1, "must not attempt setStateRelay if createBasket reverts");
  assert.match(record.error, /createBasket reverted on fuji/);
});

test("deploySpokeTwin: surfaces partial-failure state when setAssets reverts (twin exists but unusable)", () => {
  const { calls, deps } = makeStubDeps({
    extractedAddress: "0xPartialTwin",
    successOverrides: { "setAssets(bytes32[])": "reverted" },
  });
  const record = deploySpokeTwin(
    SPOKE,
    { name: "Foo", depositFeeBps: 0, redeemFeeBps: 0 },
    deps,
  );
  assert.equal(record.success, false);
  assert.equal(record.vaultAddress, "0xPartialTwin",
    "record must still report the twin address so the operator can recover");
  assert.equal(calls.length, 3,
    "all three steps should have been attempted before reporting failure");
  assert.match(record.error, /setAssets reverted on fuji/);
  assert.match(record.error, /0xPartialTwin/);
});

test("deploySpokeTwin: returns success=false when BasketCreated log cannot be parsed from receipt", () => {
  const { calls, deps } = makeStubDeps({ extractedAddress: null });
  const record = deploySpokeTwin(
    SPOKE,
    { name: "Foo", depositFeeBps: 0, redeemFeeBps: 0 },
    deps,
  );
  assert.equal(record.success, false);
  assert.equal(calls.length, 1, "no further calls if vault address could not be extracted");
  assert.match(record.error, /BasketCreated log not found/);
});

test("deploySpokeTwin: redacts cast errors via injected redactor", () => {
  const deps = {
    castSendOnRpc: () => {
      throw new Error("boom --private-key 0xdeadbeef leaked");
    },
    parseReceipt: () => ({ status: "success", transactionHash: "0x0" }),
    extractVaultAddressFromCreateVaultReceipt: () => "0x0",
    redactSecrets: (msg) => msg.replace(/--private-key\s+0x[0-9a-fA-F]+/, "--private-key [redacted]"),
    stubAssetId: SPOKE_STUB_ASSET_ID,
  };
  const record = deploySpokeTwin(
    SPOKE,
    { name: "Foo", depositFeeBps: 0, redeemFeeBps: 0 },
    deps,
  );
  assert.equal(record.success, false);
  assert.match(record.error, /\[redacted\]/);
  assert.doesNotMatch(record.error, /0xdeadbeef/, "raw private key must never appear in error output");
});
