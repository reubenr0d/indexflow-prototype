#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { classifySymbolWithSearch, symbolPolicyMessage } from "../../shared/yahoo-symbol-policy.mjs";
import {
  fetchLivePriceUsd,
  validateSeedPriceUsd,
  SEED_PRICE_MAX_DEVIATION_BPS,
} from "../../shared/yahoo-usd-quote.mjs";
import { redactSecrets } from "../../../scripts/lib/redact-secrets.mjs";
import {
  SPOKE_STUB_ASSET_ID,
  discoverSpokeContexts as discoverSpokeContextsImpl,
  deploySpokeTwin as deploySpokeTwinImpl,
} from "./multichain-create.mjs";
import { classifyAssetIds } from "./set-vault-assets-validation.mjs";
import { validateAddress, validateBytes32, validateArgs } from "./address-validation.mjs";
import { decodeCastRevert } from "./revert-decoder.mjs";
import { computePositionPnl, PNL_BAND_DEFAULTS } from "./position-pnl.mjs";
import {
  checkChurnGuard,
  CHURN_GUARD_WINDOW_MS,
} from "../../shared/agent-shared-memory.mjs";

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const DEPLOYMENT_CONFIG = process.env.DEPLOYMENT_CONFIG ?? "apps/web/src/config/sepolia-deployment.json";
const RPC_URL = process.env.RPC_URL ?? "sepolia";
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const PROJECT_ROOT = process.env.PROJECT_ROOT ?? process.cwd();

// PnL band thresholds used to flag each position's `pnlBandOutcome`.
// Operators can override per-deployment; defaults match the mining-manager
// agent's `[-6%, +8%]` band so the deterministic auto-exit pass in the
// runner agrees with the agent prompt by default.
function parseBandEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 1) return fallback;
  return n;
}
const PNL_BAND_TP_PCT = parseBandEnv("MCP_PNL_BAND_TP_PCT", PNL_BAND_DEFAULTS.takeProfitPct);
const PNL_BAND_SL_PCT = parseBandEnv("MCP_PNL_BAND_SL_PCT", PNL_BAND_DEFAULTS.stopLossPct);

// Churn-guard configuration. The window defaults to CHURN_GUARD_WINDOW_MS
// (4h) from the shared-memory module; operators can shorten it for testing
// via AGENT_CHURN_GUARD_WINDOW_MS or disable the guard entirely with
// AGENT_CHURN_GUARD_DISABLED=1.
const CHURN_GUARD_DISABLED = ["1", "true", "yes"].includes(
  String(process.env.AGENT_CHURN_GUARD_DISABLED || "").toLowerCase().trim(),
);
const CHURN_GUARD_WINDOW_MS_OVERRIDE = (() => {
  const raw = process.env.AGENT_CHURN_GUARD_WINDOW_MS;
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
})();
const EFFECTIVE_CHURN_GUARD_WINDOW_MS =
  CHURN_GUARD_WINDOW_MS_OVERRIDE ?? CHURN_GUARD_WINDOW_MS;

// ---------------------------------------------------------------------------
// On-chain perp engine constants (GMX fork, deployed via script/Deploy.s.sol)
// ---------------------------------------------------------------------------
//
// These mirror the GMX `Vault` constants surfaced in `VaultUtils.validateLiquidation`:
//   - `liquidationFeeUsd = 5e30` ($5) → any position opened with collateral
//     below ~$5 (after the opening margin fee) reverts with
//     `Vault: liquidation fees exceed collateral`. We require a 2x buffer
//     ($10) by default so a small adverse move at open time still clears the
//     check.
//   - `maxLeverage = 500_000` (50x) → positions where
//     `size / remainingCollateral > 50` revert with `Vault: maxLeverage exceeded`.
//   - GMX position state is denominated in USD at 1e30 per $1; raw USDC is
//     6 decimals, so `raw_usdc * 1e24 = gmx_usd`.
const MIN_COLLATERAL_USDC_RAW = 10_000_000n; // $10 — 2x the on-chain $5 liquidationFeeUsd buffer.
const CHAIN_MAX_LEVERAGE = 50; // matches GMX `maxLeverage = 500_000` (`/1e4`).
const USDC_TO_GMX_USD_SCALE = 10n ** 24n; // raw USDC (6 dec) * 1e24 = GMX-USD (1e30).
const LIQUIDATION_FEE_USD = "5"; // $5 — surfaced in plan_open_position responses.

// Spoke discovery + twin-deploy helpers live in `./multichain-create.mjs` so
// they can be unit-tested without spawning the MCP. `discoverSpokeContexts`
// here is just a thin wrapper that binds the current PROJECT_ROOT + env.
function deploymentPath() {
  const p = DEPLOYMENT_CONFIG;
  return isAbsolute(p) ? p : resolve(PROJECT_ROOT, p);
}

let _deployment = null;
function deployment() {
  if (!_deployment) {
    const p = deploymentPath();
    if (!existsSync(p)) throw new Error(`Deployment config not found: ${p}`);
    _deployment = JSON.parse(readFileSync(p, "utf8"));
  }
  return _deployment;
}

function discoverSpokeContexts() {
  return discoverSpokeContextsImpl({ projectRoot: PROJECT_ROOT, env: process.env });
}

// ---------------------------------------------------------------------------
// Unit formatting helpers
// ---------------------------------------------------------------------------

function parseCastBigInt(raw) {
  const value = String(raw ?? "").trim();
  const stripped = value.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
  if (!stripped) throw new Error(`Cannot parse empty numeric value from cast output: "${value}"`);
  if (/^-?\d+$/.test(stripped)) return BigInt(stripped);
  if (/^-?0x[0-9a-fA-F]+$/.test(stripped)) return BigInt(stripped);
  throw new Error(`Cannot parse integer from cast output: "${value}"`);
}

function formatUsdc(raw) {
  const n = Number(parseCastBigInt(raw)) / 1e6;
  return n.toFixed(2);
}

function formatSignedUsdc(value) {
  const big = typeof value === "bigint" ? value : parseCastBigInt(value);
  const n = Number(big) / 1e6;
  const abs = Math.abs(n).toFixed(2);
  if (big > 0n) return `+${abs}`;
  if (big < 0n) return `-${abs}`;
  return abs;
}

// Parse a cast-formatted multi-value tuple such as `(int256,int256)` into an
// array of signed BigInts. Cast emits each tuple member on its own line, with
// an optional ` [hex]` annotation that `parseCastBigInt` already strips.
function parseSignedTupleInt256(raw) {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => parseCastBigInt(line));
}

function formatSharePrice(raw) {
  const n = Number(parseCastBigInt(raw)) / 1e30;
  return n.toFixed(6);
}

function formatBps(raw) {
  const n = Number(raw);
  return `${(n / 100).toFixed(2)}%`;
}

function formatOraclePrice8(raw) {
  const n = Number(parseCastBigInt(raw)) / 1e8;
  return n.toFixed(4);
}

function parseIntSafe(hex) {
  return parseInt(hex, 10) || parseInt(hex, 16) || 0;
}

function stripQuotes(s) {
  return s.replace(/^"|"$/g, "");
}

let _yf = null;
async function yf() {
  if (!_yf) {
    const mod = await import("yahoo-finance2");
    const YahooFinance = mod.default;
    _yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  }
  return _yf;
}

async function getSearchRows(symbol) {
  const client = await yf();
  try {
    const raw = await client.search(symbol, { quotesCount: 20, newsCount: 0 }, { validateResult: false });
    return (raw.quotes ?? [])
      .filter((quote) => "symbol" in quote)
      .map((quote) => ({
        symbol: quote.symbol,
        quoteType: quote.quoteType ?? "",
        exchange: quote.exchDisp ?? quote.exchange ?? "",
        name: quote.longname ?? quote.shortname ?? "",
      }));
  } catch {
    return [];
  }
}

async function validateWriteSymbolPolicy(symbol) {
  const rows = await getSearchRows(symbol);
  const classification = classifySymbolWithSearch(symbol, rows);
  if (!classification.allowed) {
    const err = new Error(symbolPolicyMessage(classification));
    err.code = "INVALID_SYMBOL_POLICY";
    err.classification = classification;
    throw err;
  }
  return classification;
}

// ---------------------------------------------------------------------------
// Structured error helper
// ---------------------------------------------------------------------------

