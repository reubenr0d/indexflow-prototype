#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { classifySymbolWithSearch, symbolPolicyMessage } from "../../shared/yahoo-symbol-policy.mjs";

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const DEPLOYMENT_CONFIG = process.env.DEPLOYMENT_CONFIG ?? "apps/web/src/config/sepolia-deployment.json";
const RPC_URL = process.env.RPC_URL ?? "sepolia";
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const PROJECT_ROOT = process.env.PROJECT_ROOT ?? process.cwd();

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
    const raw = await client.search(symbol, { quotesCount: 20, newsCount: 0 });
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
  const payload = { success: false, error_code: code, message };
  if (recoveryHint) payload.recovery_hint = recoveryHint;
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Cast helpers
// ---------------------------------------------------------------------------

function castCall(contractAddr, sig, args = []) {
  const out = execFileSync(
    "cast",
    ["call", contractAddr, sig, ...args, "--rpc-url", RPC_URL],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return out.trim();
}

function castSend(contractAddr, sig, args = []) {
  if (!PRIVATE_KEY) {
    throw Object.assign(new Error("PRIVATE_KEY is required for write operations"), { code: "NO_PRIVATE_KEY" });
  }
  const out = execFileSync(
    "cast",
    ["send", contractAddr, sig, ...args, "--private-key", PRIVATE_KEY, "--rpc-url", RPC_URL, "--json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return out.trim();
}

function parseReceipt(rawJson) {
  try {
    const r = JSON.parse(rawJson);
    return {
      transactionHash: r.transactionHash,
      status: r.status === "0x1" ? "success" : "reverted",
      blockNumber: r.blockNumber ? parseIntSafe(r.blockNumber) : null,
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
  if (msg.includes("revert") || msg.includes("execution reverted")) {
    return toolError("TX_REVERTED", msg,
      "Transaction reverted. Use get_vault_state to check reserves, ownership, and asset configuration before retrying.");
  }
  return toolError("TX_FAILED", msg);
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
      "Returns human-readable companion fields (_usdc, _pct, _usd) alongside raw values. " +
      "Use get_all_vaults first to discover vault addresses. For PnL details, see also get_vault_pnl.",
    inputSchema: {
      vault: z.string().describe("BasketVault contract address (0x...)"),
    },
  },
  async ({ vault }) => {
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
      "Get unrealised and realised PnL for a vault from VaultAccounting, plus accounting state " +
      "(deposited capital, realised PnL, open interest, locked collateral, position count, registered flag). " +
      "Use get_vault_state first for the vault's general state. Use get_position_tracking for per-position details.",
    inputSchema: {
      vault: z.string().describe("BasketVault contract address (0x...)"),
    },
  },
  async ({ vault }) => {
    try {
      const d = deployment();
      const pnlRaw = castCall(d.vaultAccounting, "getVaultPnL(address)(int256,int256)", [vault]);
      const stateRaw = castCall(d.vaultAccounting, "getVaultState(address)((uint256,int256,uint256,uint256,uint256,bool))", [vault]);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ pnl: pnlRaw, vaultAccountingState: stateRaw }, null, 2),
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
      "Returns {count, assets: [{index, assetId, symbol, price, price_usd, active, feedType}]}. " +
      "Use the assetId values from this response in set_vault_assets, open_position, and close_position.",
    inputSchema: {},
  },
  async () => {
    try {
      const d = deployment();
      const count = parseIntSafe(castCall(d.oracleAdapter, "getAssetCount()(uint256)"));

      const assets = [];
      for (let i = 0; i < count; i++) {
        const assetId = castCall(d.oracleAdapter, "assetList(uint256)(bytes32)", [String(i)]);
        const configRaw = castCall(
          d.oracleAdapter,
          "getAssetConfig(bytes32)((address,uint8,uint256,uint256,uint8,bool))",
          [assetId],
        );
        const symbol = stripQuotes(castCall(d.oracleAdapter, "assetSymbols(bytes32)(string)", [assetId]));

        let price = null;
        let price_usd = null;
        try {
          price = castCall(d.oracleAdapter, "getPrice(bytes32)(uint256)", [assetId]);
          price_usd = formatOraclePrice8(price);
        } catch { /* price may not be set yet */ }

        const activeMatch = configRaw.match(/,\s*(true|false)\s*\)/);
        const active = activeMatch ? activeMatch[1] === "true" : false;

        const feedTypeMatch = configRaw.match(/,\s*(\d+)\s*,/);
        const feedType = feedTypeMatch ? parseInt(feedTypeMatch[1], 10) : -1;

        assets.push({ index: i, assetId, symbol, price, price_usd, active, feedType });
      }
      return { content: [{ type: "text", text: JSON.stringify({ count, assets }, null, 2) }] };
    } catch (err) {
      return toolError("READ_FAILED", err.message,
        "Check that RPC_URL and DEPLOYMENT_CONFIG are correct and the chain is reachable.");
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
      "Always call yfinance_quote first to get the current USD price for seedPriceUsd. " +
      "Returns {success, transactionHash, next_steps}.",
    inputSchema: {
      symbol: z.string().describe("Yahoo Finance ticker (e.g. 'BHP.AX', 'AAPL', 'GLEN.L')"),
      seedPriceUsd: z.number().positive().describe("Current price in USD from yfinance_quote (e.g. 45.20)"),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ symbol, seedPriceUsd, justification }) => {
    try {
      await validateWriteSymbolPolicy(symbol);
      const d = deployment();
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
      "Deploy a new basket vault via BasketFactory.createBasket. The vault is auto-registered with VaultAccounting. " +
      "Fees are in basis points: 100 bps = 1%, max 500 bps = 5%. " +
      "Returns {success, transactionHash, vaultAddress, next_steps}. " +
      "After creation, use the returned vaultAddress with set_vault_assets to configure tracked assets.",
    inputSchema: {
      name: z.string().describe("Vault display name (e.g. 'Mining Basket')"),
      depositFeeBps: z.number().int().min(0).max(500).describe("Deposit fee in bps (e.g. 50 = 0.5%)"),
      redeemFeeBps: z.number().int().min(0).max(500).describe("Redeem fee in bps (e.g. 50 = 0.5%)"),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ name, depositFeeBps, redeemFeeBps, justification }) => {
    try {
      const d = deployment();
      const rawReceipt = castSend(d.basketFactory, "createBasket(string,uint256,uint256)", [name, String(depositFeeBps), String(redeemFeeBps)]);
      const tx = parseReceipt(rawReceipt);
      const vaultAddress = extractVaultAddressFromCreateVaultReceipt(rawReceipt);
      const result = {
        success: tx.status === "success",
        ...tx,
        vaultAddress,
        next_steps: [
          { tool: "set_vault_assets", reason: "Configure which assets the vault tracks", params_hint: { vault: vaultAddress } },
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

server.registerTool(
  "set_vault_assets",
  {
    title: "Set Vault Assets",
    description:
      "Configure which oracle assets a vault tracks. Replaces the full asset list. " +
      "Each asset must be active in the OracleAdapter. Asset IDs are bytes32 hex strings (keccak256 of the Yahoo Finance symbol). " +
      "Use get_oracle_assets to find valid assetId values. " +
      "Returns {success, transactionHash, next_steps}.",
    inputSchema: {
      vault: z.string().describe("BasketVault address (0x...)"),
      assetIds: z.array(z.string()).describe("bytes32 asset IDs from get_oracle_assets (e.g. ['0x1a2b...', '0x3c4d...'])"),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ vault, assetIds, justification }) => {
    try {
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

server.registerTool(
  "allocate_to_perp",
  {
    title: "Allocate to Perp",
    description:
      "Move USDC from the vault's idle balance to VaultAccounting for perp trading. " +
      "Amount is in raw USDC units (6 decimals: 1000000 = 1 USDC). Only the vault owner can call this. " +
      "Respects minReserveBps and maxPerpAllocation caps — use get_vault_state to check availableForPerp first. " +
      "Returns {success, transactionHash, next_steps}.",
    inputSchema: {
      vault: z.string().describe("BasketVault address (0x...)"),
      amount: z.string().describe("USDC in raw units (e.g. '1000000' = 1 USDC, '500000000' = 500 USDC)"),
      justification: z.string().optional().describe("Why this action is being taken (surfaced in vault history UI)"),
    },
  },
  async ({ vault, amount, justification }) => {
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
    try {
      const rawReceipt = castSend(vault, "withdrawFromPerp(uint256)", [amount]);
      return writeResult(rawReceipt, [
        { tool: "get_vault_state", reason: "Verify updated reserve and allocation", params_hint: { vault } },
      ], justification);
    } catch (err) {
      if (err.message?.includes("InsufficientCapital")) {
        return toolError("INSUFFICIENT_CAPITAL", err.message,
          "Not enough free capital. Close open positions first with close_position, then retry.");
      }
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
      "Effective leverage = size / (collateral * 1e24). Keep collateral >= 10% of size for safety. " +
      "Requires capital allocated via allocate_to_perp first. Caller must be vault owner. " +
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
    try {
      const d = deployment();
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
    try {
      const d = deployment();
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
      if (err.message?.includes("PositionNotFound")) {
        return toolError("POSITION_NOT_FOUND", err.message,
          "No open position for this vault/asset/direction. Use get_position_tracking to verify.");
      }
      return writeError(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
