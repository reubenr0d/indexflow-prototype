// Multi-chain vault creation helpers for the vault-manager MCP.
//
// Extracted from index.js so the spoke-discovery + twin-deploy plumbing can
// be unit-tested without spinning up an MCP stdio server. The actual `cast`
// invocations are injected (`castSendOnRpc`, `parseReceipt`,
// `extractVaultAddressFromCreateVaultReceipt`, `redactSecrets`) so tests can
// stub them out and exercise the orchestration logic deterministically.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// keccak256("USDC") — stub asset id used to satisfy `BasketVault.deposit`'s
// `require(assets.length > 0, "No assets configured")` check on spokes that
// have no OracleAdapter deployed (matches
// `script/DeploySpoke.s.sol::_maybeBootstrapSpokeBasket`).
export const SPOKE_STUB_ASSET_ID =
  "0xd6aca1be9729c13d677335161321649cccae6a591554772516700f986f942eaa";

export function rpcEnvKey(rpcAlias) {
  if (!rpcAlias) return null;
  return `${String(rpcAlias).toUpperCase()}_RPC_URL`;
}

export function loadChainsConfig(projectRoot) {
  const p = resolve(projectRoot, "config/chains.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

export function loadSpokeDeployment(projectRoot, chainKey) {
  const p = resolve(projectRoot, `apps/web/src/config/${chainKey}-deployment.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// Returns every spoke chain that has both a deployment config + an RPC URL.
// Spokes that are missing either are returned with `skipped: true` and a
// `reason` so the create_vault response can surface gaps without silently
// dropping chains.
export function discoverSpokeContexts({
  projectRoot,
  env = process.env,
  chainsConfig,
  loadDeployment,
} = {}) {
  const chains = chainsConfig ?? loadChainsConfig(projectRoot);
  const loader = loadDeployment ?? ((chainKey) => loadSpokeDeployment(projectRoot, chainKey));
  const ctxs = [];
  for (const [chainKey, cfg] of Object.entries(chains)) {
    if (!cfg || cfg.role !== "spoke") continue;
    // Local-anvil spokes are wired by Foundry scripts, never by the MCP.
    if (chainKey === "local" || chainKey === "local-spoke") continue;

    const spokeDeployment = loader(chainKey);
    if (!spokeDeployment) {
      ctxs.push({
        chainKey,
        skipped: true,
        reason: `no apps/web/src/config/${chainKey}-deployment.json found`,
      });
      continue;
    }

    const envKey = rpcEnvKey(cfg.rpcAlias);
    const rpcUrl = envKey ? env[envKey] : undefined;
    if (!rpcUrl) {
      ctxs.push({
        chainKey,
        skipped: true,
        reason: `no RPC URL — set ${envKey} env var`,
      });
      continue;
    }

    if (!spokeDeployment.basketFactory || !spokeDeployment.stateRelay) {
      ctxs.push({
        chainKey,
        skipped: true,
        reason: `incomplete deployment config (basketFactory/stateRelay missing)`,
      });
      continue;
    }

    ctxs.push({
      chainKey,
      rpcUrl,
      basketFactory: spokeDeployment.basketFactory,
      stateRelay: spokeDeployment.stateRelay,
      usdc: spokeDeployment.usdc,
    });
  }
  return ctxs;
}

// Deploy a twin BasketVault on a single spoke and wire it (setStateRelay +
// setAssets stub). Returns a per-twin status record; individual step failures
// surface via the `error` field so the parent tool response can show the
// operator exactly which step on which chain failed.
//
// `deps` injects the runtime helpers from index.js so this can be unit-tested
// against synthetic `castSendOnRpc` stubs.
export function deploySpokeTwin(
  spoke,
  { name, depositFeeBps, redeemFeeBps },
  deps,
) {
  const {
    castSendOnRpc,
    parseReceipt,
    extractVaultAddressFromCreateVaultReceipt,
    redactSecrets,
    stubAssetId = SPOKE_STUB_ASSET_ID,
  } = deps;

  const record = {
    chain: spoke.chainKey,
    factory: spoke.basketFactory,
    success: false,
    txHashes: {},
  };

  try {
    const createReceipt = castSendOnRpc(
      spoke.rpcUrl,
      spoke.basketFactory,
      "createBasket(string,uint256,uint256)",
      [name, String(depositFeeBps), String(redeemFeeBps)],
    );
    const createTx = parseReceipt(createReceipt);
    record.txHashes.createBasket = createTx.transactionHash;
    if (createTx.status !== "success") {
      record.error = `createBasket reverted on ${spoke.chainKey}`;
      return record;
    }
    const twinVault = extractVaultAddressFromCreateVaultReceipt(createReceipt);
    if (!twinVault) {
      record.error = `createBasket succeeded on ${spoke.chainKey} but BasketCreated log not found in receipt`;
      return record;
    }
    record.vaultAddress = twinVault;

    const stateRelayReceipt = castSendOnRpc(
      spoke.rpcUrl,
      twinVault,
      "setStateRelay(address)",
      [spoke.stateRelay],
    );
    const stateRelayTx = parseReceipt(stateRelayReceipt);
    record.txHashes.setStateRelay = stateRelayTx.transactionHash;
    if (stateRelayTx.status !== "success") {
      record.error = `setStateRelay reverted on ${spoke.chainKey}`;
      return record;
    }

    const setAssetsReceipt = castSendOnRpc(
      spoke.rpcUrl,
      twinVault,
      "setAssets(bytes32[])",
      [`[${stubAssetId}]`],
    );
    const setAssetsTx = parseReceipt(setAssetsReceipt);
    record.txHashes.setAssets = setAssetsTx.transactionHash;
    if (setAssetsTx.status !== "success") {
      record.error = `setAssets reverted on ${spoke.chainKey} (twin exists at ${twinVault} but cannot accept deposits until assets are configured)`;
      return record;
    }

    record.success = true;
    return record;
  } catch (err) {
    record.error = redactSecrets(err.message || String(err));
    return record;
  }
}