function toolError(code, message, recoveryHint) {
  const payload = {
    success: false,
    error_code: code,
    message: redactSecrets(message),
  };
  if (recoveryHint) payload.recovery_hint = recoveryHint;
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Cast helpers
// ---------------------------------------------------------------------------

// Cast subprocess helpers.
//
// SECURITY: Foundry's `cast` (verified against v1.3.1) does NOT read
// `ETH_PRIVATE_KEY` from the environment for `--private-key`; only the
// `--keystore` / `--account` / `--password` options have env support
// (`ETH_KEYSTORE` / `ETH_KEYSTORE_ACCOUNT` / `ETH_PASSWORD`). For the raw
// private key we therefore have to pass `--private-key <hex>` on argv. When
// the child exits non-zero, Node's `execFileSync` embeds the full argv —
// including the key — into `Error.message`. The `runCast` wrapper below pipes
// every such error through `redactSecrets`, which (a) replaces any literal
// occurrence of `PRIVATE_KEY` / `ETH_PRIVATE_KEY` / `KEEPER_PRIVATE_KEY` from
// the runner env and (b) scrubs the generic `--private-key 0x[64hex]` flag
// pattern. Combined with the agent runner's redaction of every text path
// that leaves the runner (MCP responses, OpenAI messages, run-log committed
// back to git, agent-metadata file), the secret never reaches any external
// surface. GitHub Actions also masks the literal secret value in runner logs
// independently of the redactor.
function runCast(args) {
  try {
    const out = execFileSync("cast", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.trim();
  } catch (err) {
    const safeMessage = redactSecrets(err.message || String(err));
    const wrapped = new Error(safeMessage);
    if (err.code) wrapped.code = err.code;
    throw wrapped;
  }
}

function castCall(contractAddr, sig, args = []) {
  return runCast(["call", contractAddr, sig, ...args, "--rpc-url", RPC_URL]);
}

function castSend(contractAddr, sig, args = []) {
  return castSendOnRpc(RPC_URL, contractAddr, sig, args);
}

// Per-RPC `cast send`, used by the multi-chain `create_vault` flow to deploy +
// wire twin baskets on every configured spoke without re-spawning the MCP per
// chain. The deployer wallet (`PRIVATE_KEY`) is the same across all chains.
function castSendOnRpc(rpcUrl, contractAddr, sig, args = []) {
  if (!PRIVATE_KEY) {
    throw Object.assign(new Error("PRIVATE_KEY is required for write operations"), { code: "NO_PRIVATE_KEY" });
  }
  return runCast([
    "send", contractAddr, sig, ...args,
    "--private-key", PRIVATE_KEY,
    "--rpc-url", rpcUrl,
    "--json",
  ]);
}

function parseReceipt(rawJson) {
  try {
    const r = JSON.parse(rawJson);
    const st = r.status;
    const ok = st === "0x1" || st === 1 || st === "0x01";
    return {
      transactionHash: r.transactionHash,
      status: ok ? "success" : "reverted",
      blockNumber: r.blockNumber != null && r.blockNumber !== "" ? parseIntSafe(r.blockNumber) : null,
      gasUsed: r.gasUsed ?? null,
    };
  } catch {
    return { transactionHash: null, status: "unknown", raw: rawJson };
  }
}

const BASKET_CREATED_TOPIC =
  "0xdd8d0dea78c92dc9118b2f6db8e1467c0b543dc8fdc4251fdce2ba2352b44d16";

function topicToAddress(topic) {
  if (typeof topic !== "string" || !topic.startsWith("0x") || topic.length !== 66) return null;
  return `0x${topic.slice(-40)}`;
}

function extractVaultAddressFromCreateVaultReceipt(rawJson) {
  try {
    const receipt = JSON.parse(rawJson);
    const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
    for (const log of logs) {
      const topics = Array.isArray(log?.topics) ? log.topics : [];
      if (
        topics.length >= 3 &&
        String(topics[0]).toLowerCase() === BASKET_CREATED_TOPIC &&
        typeof topics[2] === "string"
      ) {
        return topicToAddress(topics[2]);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function writeResult(rawReceipt, nextSteps, justification) {
  const tx = parseReceipt(rawReceipt);
  const result = { success: tx.status === "success", ...tx };
  if (justification) result.justification = justification;
  if (nextSteps) result.next_steps = nextSteps;
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

function writeError(err) {
  if (err.code === "NO_PRIVATE_KEY") {
    return toolError("NO_PRIVATE_KEY", err.message,
      "Set PRIVATE_KEY env var. Read-only tools (get_*) still work without it.");
  }
  const msg = err.message || String(err);

  // Decode the embedded revert payload (`data: "0x..."`) emitted by foundry
  // when the EVM reverts. This gives the LLM a structured `error_code` like
  // `MAPPING_ALREADY_EXISTS` / `INSUFFICIENT_CAPITAL` instead of opaque
  // selector hex.
  const decoded = decodeCastRevert(msg);
  if (decoded?.matched) {
    const payload = {
      success: false,
      error_code: decoded.error_code,
      message: decoded.message,
      reverted_with: decoded.name,
      selector: decoded.selector,
      raw: redactSecrets(msg),
    };
    if (decoded.args) payload.args = decoded.args;
    if (decoded.reason) payload.reason = decoded.reason;
    if (decoded.panicCode) payload.panicCode = decoded.panicCode;
    if (decoded.recovery_hint) payload.recovery_hint = decoded.recovery_hint;
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      isError: true,
    };
  }
  if (decoded && !decoded.matched) {
    return toolError(
      "TX_REVERTED",
      `Transaction reverted with unknown selector ${decoded.selector}. Raw: ${msg}`,
      "Selector is not in vault-manager's known-error table. Use get_vault_state / get_position_tracking / get_oracle_assets to inspect on-chain state before retrying.",
    );
  }

  if (msg.includes("revert") || msg.includes("execution reverted")) {
    return toolError("TX_REVERTED", msg,
      "Transaction reverted. Use get_vault_state to check reserves, ownership, and asset configuration before retrying.");
  }
  return toolError("TX_FAILED", msg);
}

// Helper: validate {vault, assetId, ...} args before any cast call. Returns
// an MCP tool response when an arg is malformed, or null when all pass.
function checkArgs(specs) {
  const violation = validateArgs(specs);
  if (!violation) return null;
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: false,
        error_code: "INVALID_ARGUMENT",
        message: `Argument "${violation.name}" failed validation: ${violation.reason}`,
        argName: violation.name,
        argKind: violation.kind,
        argValue: violation.value,
        recovery_hint:
          violation.kind === "address"
            ? "Pass a 0x-prefixed 20-byte hex string (40 hex chars). Common cause: the LLM concatenated parts of two hex strings; re-read the canonical vault address from agent state / get_all_vaults."
            : "Pass a 0x-prefixed 32-byte hex string (64 hex chars). Use get_oracle_assets to fetch the canonical assetId for the symbol.",
      }, null, 2),
    }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "vault-manager",
  version: "1.0.0",
});

// ── On-Chain Read Tools ─────────────────────────────────────────────────────

function readVaultSummary(vaultAddr, d) {
  const name = stripQuotes(castCall(vaultAddr, "name()(string)"));
  const sharePrice = castCall(vaultAddr, "getSharePrice()(uint256)");
  const nav = castCall(vaultAddr, "getPricingNav()(uint256)");
  const assetCount = castCall(vaultAddr, "getAssetCount()(uint256)");
  const perpAllocated = castCall(vaultAddr, "perpAllocated()(uint256)");
  const maxPerpAlloc = castCall(vaultAddr, "maxPerpAllocation()(uint256)");
  const minReserveBps = castCall(vaultAddr, "minReserveBps()(uint256)");
  const availablePerp = castCall(vaultAddr, "getAvailableForPerpUsdc()(uint256)");
  const requiredReserve = castCall(vaultAddr, "getRequiredReserveUsdc()(uint256)");
  const collectedFees = castCall(vaultAddr, "collectedFees()(uint256)");
  const depositFeeBps = castCall(vaultAddr, "depositFeeBps()(uint256)");
  const redeemFeeBps = castCall(vaultAddr, "redeemFeeBps()(uint256)");
  const shareToken = castCall(vaultAddr, "shareToken()(address)");
  const totalSupply = castCall(shareToken, "totalSupply()(uint256)");

  const count = parseIntSafe(assetCount);
  const assets = [];
  for (let i = 0; i < count; i++) {
    assets.push(castCall(vaultAddr, "getAssetAt(uint256)(bytes32)", [String(i)]));
  }

  let pnl = null;
  if (d?.vaultAccounting) {
    try {
      const pnlRaw = castCall(d.vaultAccounting, "getVaultPnL(address)(int256,int256)", [vaultAddr]);
      const stateRaw = castCall(d.vaultAccounting, "getVaultState(address)((uint256,int256,uint256,uint256,uint256,bool))", [vaultAddr]);
      pnl = { raw: pnlRaw, state: stateRaw };
    } catch { /* vault may not be registered */ }
  }

  return {
    name,
    address: vaultAddr,
    sharePrice,
    sharePrice_usd: formatSharePrice(sharePrice),
    nav,
    nav_usdc: formatUsdc(nav),
    totalSupply,
    totalSupply_usdc: formatUsdc(totalSupply),
    assetCount: count,
    assets,
    perpAllocated,
    perpAllocated_usdc: formatUsdc(perpAllocated),
    maxPerpAllocation: maxPerpAlloc,
    maxPerpAllocation_usdc: formatUsdc(maxPerpAlloc),
    minReserveBps,
    minReserve_pct: formatBps(minReserveBps),
    availableForPerp: availablePerp,
    availableForPerp_usdc: formatUsdc(availablePerp),
    requiredReserve,
    requiredReserve_usdc: formatUsdc(requiredReserve),
    collectedFees,
    collectedFees_usdc: formatUsdc(collectedFees),
    depositFeeBps,
    depositFee_pct: formatBps(depositFeeBps),
    redeemFeeBps,
    redeemFee_pct: formatBps(redeemFeeBps),
    pnl,
  };
}

server.registerTool(
  "get_all_vaults",
  {
    title: "Get All Vaults",
    description:
      "List all basket vault addresses and names from the BasketFactory. " +
      "Returns {count, vaults: [{index, address, name}]}. " +
      "Call this first to discover vault addresses, then use get_vault_state for detailed state or get_all_vault_states for a full summary of every vault.",
    inputSchema: {},
  },
  async () => {
    try {
      const d = deployment();
      const count = parseIntSafe(castCall(d.basketFactory, "getBasketCount()(uint256)"));

      const vaults = [];
      for (let i = 0; i < count; i++) {
        const addr = castCall(d.basketFactory, "baskets(uint256)(address)", [String(i)]);
        const name = stripQuotes(castCall(addr, "name()(string)"));
        vaults.push({ index: i, address: addr, name });
      }
      return { content: [{ type: "text", text: JSON.stringify({ count, vaults }, null, 2) }] };
    } catch (err) {
      return toolError("READ_FAILED", err.message,
        "Check that RPC_URL and DEPLOYMENT_CONFIG are correct and the chain is reachable.");
    }
  },
);

server.registerTool(
  "get_vault_state",
  {
    title: "Get Vault State",
    description:
      "Get detailed state of a single BasketVault including NAV, share price, asset list, fee config, reserve health, and perp allocation. " +
      "Returns human-readable companion fields (_usdc, _pct, _usd) alongside raw values; all USDC values (NAV, perpAllocated, idle, reserves, fees) are 6-decimal. " +
      "The optional `pnl` sub-object embeds the raw `VaultAccounting.getVaultPnL` tuple and `getVaultState` struct (see `get_vault_pnl` for full unit notes); both PnL legs are USDC 6-dec. " +
      "Use get_all_vaults first to discover vault addresses. For PnL details with formatted USD companions, see also get_vault_pnl.",
    inputSchema: {
      vault: z.string().describe("BasketVault contract address (0x...)"),
    },
  },
  async ({ vault }) => {
    const argErr = checkArgs([{ name: "vault", value: vault, kind: "address" }]);
    if (argErr) return argErr;
    try {
      const d = deployment();
      const state = readVaultSummary(vault, d);
      return { content: [{ type: "text", text: JSON.stringify(state, null, 2) }] };
    } catch (err) {
      return toolError("READ_FAILED", err.message,
        "Verify the vault address is correct. Use get_all_vaults to list valid addresses.");
    }
  },
);

server.registerTool(
  "get_all_vault_states",
  {
    title: "Get All Vault States",
    description:
      "Batch read: returns a full state summary for every vault in the factory in a single call. " +
      "Includes NAV, share price, PnL, asset count, reserve health, and perp allocation per vault with human-readable companion fields. " +
      "More efficient than calling get_all_vaults + get_vault_state in a loop. " +
      "Use get_position_tracking afterward if you need per-position details for a specific vault.",
    inputSchema: {},
  },
  async () => {
    try {
      const d = deployment();
      const count = parseIntSafe(castCall(d.basketFactory, "getBasketCount()(uint256)"));

      const vaults = [];
      for (let i = 0; i < count; i++) {
        const addr = castCall(d.basketFactory, "baskets(uint256)(address)", [String(i)]);
        try {
          vaults.push(readVaultSummary(addr, d));
        } catch (err) {
          vaults.push({ address: addr, error: err.message });
        }
      }
      return { content: [{ type: "text", text: JSON.stringify({ count, vaults }, null, 2) }] };
    } catch (err) {
      return toolError("READ_FAILED", err.message,
        "Check that RPC_URL and DEPLOYMENT_CONFIG are correct and the chain is reachable.");
    }
  },
);

server.registerTool(
  "get_vault_pnl",
  {
    title: "Get Vault PnL",
    description:
      "Get unrealised and realised PnL for a vault from `VaultAccounting.getVaultPnL(vault)`. " +
      "Both `unrealised` and `realised` are signed int256 values in USDC 6-decimal units " +
      "(divide by 1e6 to get USD; positive = profit, negative = loss). " +
      "The response includes `pnl_usdc: { unrealised_usdc, realised_usdc, net_usdc }` with already-converted human-readable signed USD strings. " +
      "Also returns `vaultAccountingState` from `getVaultState(vault)` whose fields are: " +
      "`depositedCapital` (USDC 6-dec), `realisedPnL` (signed USDC 6-dec, matches `realised`), " +
      "`openInterest` (USDC 6-dec aggregate notional), `collateralLocked` (USDC 6-dec), " +
      "`positionCount` (raw uint), and `registered` (bool). " +
      "Use get_vault_state first for the vault's general state. Use get_position_tracking for per-position details.",
    inputSchema: {
      vault: z.string().describe("BasketVault contract address (0x...)"),
    },
  },
  async ({ vault }) => {
    const argErr = checkArgs([{ name: "vault", value: vault, kind: "address" }]);
    if (argErr) return argErr;
    try {
      const d = deployment();
      const pnlRaw = castCall(d.vaultAccounting, "getVaultPnL(address)(int256,int256)", [vault]);
      const stateRaw = castCall(d.vaultAccounting, "getVaultState(address)((uint256,int256,uint256,uint256,uint256,bool))", [vault]);

      let pnlUsdc = null;
      try {
        const [unrealised, realised] = parseSignedTupleInt256(pnlRaw);
        pnlUsdc = {
          unrealised_usdc: formatSignedUsdc(unrealised),
          realised_usdc: formatSignedUsdc(realised),
          net_usdc: formatSignedUsdc(unrealised + realised),
        };
      } catch {
        // If parsing fails, leave pnl_usdc null and let the caller fall back to raw.
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            pnl: pnlRaw,
            pnl_usdc: pnlUsdc,
            vaultAccountingState: stateRaw,
          }, null, 2),
        }],
      };
    } catch (err) {
      return toolError("READ_FAILED", err.message,
        "The vault may not be registered in VaultAccounting. Use get_vault_state to check.");
    }
  },
);

