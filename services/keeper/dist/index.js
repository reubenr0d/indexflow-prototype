import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "ethers";
import { StateRelayABI, BasketFactoryABI, ERC20ABI, VaultAccountingABI, BasketVaultABI, } from "./abi.js";
import { computeRoutingWeights } from "./computeRoutingWeights.js";
import { computeGlobalNav } from "./computeGlobalNav.js";
// KeeperHub client for reliable transaction execution
let keeperHubClient = null;
async function initKeeperHub() {
    if (process.env.KEEPERHUB_API_KEY) {
        try {
            // @ts-expect-error - ESM import without type declarations
            const { KeeperHubClient } = await import("../../../lib/keeperhub.mjs");
            keeperHubClient = KeeperHubClient.fromEnv();
            if (keeperHubClient) {
                log("[KeeperHub] Enabled for transaction execution");
            }
        }
        catch (err) {
            log(`[KeeperHub] Init failed, using direct execution: ${err.message}`);
        }
    }
}
// ── Env ───────────────────────────────────────────────────────────
const PRIVATE_KEY = requireEnv("PRIVATE_KEY");
const EPOCH_INTERVAL_MS = parseInt(process.env.EPOCH_INTERVAL_MS ?? "60000", 10);
function requireEnv(name) {
    const val = process.env[name];
    if (!val)
        throw new Error(`Missing required env var: ${name}`);
    return val;
}
// ── Bootstrap ─────────────────────────────────────────────────────
const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");
function loadChainsConfig() {
    const raw = readFileSync(resolve(PROJECT_ROOT, "config/chains.json"), "utf-8");
    return JSON.parse(raw);
}
function loadDeployment(chainName) {
    const path = resolve(PROJECT_ROOT, `apps/web/src/config/${chainName}-deployment.json`);
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
}
function getRpcUrl(chain) {
    const aliasMap = {
        sepolia: "SEPOLIA_RPC_URL",
        fuji: "FUJI_RPC_URL",
        arbitrum_sepolia: "ARBITRUM_SEPOLIA_RPC_URL",
        local: "LOCAL_RPC_URL",
    };
    const envKey = aliasMap[chain.rpcAlias];
    if (!envKey)
        throw new Error(`No RPC env mapping for alias "${chain.rpcAlias}"`);
    const url = process.env[envKey];
    if (!url)
        throw new Error(`Missing env var ${envKey} for chain alias "${chain.rpcAlias}"`);
    return url;
}
function buildChainContexts() {
    const chains = loadChainsConfig();
    const contexts = [];
    // Optional allowlist via KEEPER_CHAINS env var (comma-separated chain names
    // matching keys in config/chains.json). Empty/unset = no filter.
    const allowlist = (process.env.KEEPER_CHAINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (allowlist.length > 0) {
        log(`KEEPER_CHAINS allowlist: ${allowlist.join(", ")}`);
    }
    for (const [name, config] of Object.entries(chains)) {
        if (name === "local")
            continue;
        if (allowlist.length > 0 && !allowlist.includes(name)) {
            log(`⚠ "${name}" not in KEEPER_CHAINS allowlist, skipping`);
            continue;
        }
        let deployment;
        try {
            deployment = loadDeployment(name);
        }
        catch {
            log(`⚠ No deployment config for "${name}", skipping`);
            continue;
        }
        let rpcUrl;
        try {
            rpcUrl = getRpcUrl(config);
        }
        catch {
            log(`⚠ No RPC URL for "${name}", skipping`);
            continue;
        }
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const signer = new ethers.Wallet(PRIVATE_KEY, provider);
        contexts.push({ name, config, deployment, provider, signer });
    }
    return contexts;
}
// ── Logging ───────────────────────────────────────────────────────
function log(msg) {
    console.log(`[keeper ${new Date().toISOString()}] ${msg}`);
}
function logError(msg, err) {
    console.error(`[keeper ${new Date().toISOString()}] ${msg}`, err);
}
async function readChain(ctx) {
    const factory = new ethers.Contract(ctx.deployment.basketFactory, BasketFactoryABI, ctx.provider);
    const vaults = await factory.getAllBaskets();
    let idleUsdc = 0n;
    let perpAllocated = 0n;
    for (const vault of vaults) {
        const usdc = new ethers.Contract(ctx.deployment.usdc, ERC20ABI, ctx.provider);
        const balance = await usdc.balanceOf(vault);
        idleUsdc += balance;
        try {
            const bv = new ethers.Contract(vault, BasketVaultABI, ctx.provider);
            const alloc = await bv.perpAllocated();
            perpAllocated += alloc;
        }
        catch {
            // perpAllocated may not exist on spoke vaults
        }
    }
    let hubPnL = null;
    if (ctx.config.role === "hub" && ctx.deployment.vaultAccounting) {
        const accounting = new ethers.Contract(ctx.deployment.vaultAccounting, VaultAccountingABI, ctx.provider);
        let totalUnrealised = 0n;
        let totalRealised = 0n;
        for (const vault of vaults) {
            const [unrealised, realised] = await accounting.getVaultPnL(vault);
            totalUnrealised += unrealised;
            totalRealised += realised;
        }
        hubPnL = { unrealised: totalUnrealised, realised: totalRealised };
    }
    return { ctx, vaults, idleUsdc, perpAllocated, hubPnL };
}
// ── Write phase ───────────────────────────────────────────────────
// ABI for KeeperHub execution (JSON format)
const STATE_RELAY_ABI_FOR_KEEPERHUB = [
    {
        inputs: [
            { name: "chains", type: "uint64[]" },
            { name: "weights", type: "uint256[]" },
            { name: "amounts", type: "uint256[]" },
            { name: "vaults", type: "address[]" },
            { name: "pnlAdjustments", type: "int256[]" },
            { name: "ts", type: "uint48" },
        ],
        name: "updateState",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
];
async function writeStateUpdateViaKeeperHub(ctx, chains, weights, amounts, vaults, pnlAdjustments, ts) {
    if (!ctx.deployment.stateRelay) {
        log(`  ⚠ No stateRelay deployed on ${ctx.name}, skipping write`);
        return false;
    }
    try {
        log(`  → [KeeperHub] Sending updateState to ${ctx.name} (${vaults.length} vaults)`);
        const result = await keeperHubClient.executeAndWait({
            network: ctx.config.rpcAlias,
            contractAddress: ctx.deployment.stateRelay,
            functionName: "updateState",
            functionArgs: [
                chains.map(c => c.toString()),
                weights.map(w => w.toString()),
                amounts.map(a => a.toString()),
                vaults,
                pnlAdjustments.map(p => p.toString()),
                ts.toString(),
            ],
            abi: STATE_RELAY_ABI_FOR_KEEPERHUB,
            justification: `StateRelay update: ${vaults.length} vaults, ${chains.length} chains`,
        }, {
            onPoll: (status, attempt) => {
                if (attempt > 0 && attempt % 10 === 0) {
                    log(`  [KeeperHub] ${ctx.name} still pending... status=${status.status}`);
                }
            },
        });
        if (result.success) {
            log(`  ✓ [KeeperHub] ${ctx.name} updateState confirmed: ${result.transactionHash}`);
            return true;
        }
        else {
            logError(`  ✗ [KeeperHub] ${ctx.name} updateState failed`, result.error);
            return false;
        }
    }
    catch (err) {
        logError(`  ✗ [KeeperHub] ${ctx.name} error`, err);
        return false;
    }
}
async function writeStateUpdateDirect(ctx, chains, weights, amounts, vaults, pnlAdjustments, ts) {
    if (!ctx.deployment.stateRelay) {
        log(`  ⚠ No stateRelay deployed on ${ctx.name}, skipping write`);
        return;
    }
    const relay = new ethers.Contract(ctx.deployment.stateRelay, StateRelayABI, ctx.signer);
    log(`  → Sending updateState to ${ctx.name} (${vaults.length} vaults)`);
    const tx = await relay.updateState(chains, weights, amounts, vaults, pnlAdjustments, ts);
    const receipt = await tx.wait();
    log(`  ✓ ${ctx.name} updateState confirmed in block ${receipt?.blockNumber}`);
}
// Optional per-chain KeeperHub allowlist. Empty/unset (default) means "use
// KeeperHub on every chain when KEEPERHUB_API_KEY is set". When set (e.g.
// "sepolia"), only the listed chains route through KeeperHub; the rest fall
// back to direct ethers signing with PRIVATE_KEY. Useful when StateRelay
// instances on different chains have different keeper() addresses.
function shouldUseKeeperHubFor(chainName) {
    if (!keeperHubClient)
        return false;
    const allowlist = (process.env.KEEPERHUB_CHAINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (allowlist.length === 0)
        return true;
    return allowlist.includes(chainName);
}
async function writeStateUpdate(ctx, chains, weights, amounts, vaults, pnlAdjustments, ts) {
    if (shouldUseKeeperHubFor(ctx.name)) {
        await writeStateUpdateViaKeeperHub(ctx, chains, weights, amounts, vaults, pnlAdjustments, ts);
    }
    else {
        await writeStateUpdateDirect(ctx, chains, weights, amounts, vaults, pnlAdjustments, ts);
    }
}
// ── Epoch ─────────────────────────────────────────────────────────
async function runEpoch(contexts) {
    log("─── Epoch start ───");
    // Read phase: query all chains in parallel
    const readResults = await Promise.all(contexts.map(readChain));
    for (const r of readResults) {
        log(`  ${r.ctx.name}: ${r.vaults.length} vaults, idle=${ethers.formatUnits(r.idleUsdc, 6)} USDC` +
            (r.hubPnL
                ? `, hubPnL=(u:${ethers.formatUnits(r.hubPnL.unrealised, 6)}, r:${ethers.formatUnits(r.hubPnL.realised, 6)})`
                : ""));
    }
    // Compute routing weights
    const chainReserves = readResults.map((r) => ({
        chainSelector: BigInt(r.ctx.config.ccipChainSelector),
        idleUsdc: r.idleUsdc,
    }));
    const routingWeights = computeRoutingWeights(chainReserves);
    log("  Routing weights:");
    for (const w of routingWeights) {
        log(`    chain ${w.chainSelector}: ${w.weightBps} bps`);
    }
    // Compute global NAV adjustments
    const hubResult = readResults.find((r) => r.ctx.config.role === "hub");
    const hubPnLTotal = hubResult?.hubPnL
        ? hubResult.hubPnL.unrealised + hubResult.hubPnL.realised
        : 0n;
    const hubPerpAllocated = hubResult?.perpAllocated ?? 0n;
    const chainDeposits = readResults.map((r) => ({
        chainSelector: BigInt(r.ctx.config.ccipChainSelector),
        idleUsdc: r.idleUsdc,
        isHub: r.ctx.config.role === "hub",
    }));
    const pnlAdjustments = computeGlobalNav(chainDeposits, hubPerpAllocated, hubPnLTotal);
    log("  PnL adjustments:");
    for (const a of pnlAdjustments) {
        log(`    chain ${a.chainSelector}: ${ethers.formatUnits(a.pnlAdjustment, 6)} USDC`);
    }
    // Build tx params (same for every chain's StateRelay)
    const chains = routingWeights.map((w) => w.chainSelector);
    const weights = routingWeights.map((w) => w.weightBps);
    const ts = Math.floor(Date.now() / 1000);
    // Build amounts array (idle USDC per chain, in same order as chains)
    const amounts = chains.map((chainSel) => {
        const result = readResults.find((r) => BigInt(r.ctx.config.ccipChainSelector) === chainSel);
        return result?.idleUsdc ?? 0n;
    });
    log("  Idle USDC amounts:");
    for (let i = 0; i < chains.length; i++) {
        log(`    chain ${chains[i]}: ${ethers.formatUnits(amounts[i], 6)} USDC`);
    }
    // Collect all vaults and their PnL adjustments across chains.
    // Each vault on a given chain gets that chain's pnlAdjustment.
    const allVaults = [];
    const allPnl = [];
    for (const r of readResults) {
        const chainAdj = pnlAdjustments.find((a) => a.chainSelector === BigInt(r.ctx.config.ccipChainSelector));
        const adj = chainAdj?.pnlAdjustment ?? 0n;
        for (const vault of r.vaults) {
            allVaults.push(vault);
            allPnl.push(adj);
        }
    }
    // Write phase: post state to every chain's StateRelay
    const writePromises = contexts.map((ctx) => writeStateUpdate(ctx, chains, weights, amounts, allVaults, allPnl, ts).catch((err) => {
        logError(`Failed to update ${ctx.name}`, err);
    }));
    await Promise.all(writePromises);
    log("─── Epoch complete ───\n");
}
// ── Main loop ─────────────────────────────────────────────────────
async function main() {
    log("Keeper starting...");
    log(`Epoch interval: ${EPOCH_INTERVAL_MS}ms`);
    // Initialize KeeperHub if configured
    await initKeeperHub();
    const contexts = buildChainContexts();
    if (contexts.length === 0) {
        throw new Error("No chain contexts available. Check config/chains.json and deployment files.");
    }
    log(`Active chains: ${contexts.map((c) => c.name).join(", ")}`);
    if (keeperHubClient) {
        const khChains = contexts
            .filter((c) => shouldUseKeeperHubFor(c.name))
            .map((c) => c.name);
        const directChains = contexts
            .filter((c) => !shouldUseKeeperHubFor(c.name))
            .map((c) => c.name);
        log(`KeeperHub chains: ${khChains.length > 0 ? khChains.join(", ") : "(none)"}`);
        if (directChains.length > 0) {
            log(`Direct-execution chains: ${directChains.join(", ")}`);
        }
    }
    // Run first epoch immediately
    await runEpoch(contexts);
    const runOnce = process.env.KEEPER_ONCE === "1" || process.env.KEEPER_ONCE === "true";
    if (runOnce) {
        log("KEEPER_ONCE set — exiting after one epoch.");
        process.exit(0);
    }
    setInterval(() => {
        runEpoch(contexts).catch((err) => {
            logError("Epoch failed", err);
        });
    }, EPOCH_INTERVAL_MS);
}
main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map