server.registerTool(
  "get_oracle_assets",
  {
    title: "Get Oracle Assets",
    description:
      "List all assets configured in the OracleAdapter with their symbols, on-chain prices (8-decimal raw + human-readable USD), " +
      "active status, and feed type (1 = CustomRelayer for Yahoo Finance). " +
      "Returns {count, summary: {symbols, activeSymbols}, assets: [{index, assetId, symbol, price, price_usd, active, feedType}]}. " +
      "Use the assetId values from this response in set_vault_assets, open_position, and close_position. " +
      "When you only need to check whether a symbol is already wired, pass `compact: true` to get back just {count, summary} (~1.5 KB at 26 assets) " +
      "so the response fits in the agent tool-response budget without truncating tail entries.",
    inputSchema: {
      compact: z.boolean().optional().describe(
        "When true, omit per-asset price/feedType detail and return only {count, summary: {symbols, activeSymbols, symbolToAssetId}}. " +
        "Use this for the 'is X already wired?' check before wire_asset; it preserves visibility of every asset even when the full list would exceed the tool-response truncation budget."
      ),
    },
  },
  async ({ compact } = {}) => {
    try {
      const d = deployment();
      const count = parseIntSafe(castCall(d.oracleAdapter, "getAssetCount()(uint256)"));

      const assets = [];
      const symbols = [];
      const activeSymbols = [];
      const symbolToAssetId = {};
      for (let i = 0; i < count; i++) {
        const assetId = castCall(d.oracleAdapter, "assetList(uint256)(bytes32)", [String(i)]);
        const configRaw = castCall(
          d.oracleAdapter,
          "getAssetConfig(bytes32)((address,uint8,uint256,uint256,uint8,bool))",
          [assetId],
        );
        const symbol = stripQuotes(castCall(d.oracleAdapter, "assetSymbols(bytes32)(string)", [assetId]));

        const activeMatch = configRaw.match(/,\s*(true|false)\s*\)/);
        const active = activeMatch ? activeMatch[1] === "true" : false;

        const feedTypeMatch = configRaw.match(/,\s*(\d+)\s*,/);
        const feedType = feedTypeMatch ? parseInt(feedTypeMatch[1], 10) : -1;

        symbols.push(symbol);
        symbolToAssetId[symbol] = assetId;
        if (active) activeSymbols.push(symbol);

        if (compact) continue;

        let price = null;
        let price_usd = null;
        try {
          price = castCall(d.oracleAdapter, "getPrice(bytes32)(uint256)", [assetId]);
          price_usd = formatOraclePrice8(price);
        } catch { /* price may not be set yet */ }

        assets.push({ index: i, assetId, symbol, price, price_usd, active, feedType });
      }

      const summary = { symbols, activeSymbols, symbolToAssetId };
      const payload = compact
        ? { count, summary }
        : { count, summary, assets };

      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    } catch (err) {
      return toolError("READ_FAILED", err.message,
        "Check that RPC_URL and DEPLOYMENT_CONFIG are correct and the chain is reachable.");
    }
  },
);

function parseTrackingTuple(raw) {
  // cast call returns the tuple either as a single parenthesized line like
  //   "(0xvault, 0xasset, true, 100000000, 1000000, 1000000, 2100e30, 0, true)"
  // or as a multi-line ABI-decoded list. We normalise both into structured fields.
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let inner = text;
  if (text.startsWith("(") && text.endsWith(")")) {
    inner = text.slice(1, -1);
  }
  const parts = inner
    .split(/\r?\n|,/)
    .map((s) => s.replace(/\s*\[[^\]]+\]\s*$/, "").trim())
    .filter(Boolean);
  if (parts.length < 9) return null;
  const [vaultAddr, assetId, isLongRaw, sizeRaw, collateralRaw, collateralUsdcRaw, averagePriceRaw, entryFundingRaw, existsRaw] = parts;
  const toBigInt = (v) => {
    try { return parseCastBigInt(v).toString(); } catch { return "0"; }
  };
  return {
    vault: vaultAddr.toLowerCase(),
    asset: assetId.toLowerCase(),
    isLong: /^true$/i.test(isLongRaw),
    size: toBigInt(sizeRaw),
    collateral: toBigInt(collateralRaw),
    collateralUsdc: toBigInt(collateralUsdcRaw),
    averagePrice: toBigInt(averagePriceRaw),
    entryFundingRate: toBigInt(entryFundingRaw),
    exists: /^true$/i.test(existsRaw),
  };
}

// Shared roster builder used by `list_open_positions`, the `open_position`
// INSUFFICIENT_COLLATERAL pre-flight, and `get_perp_capital_snapshot`. Reads
// every tracked asset and yields any leg whose on-chain `exists` flag is
// true, with per-leg unrealised PnL fields attached via `computePositionPnl`.
//
// The roster shape is load-bearing: the agent runner's deterministic
// rank-swap auto-exit and the agent prompt step-9 logic both read these
// fields. If you add/remove a field here, update:
//   - agents/mining-manager.md step 9
//   - scripts/agent-runner.mjs `computeRankSwapClosures`
//   - apps/mcps/vault-manager/list-positions-pnl.test.mjs
function buildOpenPositionsRoster(vault, d) {
  const assetCount = parseIntSafe(castCall(vault, "getAssetCount()(uint256)"));
  const trackedAssets = [];
  for (let i = 0; i < assetCount; i++) {
    trackedAssets.push(castCall(vault, "getAssetAt(uint256)(bytes32)", [String(i)]));
  }

  const positions = [];
  for (const assetId of trackedAssets) {
    let symbol = "";
    try {
      symbol = stripQuotes(castCall(d.oracleAdapter, "assetSymbols(bytes32)(string)", [assetId]));
    } catch { /* asset may not be wired in oracle */ }

    let currentOraclePrice = null;
    try {
      currentOraclePrice = castCall(d.oracleAdapter, "getPrice(bytes32)(uint256)", [assetId]);
    } catch { /* price may not be set */ }

    for (const isLong of [true, false]) {
      let posKey;
      let trackingRaw;
      try {
        posKey = castCall(
          d.vaultAccounting,
          "getPositionKey(address,bytes32,bool)(bytes32)",
          [vault, assetId, String(isLong)],
        );
        trackingRaw = castCall(
          d.vaultAccounting,
          "getPositionTracking(bytes32)((address,bytes32,bool,uint256,uint256,uint256,uint256,uint256,bool))",
          [posKey],
        );
      } catch {
        continue;
      }

      const parsed = parseTrackingTuple(trackingRaw);
      if (!parsed || !parsed.exists) continue;

      const pnl = computePositionPnl({
        isLong: parsed.isLong,
        size: parsed.size,
        averagePrice: parsed.averagePrice,
        currentOraclePrice,
        collateralUsdc: parsed.collateralUsdc,
        takeProfitPct: PNL_BAND_TP_PCT,
        stopLossPct: PNL_BAND_SL_PCT,
      });

      positions.push({
        positionKey: posKey,
        assetId: assetId.toLowerCase(),
        symbol,
        isLong: parsed.isLong,
        size: parsed.size,
        collateral: parsed.collateral,
        collateralUsdc: parsed.collateralUsdc,
        collateralUsdc_usdc: formatUsdc(parsed.collateralUsdc),
        averagePrice: parsed.averagePrice,
        currentOraclePrice,
        currentOraclePrice_usd:
          currentOraclePrice != null ? formatOraclePrice8(currentOraclePrice) : null,
        unrealisedPnlUsdc: pnl.unrealisedPnlUsdc,
        unrealisedPnlUsdc_usdc: pnl.unrealisedPnlUsdc_usdc,
        unrealisedPnlPctOfCollateral: pnl.unrealisedPnlPctOfCollateral,
        pnlBandOutcome: pnl.pnlBandOutcome,
        exists: true,
      });
    }
  }

  return positions;
}

server.registerTool(
  "list_open_positions",
  {
    title: "List Open Positions",
    description:
      "Return all currently-open perp positions for a vault, derived deterministically from the vault's tracked-asset list. " +
      "For each tracked asset, this calls getPositionTracking(vault, asset, isLong=true) and getPositionTracking(vault, asset, isLong=false) and " +
      "yields any leg where the on-chain `exists` flag is true. " +
      "Each position now also includes computed unrealised PnL: `unrealisedPnlUsdc` (signed USDC 6-dec string), " +
      "`unrealisedPnlPctOfCollateral` (Number, e.g. -0.018 = -1.8%), and `pnlBandOutcome` " +
      `(\"within\" | \"above_take_profit\" | \"below_stop_loss\" | \"unknown\"; thresholds: +${(PNL_BAND_TP_PCT * 100).toFixed(2)}% TP / -${(PNL_BAND_SL_PCT * 100).toFixed(2)}% SL of collateral). ` +
      "Use this instead of looping get_position_tracking from the LLM side when you need the full picture for rebalancing. " +
      "Also see `get_perp_capital_snapshot` for the roster bundled with vault accounting state.",
    inputSchema: {
      vault: z.string().describe("BasketVault contract address (0x...)"),
    },
  },
  async ({ vault }) => {
    const argErr = checkArgs([{ name: "vault", value: vault, kind: "address" }]);
    if (argErr) return argErr;
    try {
      const d = deployment();
      const positions = buildOpenPositionsRoster(vault, d);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ vault: vault.toLowerCase(), count: positions.length, positions }, null, 2),
        }],
      };
    } catch (err) {
      return toolError("READ_FAILED", err.message,
        "Verify the vault address is correct and the OracleAdapter / VaultAccounting deployment is reachable.");
    }
  },
);

server.registerTool(
  "get_perp_capital_snapshot",
  {
    title: "Get Perp Capital Snapshot",
    description:
      "Single read that returns everything you need to size a new open_position safely: " +
      "vault idle / perp allocation, `availableCollateral` (the same value the on-chain `openPosition` check enforces), " +
      "`lockedCollateral`, and the full open-position roster with per-leg unrealised PnL fields " +
      "(`unrealisedPnlUsdc`, `unrealisedPnlPctOfCollateral`, `pnlBandOutcome`). " +
      "Call this BEFORE every open_position so you don't burn turns on doomed calls. " +
      "When `availableCollateral` is less than the collateral you want to deploy, either close a leg with the worst " +
      "`unrealisedPnlPctOfCollateral` from the roster or call `allocate_to_perp` first.",
    inputSchema: {
      vault: z.string().describe("BasketVault contract address (0x...)"),
    },
  },
  async ({ vault }) => {
    const argErr = checkArgs([{ name: "vault", value: vault, kind: "address" }]);
    if (argErr) return argErr;
    try {
      const d = deployment();
      const summary = readVaultSummary(vault, d);
      const accountingState = readVaultAccountingState(d, vault);
      let openPositions = [];
      let rosterError = null;
      try {
        openPositions = buildOpenPositionsRoster(vault, d);
      } catch (rosterErr) {
        rosterError = redactSecrets(rosterErr.message || String(rosterErr));
      }

      const payload = {
        vault: vault.toLowerCase(),
        idleUsdc: summary.availableForPerp,
        idleUsdc_usdc: summary.availableForPerp_usdc,
        perpAllocated: summary.perpAllocated,
        perpAllocated_usdc: summary.perpAllocated_usdc,
        accounting: accountingState
          ? {
              registered: accountingState.registered,
              depositedCapital: accountingState.depositedCapital.toString(),
              depositedCapital_usdc: formatUsdc(accountingState.depositedCapital.toString()),
              collateralLocked: accountingState.collateralLocked.toString(),
              collateralLocked_usdc: formatUsdc(accountingState.collateralLocked.toString()),
              availableCollateral: accountingState.available.toString(),
              availableCollateral_usdc: formatUsdc(accountingState.available.toString()),
              realisedPnL: accountingState.realisedPnL.toString(),
              openInterest: accountingState.openInterest.toString(),
              positionCount: accountingState.positionCount.toString(),
            }
          : null,
        pnlBand: {
          takeProfitPct: PNL_BAND_TP_PCT,
          stopLossPct: PNL_BAND_SL_PCT,
        },
        openPositions,
        nextSteps: [
          {
            tool: "open_position",
            reason:
              "Size collateral <= accounting.availableCollateral. If too small, close a leg with worst unrealisedPnlPctOfCollateral first.",
          },
          {
            tool: "close_position",
            reason:
              "Pick a leg from openPositions whose pnlBandOutcome is above_take_profit / below_stop_loss, or the leg with the worst unrealisedPnlPctOfCollateral when freeing capital for a higher-ranked entry.",
          },
        ],
      };
      if (rosterError) payload.rosterError = rosterError;
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    } catch (err) {
      return toolError("READ_FAILED", err.message,
        "Verify the vault address is correct and the OracleAdapter / VaultAccounting deployment is reachable.");
    }
  },
);

server.registerTool(
  "plan_open_position",
  {
    title: "Plan Open Position",
    description:
      "Read-only sizing helper that converts target leverage and the vault's free collateral into safe raw `size` and `collateral` integers ready to pass into `open_position` verbatim. " +
      `Enforces the on-chain liquidationFeeUsd floor (min collateral $${Number(MIN_COLLATERAL_USDC_RAW) / 1e6} USDC per slot) ` +
      `and the GMX maxLeverage cap (${CHAIN_MAX_LEVERAGE}x). ` +
      "Returns {size, collateral, leverage, notionalUsd, availableCollateral, warnings, nextSteps}. " +
      "The returned `size` and `collateral` are the EXACT raw strings to pass into `open_position` — do not recompute them. " +
      "If per-slot collateral is below the liquidationFeeUsd buffer, returns `error_code: \"INSUFFICIENT_FREE_COLLATERAL_FOR_LIQ_FEE_BUFFER\"` with the open-position roster so you can close a leg first. " +
      "If the same `(vault, assetId)` was closed inside the churn-guard window (default 4h), returns `error_code: \"CHURN_GUARD_COOLDOWN\"` with `cooldownEndsAt` + `lastCloseReason` so the agent skips re-opening a freshly rotated ticker. Pass `bypassChurnGuard: true` together with `bypassReason` if you have a fresh thesis that overrides the rotation.",
    inputSchema: {
      vault: z.string().describe("BasketVault address (0x...)"),
      assetId: z.string().describe("bytes32 asset id from get_oracle_assets — echoed back in nextSteps params_hint"),
      isLong: z.boolean().describe("true = long, false = short — echoed back in nextSteps params_hint"),
      targetLeverage: z.number().optional().describe(`Target effective leverage (default 10, hard max ${CHAIN_MAX_LEVERAGE}; agent policy is typically 10x for longs and <=5x for shorts)`),
      numNewSlots: z.number().int().optional().describe("How many new opens to split availableCollateral across (default 1). Mirrors equal-weight intent across this turn's batch of new entrants."),
      maxCollateralUsdcRaw: z.string().optional().describe("Optional cap on per-slot collateral in raw USDC (6 decimals). Useful when an agent-side per-slot budget is smaller than `availableCollateral / numNewSlots`."),
      convictionWeight: z.number().optional().describe("This slot's conviction weight in [0, 1] (typically `(score - entryScoreMin) / (100 - entryScoreMin)` from get_ml_top_picks / get_quality_top_picks). When provided WITH `totalConvictionWeight`, the per-slot collateral is computed as `availableCollateral * convictionWeight / totalConvictionWeight` instead of `availableCollateral / numNewSlots`. Omit both to keep the equal-weight default."),
      totalConvictionWeight: z.number().optional().describe("Sum of convictionWeights across every slot you plan to open this turn. Required when `convictionWeight` is set so the per-slot share normalises correctly to availableCollateral."),
      bypassChurnGuard: z.boolean().optional().describe("When true, override the recently-closed cooldown for (vault, assetId). Must be paired with `bypassReason` — both are surfaced in the agent metadata for audit."),
      bypassReason: z.string().optional().describe("Required when `bypassChurnGuard` is true. Free-form rationale persisted alongside the next open so operators can audit churn-guard overrides."),
    },
  },
  async ({
    vault,
    assetId,
    isLong,
    targetLeverage,
    numNewSlots,
    maxCollateralUsdcRaw,
    convictionWeight,
    totalConvictionWeight,
    bypassChurnGuard,
    bypassReason,
  }) => {
    const argErr = checkArgs([
      { name: "vault", value: vault, kind: "address" },
      { name: "assetId", value: assetId, kind: "bytes32" },
    ]);
    if (argErr) return argErr;

    // Churn-guard short-circuit: refuse to re-plan an open on a leg the
    // runner just closed (rank-swap rotation, pnl-band TP/SL, or LLM-judged
    // close) inside the cooldown window. Bypassable when the agent supplies
    // a `bypassReason` so operators can audit the override.
    if (!CHURN_GUARD_DISABLED) {
      const guard = checkChurnGuard({
        vault,
        assetId,
        windowMs: EFFECTIVE_CHURN_GUARD_WINDOW_MS,
      });
      if (guard.inCooldown) {
        if (bypassChurnGuard) {
          const trimmedReason = String(bypassReason || "").trim();
          if (!trimmedReason) {
            return toolError(
              "CHURN_GUARD_BYPASS_REQUIRES_REASON",
              `bypassChurnGuard=true requires a non-empty bypassReason. Cooldown is active for (vault=${vault}, assetId=${assetId}); closed at ${guard.closedAt} (${guard.closedReason || "reason unknown"}).`,
              "Either drop the bypass and wait until cooldownEndsAt, or pass `bypassReason: '<short audit string>'` so the override is recorded in the action metadata.",
            );
          }
          // Allowed bypass — fall through to normal sizing; the runner
          // attaches the bypassReason to the next open_position action.
        } else {
          const payload = {
            success: false,
            error_code: "CHURN_GUARD_COOLDOWN",
            message:
              `Re-opening (vault=${vault}, assetId=${assetId}, isLong=${isLong}) is blocked: a close was recorded at ${guard.closedAt} (${guard.closedReason || "reason unknown"}). ` +
              `Cooldown ends at ${guard.cooldownEndsAt} (window ${Math.round(EFFECTIVE_CHURN_GUARD_WINDOW_MS / 60000)} min).`,
            vault,
            assetId: assetId.toLowerCase(),
            isLong,
            ticker: guard.ticker,
            lastClose: {
              closedAt: guard.closedAt,
              closedReason: guard.closedReason,
              isLong: guard.isLong,
            },
            cooldownEndsAt: guard.cooldownEndsAt,
            cooldownWindowMs: EFFECTIVE_CHURN_GUARD_WINDOW_MS,
            recovery_hint:
              "Skip this ticker for the rest of the run unless your fresh signal genuinely contradicts the rank-swap / pnl-band / LLM-judged close that just removed it. To override, retry plan_open_position with `bypassChurnGuard: true` AND `bypassReason: '<short audit string>'`. The bypass + reason are persisted alongside the next open in agent-metadata.",
          };
          return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            isError: true,
          };
        }
      }
    }

    const lev = targetLeverage == null ? 10 : Number(targetLeverage);
    if (!Number.isFinite(lev) || lev <= 0 || lev > CHAIN_MAX_LEVERAGE) {
      return toolError(
        "INVALID_ARGUMENT",
        `targetLeverage must be in (0, ${CHAIN_MAX_LEVERAGE}]; got ${targetLeverage}.`,
        `The GMX vault rejects positions with effective leverage > ${CHAIN_MAX_LEVERAGE}x. Agent policy is typically <= 10x for longs and <= 5x for shorts.`,
      );
    }
    const slots = numNewSlots == null ? 1 : Number(numNewSlots);
    if (!Number.isInteger(slots) || slots < 1) {
      return toolError(
        "INVALID_ARGUMENT",
        `numNewSlots must be an integer >= 1; got ${numNewSlots}.`,
        "Pass the count of new opens you intend to fund this turn so available collateral is split evenly.",
      );
    }

    let maxCollateralCap = null;
    if (maxCollateralUsdcRaw != null && maxCollateralUsdcRaw !== "") {
      try {
        maxCollateralCap = BigInt(String(maxCollateralUsdcRaw));
      } catch {
        return toolError(
          "INVALID_ARGUMENT",
          `maxCollateralUsdcRaw must be an integer string in raw USDC (6 decimals); got "${maxCollateralUsdcRaw}".`,
          "Pass e.g. '500000000' = $500 to cap the per-slot collateral.",
        );
      }
      if (maxCollateralCap <= 0n) {
        return toolError(
          "INVALID_ARGUMENT",
          `maxCollateralUsdcRaw must be > 0; got "${maxCollateralUsdcRaw}".`,
          "Remove the field or pass a positive raw USDC integer.",
        );
      }
    }

    try {
      const d = deployment();
      const accountingState = readVaultAccountingState(d, vault);
      if (!accountingState || !accountingState.registered) {
        return toolError(
          "READ_FAILED",
          `Could not read VaultAccounting state for vault ${vault}, or the vault is not yet registered with the perp engine.`,
          "Verify the vault address and ensure `allocate_to_perp` has been called at least once so the perp accounting record exists.",
        );
      }

      const available = accountingState.available;

      // Per-slot collateral. Default = equal-weight (available / numNewSlots).
      // Optional override = conviction-weighted (available * convictionWeight
      // / totalConvictionWeight). Both inputs must be supplied together so
      // the share normalises cleanly to `available`; the response echoes the
      // chosen mode so the agent can reason about why two opens at the same
      // numNewSlots got different collateral.
      let perSlot;
      let sizingMode;
      const conviction = Number.isFinite(convictionWeight) ? Number(convictionWeight) : null;
      const totalConviction = Number.isFinite(totalConvictionWeight)
        ? Number(totalConvictionWeight)
        : null;
      if (conviction != null || totalConviction != null) {
        if (conviction == null || totalConviction == null) {
          return toolError(
            "INVALID_ARGUMENT",
            `convictionWeight and totalConvictionWeight must be supplied together; got convictionWeight=${convictionWeight}, totalConvictionWeight=${totalConvictionWeight}.`,
            "Either omit both to keep the equal-weight default, or pass both as numbers (this slot's weight + the sum across every slot you intend to open this turn).",
          );
        }
        if (conviction <= 0) {
          return toolError(
            "INVALID_ARGUMENT",
            `convictionWeight must be > 0; got ${conviction}.`,
            "Drop the slot from the batch instead of passing convictionWeight=0; opens with zero conviction should not be sized.",
          );
        }
        if (totalConviction < conviction) {
          return toolError(
            "INVALID_ARGUMENT",
            `totalConvictionWeight (${totalConviction}) must be >= convictionWeight (${conviction}).`,
            "totalConvictionWeight is the SUM of every slot's convictionWeight in this turn's batch (including this slot), so it can never be smaller than the per-slot value.",
          );
        }
        const SCALE = 1_000_000n;
        const numerator = BigInt(Math.round(conviction * 1_000_000));
        const denominator = BigInt(Math.round(totalConviction * 1_000_000));
        perSlot = (available * numerator) / (denominator === 0n ? SCALE : denominator);
        sizingMode = "conviction_weighted";
      } else {
        perSlot = available / BigInt(slots);
        sizingMode = "equal_weight";
      }
      let collateralRaw = perSlot;
      if (maxCollateralCap != null && maxCollateralCap < collateralRaw) {
        collateralRaw = maxCollateralCap;
      }

      if (collateralRaw < MIN_COLLATERAL_USDC_RAW) {
        let openPositions = [];
        let rosterError = null;
        try {
          openPositions = buildOpenPositionsRoster(vault, d).map((p) => ({
            assetId: p.assetId,
            symbol: p.symbol,
            isLong: p.isLong,
            size: p.size,
            collateral: p.collateral,
            collateralUsdc: p.collateralUsdc,
            collateralUsdc_usdc: p.collateralUsdc_usdc,
            unrealisedPnlUsdc: p.unrealisedPnlUsdc,
            unrealisedPnlUsdc_usdc: p.unrealisedPnlUsdc_usdc,
            unrealisedPnlPctOfCollateral: p.unrealisedPnlPctOfCollateral,
            pnlBandOutcome: p.pnlBandOutcome,
          }));
        } catch (rosterErr) {
          rosterError = redactSecrets(rosterErr.message || String(rosterErr));
        }

        const payload = {
          success: false,
          error_code: "INSUFFICIENT_FREE_COLLATERAL_FOR_LIQ_FEE_BUFFER",
          message:
            `Per-slot collateral would be ${collateralRaw.toString()} raw USDC ($${formatUsdc(collateralRaw.toString())}), ` +
            `below the on-chain liquidationFeeUsd buffer minimum of ${MIN_COLLATERAL_USDC_RAW.toString()} raw USDC ($${formatUsdc(MIN_COLLATERAL_USDC_RAW.toString())}). ` +
            `availableCollateral=${available.toString()} raw USDC ($${formatUsdc(available.toString())}), numNewSlots=${slots}` +
            (maxCollateralCap != null ? `, maxCollateralUsdcRaw=${maxCollateralCap.toString()}.` : "."),
          vault,
          availableCollateral: available.toString(),
          availableCollateral_usdc: formatUsdc(available.toString()),
          minCollateralPerSlot: MIN_COLLATERAL_USDC_RAW.toString(),
          minCollateralPerSlot_usdc: formatUsdc(MIN_COLLATERAL_USDC_RAW.toString()),
          numNewSlots: slots,
          chainCaps: {
            maxLeverage: CHAIN_MAX_LEVERAGE,
            liquidationFeeUsd: LIQUIDATION_FEE_USD,
          },
          openPositions,
          recovery_hint:
            "Either reduce `numNewSlots` to widen each slot's collateral, drop `maxCollateralUsdcRaw` (if you set one), or close the leg with the worst `unrealisedPnlPctOfCollateral` (or any leg whose `pnlBandOutcome` is `above_take_profit` / `below_stop_loss`) via `close_position` to free locked capital, then retry `plan_open_position`.",
        };
        if (rosterError) payload.rosterError = rosterError;
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          isError: true,
        };
      }

      // Two-digit leverage precision so values like 10.5x round-trip cleanly
      // (10.5x => levBp = 1050; size = collateral * 1e24 * 1050 / 100).
      const levBp = BigInt(Math.round(lev * 100));
      const sizeRaw = (collateralRaw * USDC_TO_GMX_USD_SCALE * levBp) / 100n;
      const notionalUsdcRaw = (collateralRaw * levBp) / 100n;

      const warnings = [];
      if (lev > 20) {
        warnings.push(
          `targetLeverage=${lev}x exceeds the recommended 10x agent cap. Confirm your prompt allows leverage this high.`,
        );
      }
      if (collateralRaw < MIN_COLLATERAL_USDC_RAW * 2n) {
        warnings.push(
          `Per-slot collateral ($${formatUsdc(collateralRaw.toString())}) is within 2x of the $${formatUsdc(MIN_COLLATERAL_USDC_RAW.toString())} liquidationFeeUsd floor; small adverse moves at open time can still trip the liquidation-fee check.`,
        );
      }

      const payload = {
        vault: vault.toLowerCase(),
        assetId: assetId.toLowerCase(),
        isLong,
        leverage: lev,
        size: sizeRaw.toString(),
        collateral: collateralRaw.toString(),
        collateral_usdc: formatUsdc(collateralRaw.toString()),
        notionalUsd: formatUsdc(notionalUsdcRaw.toString()),
        availableCollateral: available.toString(),
        availableCollateral_usdc: formatUsdc(available.toString()),
        numNewSlots: slots,
        sizingMode,
        convictionWeight: conviction,
        totalConvictionWeight: totalConviction,
        chainCaps: {
          maxLeverage: CHAIN_MAX_LEVERAGE,
          liquidationFeeUsd: LIQUIDATION_FEE_USD,
          minCollateralPerSlot: MIN_COLLATERAL_USDC_RAW.toString(),
          minCollateralPerSlot_usdc: formatUsdc(MIN_COLLATERAL_USDC_RAW.toString()),
        },
        warnings,
        nextSteps: [
          {
            tool: "open_position",
            reason:
              "Pass `size` and `collateral` from this response verbatim into open_position; do not recompute.",
            params_hint: {
              vault,
              assetId,
              isLong,
              size: sizeRaw.toString(),
              collateral: collateralRaw.toString(),
            },
          },
        ],
      };
      if (bypassChurnGuard) {
        payload.churnGuardBypass = {
          bypassed: true,
          reason: String(bypassReason || "").trim(),
        };
        payload.warnings = [
          ...warnings,
          `churn-guard bypass active for (vault=${vault}, assetId=${assetId}); reason="${String(bypassReason || "").trim()}". Persist this reason in the open_position justification so the audit trail is preserved.`,
        ];
      }
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    } catch (err) {
      return toolError(
        "READ_FAILED",
        err.message,
        "Verify the vault address is correct and the VaultAccounting deployment is reachable.",
      );
    }
  },
);

server.registerTool(
  "get_position_tracking",
  {
    title: "Get Position Tracking",
    description:
      "Get on-chain tracking details of a specific perp position for a vault by asset and direction. " +
      "Returns {positionKey, tracking: {vault, asset, isLong, size, collateral, collateralUsdc, averagePrice, entryFundingRate, exists}}. " +
      "Use get_oracle_assets to find valid assetId values. Use get_vault_pnl for aggregate PnL instead.",
    inputSchema: {
      vault: z.string().describe("BasketVault contract address (0x...)"),
      assetId: z.string().describe("bytes32 asset id from get_oracle_assets (e.g. '0x1a2b3c...')"),
      isLong: z.boolean().describe("true for long position, false for short"),
    },
  },
  async ({ vault, assetId, isLong }) => {
    const argErr = checkArgs([
      { name: "vault", value: vault, kind: "address" },
      { name: "assetId", value: assetId, kind: "bytes32" },
    ]);
    if (argErr) return argErr;
    try {
      const d = deployment();
      const posKey = castCall(
        d.vaultAccounting,
        "getPositionKey(address,bytes32,bool)(bytes32)",
        [vault, assetId, String(isLong)],
      );
      const tracking = castCall(
        d.vaultAccounting,
        "getPositionTracking(bytes32)((address,bytes32,bool,uint256,uint256,uint256,uint256,uint256,bool))",
        [posKey],
      );
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ positionKey: posKey, tracking }, null, 2),
        }],
      };
    } catch (err) {
      return toolError("READ_FAILED", err.message,
        "Verify vault address and assetId. Use get_oracle_assets to list valid asset IDs.");
    }
  },
);

// ── Vault Management Tools (write) ──────────────────────────────────────────

server.registerTool(
  "wire_asset",
  {
    title: "Wire Asset",
    description:
      "Wire a new tradeable asset on-chain in a single transaction via AssetWiring. " +
      "Deploys a MockIndexToken, configures the OracleAdapter, seeds the GMX price feed, and maps the asset across VaultAccounting/FundingRateManager/PriceSync. " +
      "Ambiguous unsuffixed equities are rejected — use exchange-suffixed Yahoo symbols (e.g. BHP.AX). " +
      "STRICT ORDER: you MUST call `yfinance_quote` on this exact symbol in the same turn and pass its `priceUsd` field as `seedPriceUsd`. " +
      "The tool independently fetches the live Yahoo USD quote and REJECTS any seed that differs by more than 20% (error_code SEED_PRICE_DEVIATION). " +
      "Returns {success, transactionHash, next_steps}.",
    inputSchema: {
      symbol: z.string().describe("Yahoo Finance ticker (e.g. 'BHP.AX', 'AAPL', 'GLEN.L')"),
      seedPriceUsd: z.number().positive().describe("Current price in USD from yfinance_quote's priceUsd field (e.g. 45.20). Must be within 20% of live Yahoo USD or the call is rejected."),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ symbol, seedPriceUsd, justification }) => {
    try {
      await validateWriteSymbolPolicy(symbol);

      const d = deployment();

      // Idempotency pre-check: AssetWiring.wireAsset is non-idempotent because
      // PriceSync.addMapping reverts with MappingAlreadyExists on duplicates.
      // If the symbol is already registered + active in OracleAdapter, return
      // a clean ALREADY_WIRED short-circuit so the LLM stops retrying.
      const existing = lookupOracleAssetBySymbol(d, symbol);
      if (existing && existing.active) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error_code: "ALREADY_WIRED",
              message: `Symbol "${symbol}" is already wired in OracleAdapter at assetId ${existing.assetId} (active=true).`,
              symbol,
              assetId: existing.assetId,
              recovery_hint:
                "This symbol is already wired. Skip wire_asset for this pick and pass the existing assetId to set_vault_assets / open_position instead.",
            }, null, 2),
          }],
          isError: true,
        };
      }

      let live;
      try {
        live = await fetchLivePriceUsd(symbol);
      } catch (err) {
        return toolError(
          "SEED_PRICE_UNAVAILABLE",
          `Could not fetch live Yahoo USD quote for ${symbol}: ${err.message}`,
          "Yahoo Finance may be temporarily unavailable, or the symbol does not resolve. " +
            "Skip this pick on this run; the asset will be eligible again next run once the keeper publishes a price. " +
            "Do NOT retry inside this turn with the same seedPriceUsd."
        );
      }

      const check = validateSeedPriceUsd(seedPriceUsd, live.priceUsd, SEED_PRICE_MAX_DEVIATION_BPS);
      if (!check.ok) {
        return toolError(
          "SEED_PRICE_DEVIATION",
          `seedPriceUsd ${seedPriceUsd} differs from live Yahoo priceUsd ${live.priceUsd} (${live.currency} ${live.price}) by ${(check.devBps / 100).toFixed(2)}% (max ${(SEED_PRICE_MAX_DEVIATION_BPS / 100).toFixed(0)}%).`,
          "You must call yfinance_quote on this exact symbol in the SAME turn and pass its `priceUsd` field as `seedPriceUsd`. " +
            "Do NOT guess, do NOT carry forward stale prices, and do NOT reuse a value from atlas-ml / atlas-quality (those expose marketCapUsd, not per-share USD)."
        );
      }

      const seedPriceRaw8 = BigInt(Math.round(seedPriceUsd * 1e8)).toString();
      const rawReceipt = castSend(d.assetWiring, "wireAsset(string,uint256)", [symbol, seedPriceRaw8]);
      return writeResult(rawReceipt, [
        { tool: "get_oracle_assets", reason: "Verify the new asset appears and is active" },
        { tool: "set_vault_assets", reason: "Add the new asset to a vault's tracked assets" },
        { tool: "yfinance_search", reason: "Use exact exchange-suffixed symbols when a base ticker is ambiguous" },
      ], justification);
    } catch (err) {
      if (err.code === "INVALID_SYMBOL_POLICY") {
        const c = err.classification ?? {};
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error_code: "INVALID_SYMBOL_POLICY",
              message: err.message,
              requestedSymbol: c.requestedSymbol ?? symbol,
              candidates: c.candidates ?? [],
              recovery_hint: "Use an explicit exchange suffix for ambiguous equities (for example: BHP.AX).",
            }, null, 2),
          }],
          isError: true,
        };
      }
      return writeError(err);
    }
  },
);

server.registerTool(
  "create_vault",
  {
    title: "Create Vault",
    description:
      "Deploy a new basket vault via BasketFactory.createBasket on the hub chain and " +
      "(by default) on every configured spoke chain so multi-chain deposits can route " +
      "to a per-chain twin with the same name. The hub vault is auto-registered with " +
      "VaultAccounting; spoke twins are wired with setStateRelay + setAssets([keccak256('USDC')]) " +
      "(stub asset id matches `script/DeploySpoke.s.sol::_maybeBootstrapSpokeBasket` " +
      "since spokes have no OracleAdapter deployed). " +
      "Fees are in basis points: 100 bps = 1%, max 500 bps = 5%. " +
      "Returns {success, transactionHash, vaultAddress (hub), twins[{chain, vaultAddress, success, error?}], next_steps}. " +
      "`vaultAddress` is the HUB address — that's what agents track in agents/memory/<agent>/state.json. " +
      "Spoke twins exist purely so the multi-chain deposit drawer can find a name-matched local vault on each chain. " +
      "Set deployToSpokes:false to skip the spoke fan-out (single-chain creation, back-compat). " +
      "After creation, use the returned vaultAddress with set_vault_assets to configure tracked assets on the HUB.",
    inputSchema: {
      name: z.string().describe("Vault display name (e.g. 'Mining Basket'). Used verbatim as the per-chain twin name."),
      depositFeeBps: z.number().int().min(0).max(500).describe("Deposit fee in bps (e.g. 50 = 0.5%)"),
      redeemFeeBps: z.number().int().min(0).max(500).describe("Redeem fee in bps (e.g. 50 = 0.5%)"),
      deployToSpokes: z.boolean().optional().describe(
        "When true (default), also deploy + wire twin baskets on every configured spoke chain. " +
        "When false, only the hub vault is created."
      ),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ name, depositFeeBps, redeemFeeBps, deployToSpokes, justification }) => {
    try {
      const d = deployment();
      const includeSpokes = deployToSpokes !== false;

      // Step 1 — Hub vault (existing behavior).
      const hubReceipt = castSend(d.basketFactory, "createBasket(string,uint256,uint256)", [name, String(depositFeeBps), String(redeemFeeBps)]);
      const hubTx = parseReceipt(hubReceipt);
      const hubVaultAddress = extractVaultAddressFromCreateVaultReceipt(hubReceipt);

      // Step 2 — Optional spoke fan-out. Failures on individual spokes are
      // captured per-twin and do NOT fail the overall response: the hub vault
      // is already on-chain and agents key off `vaultAddress` (the hub).
      const twins = [];
      if (includeSpokes && hubTx.status === "success" && hubVaultAddress) {
        const spokeContexts = discoverSpokeContexts();
        for (const spoke of spokeContexts) {
          if (spoke.skipped) {
            twins.push({
              chain: spoke.chainKey,
              success: false,
              skipped: true,
              error: spoke.reason,
            });
            continue;
          }
          twins.push(deploySpokeTwin(spoke, name, depositFeeBps, redeemFeeBps));
        }
      }

      const result = {
        success: hubTx.status === "success",
        ...hubTx,
        vaultAddress: hubVaultAddress,
        twins,
        next_steps: [
          { tool: "set_vault_assets", reason: "Configure which assets the vault tracks (hub only — twins already have a stub USDC asset id)", params_hint: { vault: hubVaultAddress } },
        ],
      };
      if (justification) result.justification = justification;
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (err) {
      return writeError(err);
    }
  },
);

function deploySpokeTwin(spoke, name, depositFeeBps, redeemFeeBps) {
  return deploySpokeTwinImpl(
    spoke,
    { name, depositFeeBps, redeemFeeBps },
    {
      castSendOnRpc,
      parseReceipt,
      extractVaultAddressFromCreateVaultReceipt,
      redactSecrets,
      stubAssetId: SPOKE_STUB_ASSET_ID,
    },
  );
}

server.registerTool(
  "set_vault_assets",
  {
    title: "Set Vault Assets",
    description:
      "Configure which oracle assets a vault tracks. Replaces the full asset list. " +
      "Each asset must be active in the OracleAdapter. Asset IDs are bytes32 hex strings (keccak256 of the Yahoo Finance symbol). " +
      "Use get_oracle_assets to find valid assetId values. " +
      "The tool rejects malformed and unknown assetIds locally with error_code INVALID_ASSET_ID before broadcasting; never invent or pattern-fill bytes32 values. " +
      "Returns {success, transactionHash, next_steps}.",
    inputSchema: {
      vault: z.string().describe("BasketVault address (0x...)"),
      assetIds: z.array(z.string()).describe("bytes32 asset IDs from get_oracle_assets (e.g. ['0x1a2b...', '0x3c4d...'])"),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ vault, assetIds, justification }) => {
    const argErr = checkArgs([{ name: "vault", value: vault, kind: "address" }]);
    if (argErr) return argErr;
    try {
      if (!Array.isArray(assetIds) || assetIds.length === 0) {
        return invalidAssetIdsResponse({
          malformed: [],
          unknown: [],
          valid: [],
          extraMessage:
            "assetIds must be a non-empty array of bytes32 hex strings.",
        });
      }

      const d = deployment();
      const knownActiveIds = readOracleAssetIdList(d);
      const classification = classifyAssetIds(assetIds, knownActiveIds);
      if (classification.malformed.length > 0 || classification.unknown.length > 0) {
        return invalidAssetIdsResponse(classification);
      }

      const idsArg = `[${assetIds.join(",")}]`;
      const rawReceipt = castSend(vault, "setAssets(bytes32[])", [idsArg]);
      return writeResult(rawReceipt, [
        { tool: "get_vault_state", reason: "Verify assets were set", params_hint: { vault } },
      ], justification);
    } catch (err) {
      return writeError(err);
    }
  },
);

// Bulk-read the OracleAdapter's full registered assetId list. Uses the same
// getAssetCount() + assetList(uint256) loop pattern as get_oracle_assets
// (above) but skips the per-id getAssetConfig / assetSymbols / getPrice round
// trips that the LLM-facing read tool does — we only need the assetId set so
// classifyAssetIds() can flag hallucinated bytes32 values before broadcast.
// Inactive-but-registered IDs are still surfaced as "known" here; the
// BasketVault.setAssets() require() will still revert with a more specific
// "Asset not active" error on those, which is plenty actionable on its own.
function readOracleAssetIdList(d) {
  const count = parseIntSafe(castCall(d.oracleAdapter, "getAssetCount()(uint256)"));
  const ids = [];
  for (let i = 0; i < count; i++) {
    ids.push(castCall(d.oracleAdapter, "assetList(uint256)(bytes32)", [String(i)]));
  }
  return ids;
}

// Look up an asset by symbol using `keccak256(symbol)` against
// OracleAdapter.getAssetConfig. Returns `{ assetId, active }` if the asset is
// registered (active or not), `null` if there's no record. Used by the
// idempotent pre-check in `wire_asset` so we can short-circuit re-wires of
// already-active symbols with a clean ALREADY_WIRED error_code instead of
// letting `priceSync.addMapping` revert later with `MappingAlreadyExists`.
function lookupOracleAssetBySymbol(d, symbol) {
  const sym = String(symbol ?? "");
  if (!sym) return null;
  let assetId;
  try {
    assetId = runCast(["keccak", sym]);
  } catch {
    return null;
  }
  if (!assetId || !/^0x[0-9a-fA-F]{64}$/.test(assetId)) return null;

  let configRaw;
  try {
    configRaw = castCall(
      d.oracleAdapter,
      "getAssetConfig(bytes32)((address,uint8,uint256,uint256,uint8,bool))",
      [assetId],
    );
  } catch {
    return null;
  }
  // The struct is (feedAddress, feedType, stalenessThreshold, deviationBps,
  // decimals, active). We only need `active` here. cast formats this either
  // single-line `(0x..., 1, 86400, 2000, 8, true)` or multi-line; reuse the
  // single regex used by `get_oracle_assets`.
  const activeMatch = configRaw.match(/,\s*(true|false)\s*\)/);
  const everConfigured = activeMatch !== null;
  if (!everConfigured) return null;
  return {
    assetId,
    active: activeMatch[1] === "true",
  };
}

// Read the available USDC capital for a vault from VaultAccounting. Returns
// `{ depositedCapital, realisedPnL, openInterest, collateralLocked, available }`
// as bigints, or `null` when the vault is not registered / RPC unreachable.
//
// `available` mirrors the on-chain `_availableCapital` calculation:
//   available = max(0, depositedCapital + realisedPnL - collateralLocked)
//
// This lets `open_position` short-circuit with INSUFFICIENT_COLLATERAL before
// invoking `cast send` and incurring a gas-estimate revert.
function readVaultAccountingState(d, vault) {
  let raw;
  try {
    raw = castCall(
      d.vaultAccounting,
      "getVaultState(address)((uint256,int256,uint256,uint256,uint256,bool))",
      [vault],
    );
  } catch {
    return null;
  }
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let inner = text;
  if (text.startsWith("(") && text.endsWith(")")) {
    inner = text.slice(1, -1);
  }
  const parts = inner
    .split(/\r?\n|,/)
    .map((s) => s.replace(/\s*\[[^\]]+\]\s*$/, "").trim())
    .filter(Boolean);
  if (parts.length < 6) return null;
  const [depositedRaw, realisedPnLRaw, openInterestRaw, collateralLockedRaw, positionCountRaw, registeredRaw] = parts;
  let depositedCapital;
  let realisedPnL;
  let openInterest;
  let collateralLocked;
  let positionCount;
  try {
    depositedCapital = parseCastBigInt(depositedRaw);
    realisedPnL = parseCastBigInt(realisedPnLRaw);
    openInterest = parseCastBigInt(openInterestRaw);
    collateralLocked = parseCastBigInt(collateralLockedRaw);
    positionCount = parseCastBigInt(positionCountRaw);
  } catch {
    return null;
  }
  const registered = /^true$/i.test(registeredRaw);
  let available = depositedCapital + realisedPnL - collateralLocked;
  if (available < 0n) available = 0n;
  return {
    depositedCapital,
    realisedPnL,
    openInterest,
    collateralLocked,
    positionCount,
    registered,
    available,
  };
}

function invalidAssetIdsResponse({ malformed, unknown, valid, extraMessage }) {
  const parts = [];
  if (unknown.length > 0) {
    parts.push(`${unknown.length} assetId(s) are not registered in OracleAdapter`);
  }
  if (malformed.length > 0) {
    parts.push(
      `${malformed.length} assetId(s) are malformed (must match /^0x[0-9a-fA-F]{64}$/)`,
    );
  }
  const summary =
    parts.length > 0
      ? `${parts.join(" and ")}; refusing to broadcast setAssets(bytes32[]).`
      : "Refusing to broadcast setAssets(bytes32[]) — no valid assetIds provided.";
  const message = extraMessage ? `${extraMessage} ${summary}` : summary;
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: false,
        error_code: "INVALID_ASSET_ID",
        message,
        invalidAssetIds: unknown,
        malformedAssetIds: malformed,
        validAssetIds: valid,
        recovery_hint:
          "Call get_oracle_assets to fetch the canonical {assetId, symbol} pairs, then retry set_vault_assets using only assetId values returned by that call. Do not invent or pattern-fill bytes32 values.",
      }, null, 2),
    }],
    isError: true,
  };
}

server.registerTool(
  "allocate_to_perp",
  {
    title: "Allocate to Perp",
    description:
      "Move USDC from the vault's idle balance to VaultAccounting for perp trading. " +
      "Amount is in raw USDC units (6 decimals: 1000000 = 1 USDC). Only the vault owner can call this. " +
      "Respects minReserveBps and maxPerpAllocation caps — use get_vault_state to check availableForPerp first. " +
      "PRE-FLIGHT: the MCP reads `getAvailableForPerpUsdc()` directly and short-circuits with `INSUFFICIENT_RESERVES` (no tx, no gas) when the requested amount exceeds the on-chain available reserve — this catches cents-level rounding/staleness bugs from agents that allocated against a snapshot. " +
      "Returns {success, transactionHash, next_steps}.",
    inputSchema: {
      vault: z.string().describe("BasketVault address (0x...)"),
      amount: z.string().describe("USDC in raw units (e.g. '1000000' = 1 USDC, '500000000' = 500 USDC)"),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ vault, amount, justification }) => {
    const argErr = checkArgs([{ name: "vault", value: vault, kind: "address" }]);
    if (argErr) return argErr;

    // Validate `amount` is a non-empty positive integer string before we
    // make any RPC calls (matches the open_position arg validation style).
    let amountBn;
    try {
      amountBn = BigInt(String(amount));
    } catch {
      return toolError(
        "INVALID_ARGUMENT",
        `amount must be an integer-string value; got amount=${amount}.`,
        "Pass amount as a base-10 integer string in raw USDC units (e.g. '1000000' = 1 USDC).",
      );
    }
    if (amountBn <= 0n) {
      return toolError(
        "INVALID_ARGUMENT",
        `amount must be > 0; got amount=${amountBn}.`,
        "Pass a positive integer amount in raw USDC units.",
      );
    }

    // Pre-flight: read the vault's `getAvailableForPerpUsdc()` view
    // directly so we can refuse with a structured INSUFFICIENT_RESERVES
    // payload BEFORE `cast send` burns gas on a guaranteed revert. This
    // is the exact accounting the on-chain
    // `require(amount <= getAvailableForPerpUsdc())` enforces. A common
    // failure mode is agents allocating against a slightly-stale snapshot
    // — `2_762_330` requested vs `2_762_329` available, off by cents from
    // a fee accrual since the last `get_vault_state` read. Best-effort:
    // an RPC blip here must not block legitimate allocations, so we fall
    // back to the live `cast send` path if the read fails.
    let availableForPerp = null;
    try {
      const rawAvail = castCall(vault, "getAvailableForPerpUsdc()(uint256)");
      availableForPerp = parseCastBigInt(rawAvail);
    } catch {
      availableForPerp = null;
    }
    if (availableForPerp !== null && amountBn > availableForPerp) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error_code: "INSUFFICIENT_RESERVES",
            message:
              `Vault ${vault} has only ${availableForPerp.toString()} raw USDC available for perp allocation, ` +
              `but the call requested ${amountBn.toString()} (off by ${(amountBn - availableForPerp).toString()} raw USDC). ` +
              `getAvailableForPerpUsdc() respects minReserveBps and maxPerpAllocation caps; the prior snapshot may be stale by cents due to fee accrual or interim deposits/withdrawals.`,
            vault,
            requestedAmount: amountBn.toString(),
            availableAmount: availableForPerp.toString(),
            shortfall: (amountBn - availableForPerp).toString(),
            recovery_hint:
              "Re-read `get_vault_state` for the fresh `availableForPerp` value, then retry with `amount = availableForPerp` (or any smaller value). Do not rely on a snapshot from earlier in the run — fee accrual and concurrent deposits move the available reserve between reads.",
          }, null, 2),
        }],
        isError: true,
      };
    }

    try {
      const rawReceipt = castSend(vault, "allocateToPerp(uint256)", [amount]);
      return writeResult(rawReceipt, [
        { tool: "open_position", reason: "Open a perp position with the allocated capital", params_hint: { vault } },
        { tool: "get_vault_state", reason: "Verify updated allocation", params_hint: { vault } },
      ], justification);
    } catch (err) {
      return writeError(err);
    }
  },
);

server.registerTool(
  "withdraw_from_perp",
  {
    title: "Withdraw from Perp",
    description:
      "Pull USDC back from VaultAccounting to the vault's idle balance. " +
      "Amount is in raw USDC units (6 decimals). Only the vault owner can call this. " +
      "May fail if capital is locked in open positions — close positions first if needed. " +
      "Returns {success, transactionHash, next_steps}.",
    inputSchema: {
      vault: z.string().describe("BasketVault address (0x...)"),
      amount: z.string().describe("USDC in raw units (e.g. '1000000' = 1 USDC)"),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ vault, amount, justification }) => {
    const argErr = checkArgs([{ name: "vault", value: vault, kind: "address" }]);
    if (argErr) return argErr;
    try {
      const rawReceipt = castSend(vault, "withdrawFromPerp(uint256)", [amount]);
      return writeResult(rawReceipt, [
        { tool: "get_vault_state", reason: "Verify updated reserve and allocation", params_hint: { vault } },
      ], justification);
    } catch (err) {
      // The structured decoder in writeError() now picks up
      // InsufficientCapital(address,uint256,uint256) and surfaces requested
      // vs available, so the legacy substring check is redundant. Falling
      // through to writeError() handles the decoded path uniformly.
      return writeError(err);
    }
  },
);

server.registerTool(
  "open_position",
  {
    title: "Open Position",
    description:
      "Open or increase a perp position for a vault via VaultAccounting. " +
      "Size is in GMX USD units (~1e30 scale: '1000000000000000000000000000000' = $1). " +
      "Collateral is in raw USDC (6 decimals: '1000000' = 1 USDC). " +
      `Effective leverage = size / (collateral * 1e24). On-chain caps: maxLeverage ${CHAIN_MAX_LEVERAGE}x and a ~$${Number(MIN_COLLATERAL_USDC_RAW) / 1e6} minimum collateral (the $${LIQUIDATION_FEE_USD} liquidationFeeUsd buffer). ` +
      "RECOMMENDED: call `plan_open_position` first — it converts your target leverage + available collateral into the exact raw `size`/`collateral` integers to pass here, so you don't have to do 1e30 math yourself or risk `Vault: maxLeverage exceeded` / `Vault: liquidation fees exceed collateral` reverts. " +
      "Requires capital allocated via allocate_to_perp first. Caller must be vault owner. " +
      "BEFORE calling, run `plan_open_position` (or at minimum `get_perp_capital_snapshot` / `get_vault_pnl`) so the requested `collateral` fits the vault's `availableCollateral`; the MCP will otherwise short-circuit with `INSUFFICIENT_COLLATERAL` and embed the open-position roster so you can pick a leg to close. " +
      "PRE-FLIGHT: the MCP also refuses below-1x positions with `LEVERAGE_BELOW_1X` (no tx, no gas) when `size <= collateral * 1e24` — catches the common scaling bug where the agent multiplies size by 1e30 but forgets that collateral is in 1e6 USDC. " +
      "Returns {success, transactionHash, next_steps}.",
    inputSchema: {
      vault: z.string().describe("BasketVault address (0x...)"),
      assetId: z.string().describe("bytes32 asset id from get_oracle_assets"),
      isLong: z.boolean().describe("true = long (profit when price rises), false = short"),
      size: z.string().describe("Position size in GMX USD (~1e30 per $1, e.g. '10000000000000000000000000000000000' = $10,000)"),
      collateral: z.string().describe("USDC collateral (6 decimals, e.g. '2000000000' = $2,000)"),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ vault, assetId, isLong, size, collateral, justification }) => {
    const argErr = checkArgs([
      { name: "vault", value: vault, kind: "address" },
      { name: "assetId", value: assetId, kind: "bytes32" },
    ]);
    if (argErr) return argErr;

    // Validate `collateral` and `size` are non-empty integer strings.
    let collateralBn;
    let sizeBn;
    try {
      collateralBn = BigInt(String(collateral));
      sizeBn = BigInt(String(size));
    } catch {
      return toolError(
        "INVALID_ARGUMENT",
        `size/collateral must be integer-string values; got size=${size}, collateral=${collateral}.`,
        "Pass GMX USD size as a base-10 integer string (e.g. '10000000000000000000000000000000000' = $10,000) and collateral as raw USDC integer (e.g. '2000000000' = $2,000).",
      );
    }
    if (collateralBn <= 0n || sizeBn <= 0n) {
      return toolError(
        "INVALID_ARGUMENT",
        `size and collateral must be > 0; got size=${sizeBn}, collateral=${collateralBn}.`,
        "Re-check sizing logic and pass positive integer values.",
      );
    }

    // Pre-flight: refuse below-1x positions BEFORE `cast send` burns gas
    // on a guaranteed revert. The on-chain check is approximately
    // `require(_size > _collateral, "Vault: _size must be more than
    // _collateral")` evaluated AFTER both are normalised to the same
    // 1e30 USD scale — GMX-style size is in 1e30 USD scale while
    // collateral is in 1e6 USDC, so a 1x position needs
    //   size > collateral * 10**(30-6) = collateral * 1e24
    // Observed in commit ab42c05 (2026-05-23): the agent passed
    //   size=1e30 (1 USD), collateral=2.5e8 (250 USDC)
    // which scales to `1e30 vs 2.5e8 * 1e24 = 2.5e32` — way below 1x.
    // All three open_position calls reverted, burning gas, with the
    // raw require message providing no actionable detail (the agent
    // couldn't tell whether it was a sizing bug or a collateral bug).
    const COLLATERAL_TO_SIZE_SCALE = 10n ** 24n;
    if (sizeBn <= collateralBn * COLLATERAL_TO_SIZE_SCALE) {
      const sizeUsd = Number(sizeBn) / 1e30;
      const collateralUsd = Number(collateralBn) / 1e6;
      return toolError(
        "LEVERAGE_BELOW_1X",
        `Position is below 1x leverage: size=${sizeBn.toString()} GMX-USD (~$${sizeUsd.toFixed(4)}) ` +
          `vs collateral=${collateralBn.toString()} raw USDC (~$${collateralUsd.toFixed(2)}). ` +
          `On-chain require(size > collateral * 1e24) will revert with "Vault: _size must be more than _collateral".`,
        "Call `plan_open_position` to convert your target leverage + collateral into the exact raw `size`/`collateral` integers (size must satisfy `size > collateral * 1e24`). For a manual 1x position: pass `size = collateral * 1e24 + 1`. For 2x: `size = collateral * 2e24`. The MCP refuses to broadcast positions that the contract is guaranteed to revert.",
      );
    }

    const d = deployment();

    // Pre-flight: short-circuit known-fail open_position calls before they
    // hit `cast send`, so the LLM sees a structured INSUFFICIENT_COLLATERAL
    // payload (with requested vs available) instead of an opaque gas-estimate
    // revert. This is the same accounting check the on-chain
    // `require(collateral <= available)` enforces in
    // [src/perp/VaultAccounting.sol#L291], replicated locally over the
    // current view from `getVaultState`.
    const accountingState = readVaultAccountingState(d, vault);
    if (accountingState && accountingState.registered) {
      if (collateralBn > accountingState.available) {
        // Build the open-position roster so the LLM can pick a leg to close
        // in the SAME retry. Best-effort: a roster read failure (e.g. RPC
        // blip) must not swallow the structured INSUFFICIENT_COLLATERAL
        // payload, so we fall back to an empty array and embed the error.
        let openPositions = [];
        let rosterError = null;
        try {
          openPositions = buildOpenPositionsRoster(vault, d).map((p) => ({
            assetId: p.assetId,
            symbol: p.symbol,
            isLong: p.isLong,
            size: p.size,
            collateral: p.collateral,
            collateralUsdc: p.collateralUsdc,
            collateralUsdc_usdc: p.collateralUsdc_usdc,
            unrealisedPnlUsdc: p.unrealisedPnlUsdc,
            unrealisedPnlUsdc_usdc: p.unrealisedPnlUsdc_usdc,
            unrealisedPnlPctOfCollateral: p.unrealisedPnlPctOfCollateral,
            pnlBandOutcome: p.pnlBandOutcome,
          }));
        } catch (rosterErr) {
          rosterError = redactSecrets(rosterErr.message || String(rosterErr));
        }

        const payload = {
          success: false,
          error_code: "INSUFFICIENT_COLLATERAL",
          message:
            `Vault ${vault} has only ${accountingState.available.toString()} raw USDC free for new collateral, but the call requested ${collateralBn.toString()}. ` +
            `depositedCapital=${accountingState.depositedCapital.toString()}, collateralLocked=${accountingState.collateralLocked.toString()}, realisedPnL=${accountingState.realisedPnL.toString()}.`,
          vault,
          requestedCollateral: collateralBn.toString(),
          availableCollateral: accountingState.available.toString(),
          depositedCapital: accountingState.depositedCapital.toString(),
          collateralLocked: accountingState.collateralLocked.toString(),
          realisedPnL: accountingState.realisedPnL.toString(),
          positionCount: accountingState.positionCount.toString(),
          openPositions,
          recovery_hint:
            "Pick the leg in `openPositions` with the worst `unrealisedPnlPctOfCollateral` (or any leg whose `pnlBandOutcome` is `\"above_take_profit\"` / `\"below_stop_loss\"`) and call `close_position` on it with `sizeDelta=size` and `collateralDelta=collateral` to free locked capital, then retry `open_position`. Alternatively, size the new position down so `collateral <= availableCollateral`, or call `allocate_to_perp` from the vault's idle USDC. The runner's auto-rebalance pass may already have attempted rank-based rotation; remaining locked capital must be freed by you.",
        };
        if (rosterError) payload.rosterError = rosterError;
        return {
          content: [{
            type: "text",
            text: JSON.stringify(payload, null, 2),
          }],
          isError: true,
        };
      }
    }

    try {
      const rawReceipt = castSend(
        d.vaultAccounting,
        "openPosition(address,bytes32,bool,uint256,uint256)",
        [vault, assetId, String(isLong), size, collateral],
      );
      return writeResult(rawReceipt, [
        { tool: "get_position_tracking", reason: "Verify the position was opened", params_hint: { vault, assetId, isLong } },
        { tool: "get_vault_pnl", reason: "Check updated PnL", params_hint: { vault } },
      ], justification);
    } catch (err) {
      return writeError(err);
    }
  },
);

server.registerTool(
  "close_position",
  {
    title: "Close Position",
    description:
      "Reduce or fully close a perp position for a vault via VaultAccounting. " +
      "sizeDelta is the amount of size to reduce (GMX USD ~1e30 scale). " +
      "collateralDelta is the collateral to withdraw (GMX units). " +
      "To fully close, set sizeDelta to the position's full size. PnL is realised on close. " +
      "Caller must be vault owner. Returns {success, transactionHash, next_steps}.",
    inputSchema: {
      vault: z.string().describe("BasketVault address (0x...)"),
      assetId: z.string().describe("bytes32 asset id from get_oracle_assets"),
      isLong: z.boolean().describe("true for long, false for short — must match the open position"),
      sizeDelta: z.string().describe("Size to reduce in GMX USD (~1e30 per $1)"),
      collateralDelta: z.string().describe("Collateral to withdraw in GMX units"),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ vault, assetId, isLong, sizeDelta, collateralDelta, justification }) => {
    const argErr = checkArgs([
      { name: "vault", value: vault, kind: "address" },
      { name: "assetId", value: assetId, kind: "bytes32" },
    ]);
    if (argErr) return argErr;

    let sizeDeltaBn;
    let collateralDeltaBn;
    try {
      sizeDeltaBn = BigInt(String(sizeDelta));
      collateralDeltaBn = BigInt(String(collateralDelta));
    } catch {
      return toolError(
        "INVALID_ARGUMENT",
        `sizeDelta/collateralDelta must be integer-string values; got sizeDelta=${sizeDelta}, collateralDelta=${collateralDelta}.`,
        "Pass GMX USD deltas as base-10 integer strings (~1e30 per $1 for sizeDelta, GMX units for collateralDelta).",
      );
    }
    if (sizeDeltaBn <= 0n) {
      return toolError(
        "INVALID_ARGUMENT",
        `sizeDelta must be > 0; got sizeDelta=${sizeDeltaBn}.`,
        "To fully close, pass the position's full `size` from get_position_tracking.",
      );
    }

    const d = deployment();

    // Pre-flight: short-circuit close_position when the leg doesn't exist or
    // when sizeDelta exceeds the tracked size. The on-chain `require(sizeDelta
    // <= pos.size)` in VaultAccounting.closePosition would otherwise revert
    // with a generic Error(string) "Size exceeds position" payload.
    try {
      const posKey = castCall(
        d.vaultAccounting,
        "getPositionKey(address,bytes32,bool)(bytes32)",
        [vault, assetId, String(isLong)],
      );
      const trackingRaw = castCall(
        d.vaultAccounting,
        "getPositionTracking(bytes32)((address,bytes32,bool,uint256,uint256,uint256,uint256,uint256,bool))",
        [posKey],
      );
      const parsed = parseTrackingTuple(trackingRaw);
      if (!parsed || !parsed.exists) {
        return toolError(
          "POSITION_NOT_FOUND",
          `No tracked position for vault=${vault}, assetId=${assetId}, isLong=${isLong} (key=${posKey}).`,
          "Use list_open_positions or get_position_tracking to confirm direction and existence before close_position.",
        );
      }
      let posSize;
      try { posSize = BigInt(parsed.size); } catch { posSize = null; }
      if (posSize !== null && sizeDeltaBn > posSize) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error_code: "SIZE_EXCEEDS_POSITION",
              message: `sizeDelta ${sizeDeltaBn.toString()} exceeds tracked position size ${posSize.toString()} for ${assetId}.`,
              vault,
              assetId,
              isLong,
              positionSize: posSize.toString(),
              requestedSizeDelta: sizeDeltaBn.toString(),
              recovery_hint:
                "Cap sizeDelta at the position's full size from get_position_tracking. To fully close, use posSize as sizeDelta.",
            }, null, 2),
          }],
          isError: true,
        };
      }
    } catch {
      // Position read failed; fall through to cast send and let it surface
      // the underlying error. We don't want to block legitimate closes on a
      // transient RPC blip.
    }

    try {
      const rawReceipt = castSend(
        d.vaultAccounting,
        "closePosition(address,bytes32,bool,uint256,uint256)",
        [vault, assetId, String(isLong), sizeDelta, collateralDelta],
      );
      return writeResult(rawReceipt, [
        { tool: "get_vault_pnl", reason: "Check updated realised PnL", params_hint: { vault } },
        { tool: "withdraw_from_perp", reason: "Withdraw freed capital back to vault if desired", params_hint: { vault } },
      ], justification);
    } catch (err) {
      return writeError(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
