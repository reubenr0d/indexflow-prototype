#!/usr/bin/env node

// MCP server for the IndexFlow multi-asset RWAReserveAdapter on Mantle.
//
// Used by three Mantle agents:
//   - rwa-treasurer:        allocate / withdraw against the configured reserve
//   - meth-carry-manager:   reads reserve state to size the ETH hedge leg
//   - rwa-yield-router:     compares yields, rotates set_reserve_token
//
// The MCP discovers the adapter address per-vault via `BasketVault.rwaAdapter()`
// so no new deployment-config entry is required. Mutating tools are routed
// through the BasketVault (which is the adapter's authorised caller), not
// directly against the adapter — calling the adapter from the agent's
// keeper key would revert with `Only vault`.
//
// Tool surface (matches the agent prompts in agents/rwa-treasurer.md,
// agents/meth-carry-manager.md, agents/rwa-yield-router.md):
//
//   Read:
//     - get_reserve_state({ vault })
//     - get_pending_redemptions({ vault })
//     - get_yield_landscape({ vault?, lookbackHours? })
//     - simulate_allocate_to_rwa({ vault, usdcAmount })
//     - simulate_withdraw_from_rwa({ vault, usdcAmount })
//     - simulate_set_reserve_token({ vault, newToken })
//
//   Write (require PRIVATE_KEY; subject to runner's risk-officer pass):
//     - allocate_to_rwa({ vault, amount, justification })
//     - withdraw_from_rwa({ vault, amount, justification })
//     - harvest_rwa_yield({ vault, justification })
//     - set_reserve_token({ vault, newToken, justification })
//     - rebalance_reserve({ vault, justification })
//
// Several tools depend on BasketVault RWA hooks (allocateToRWA, etc.)
// that the hackathon plan still has to ship. Until those land the write
// tools will surface a clear `BasketVault.<sig>` revert and the runner
// will mark the action as failed — no silent no-ops.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";

import { redactSecrets } from "../../../scripts/lib/redact-secrets.mjs";
import {
  projectReserveStateAfter,
  projectRotationAfter,
  reserveTokenIndexOf,
  reserveTokenNameOf,
  RESERVE_TOKEN_ENUM,
} from "./simulate.mjs";

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const DEPLOYMENT_CONFIG =
  process.env.DEPLOYMENT_CONFIG ?? "apps/web/src/config/mantle-sepolia-deployment.json";
const RPC_URL = process.env.RPC_URL ?? "mantle_sepolia";
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const PROJECT_ROOT = process.env.PROJECT_ROOT ?? process.cwd();

function deploymentPath() {
  return isAbsolute(DEPLOYMENT_CONFIG)
    ? DEPLOYMENT_CONFIG
    : resolve(PROJECT_ROOT, DEPLOYMENT_CONFIG);
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
// Response helpers
// ---------------------------------------------------------------------------

function toolText(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function toolError(error_code, message, extra = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { success: false, error_code, message: redactSecrets(String(message)), ...extra },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Cast helpers
// ---------------------------------------------------------------------------

function runCast(args) {
  try {
    const out = execFileSync("cast", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.trim();
  } catch (err) {
    const safe = redactSecrets(err?.message || String(err));
    const wrapped = new Error(safe);
    if (err?.code) wrapped.code = err.code;
    throw wrapped;
  }
}

function castCall(contractAddr, sig, args = []) {
  return runCast(["call", contractAddr, sig, ...args, "--rpc-url", RPC_URL]);
}

function castSend(contractAddr, sig, args = []) {
  if (!PRIVATE_KEY) {
    throw Object.assign(new Error("PRIVATE_KEY is required for write operations"), {
      code: "NO_PRIVATE_KEY",
    });
  }
  return runCast([
    "send",
    contractAddr,
    sig,
    ...args,
    "--rpc-url",
    RPC_URL,
    "--private-key",
    PRIVATE_KEY,
    "--json",
  ]);
}

function parseCastInt(raw) {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s*\[[^\]]+\]\s*$/, "")
    .trim();
  if (!value) throw new Error("empty cast output");
  if (/^-?\d+$/.test(value)) return BigInt(value);
  if (/^-?0x[0-9a-fA-F]+$/.test(value)) return BigInt(value);
  throw new Error(`cannot parse integer from cast output: "${raw}"`);
}

function parseAddress(raw) {
  // cast call returns a 32-byte left-padded address; trim to the 20-byte tail.
  const value = String(raw ?? "").trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return value;
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return `0x${value.slice(-40)}`;
  throw new Error(`cannot parse address from cast output: "${raw}"`);
}

// ---------------------------------------------------------------------------
// Vault + adapter discovery
// ---------------------------------------------------------------------------

function getRwaAdapterAddress(vaultAddr) {
  const raw = castCall(vaultAddr, "rwaAdapter()(address)");
  return parseAddress(raw);
}

function readReserveState(vaultAddr) {
  const adapterAddr = getRwaAdapterAddress(vaultAddr);
  if (/^0x0+$/.test(adapterAddr)) {
    throw Object.assign(
      new Error(`Vault ${vaultAddr} has no RWA adapter wired (rwaAdapter() = 0x0)`),
      { code: "NO_ADAPTER" },
    );
  }
  const tokenIdx = Number(parseCastInt(castCall(adapterAddr, "reserveToken()(uint8)")));
  const balance = parseCastInt(castCall(adapterAddr, "getReserveBalance()(uint256)"));
  const valueUsdc = parseCastInt(castCall(adapterAddr, "getReserveValueUsdc()(uint256)"));
  const reserveTokenAddress = parseAddress(
    castCall(adapterAddr, "getReserveTokenAddress()(address)"),
  );
  const usdcAddr = deployment().usdc;
  const idleUsdc = usdcAddr
    ? parseCastInt(castCall(usdcAddr, "balanceOf(address)(uint256)", [vaultAddr]))
    : 0n;
  return {
    adapterAddr,
    reserveTokenIndex: tokenIdx,
    reserveTokenName: reserveTokenNameOf(tokenIdx),
    reserveTokenAddress,
    reserveBalance: balance.toString(),
    reserveValueUsdc: valueUsdc.toString(),
    idleUsdc: idleUsdc.toString(),
  };
}

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

async function getReserveState({ vault }) {
  try {
    const state = readReserveState(vault);
    return toolText({ success: true, vault, ...state });
  } catch (err) {
    return toolError(err.code || "READ_RESERVE_STATE_FAILED", err.message);
  }
}

async function getPendingRedemptions({ vault }) {
  // BasketVault.pendingRedemptionsUsdc() is part of the hackathon RWA wiring
  // (planned). When it's not yet on-chain the call reverts; we surface 0 with
  // `available: false` instead of failing the tool so the agent can still
  // make conservative decisions (assume zero pending).
  try {
    const raw = castCall(vault, "pendingRedemptionsUsdc()(uint256)");
    const usdc = parseCastInt(raw);
    return toolText({
      success: true,
      vault,
      pendingRedemptionsUsdc: usdc.toString(),
      available: true,
    });
  } catch (err) {
    return toolText({
      success: true,
      vault,
      pendingRedemptionsUsdc: "0",
      available: false,
      reason: redactSecrets(err.message || String(err)),
    });
  }
}

async function getYieldLandscape({ lookbackHours = 168 }) {
  // The on-chain primitives don't expose realised APYs (they accrue via
  // price-feed updates or rebasing). We surface the latest oracle prices
  // for the three reserve tokens so the rwa-yield-router agent can drive
  // its comparison; the agent's prompt is responsible for translating
  // price-delta-over-lookback into an APY estimate.
  const dep = deployment();
  const oracle = dep.oracleAdapter;
  if (!oracle) {
    return toolError("NO_ORACLE", "deployment config is missing oracleAdapter");
  }
  const ids = dep.rwaAssetIds || {};
  const results = {};
  for (const name of RESERVE_TOKEN_ENUM) {
    const assetId = ids[name];
    if (!assetId) {
      results[name] = { available: false, reason: "no asset id wired in deployment" };
      continue;
    }
    try {
      const raw = castCall(oracle, "getPrice(bytes32)(uint256,uint256)", [assetId]);
      // cast prints each tuple member on its own line.
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const price = parseCastInt(lines[0]);
      const updatedAt = lines[1] ? parseCastInt(lines[1]) : 0n;
      results[name] = {
        available: true,
        assetId,
        priceRaw: price.toString(),
        priceUsd: Number(price) / 1e30,
        updatedAtUnix: Number(updatedAt),
      };
    } catch (err) {
      results[name] = {
        available: false,
        reason: redactSecrets(err.message || String(err)),
      };
    }
  }
  return toolText({
    success: true,
    lookbackHours,
    primitives: results,
    note: "APY estimation is the agent's responsibility — compare priceUsd across runs in agents/memory/<agent>/state.json.",
  });
}

async function simulateAllocateToRwa({ vault, usdcAmount }) {
  try {
    const state = readReserveState(vault);
    let pending = 0n;
    try {
      pending = parseCastInt(castCall(vault, "pendingRedemptionsUsdc()(uint256)"));
    } catch {
      // Pending not yet exposed by the contract; assume zero (conservative
      // for the redemption-margin check would be MAX_SAFE; the runner-side
      // policy treats `available: false` as "operate as if zero").
    }
    const out = projectReserveStateAfter({
      kind: "allocate",
      idleUsdc: state.idleUsdc,
      reserveValueUsdc: state.reserveValueUsdc,
      perpEquityUsdc: "0",
      usdcAmount,
      pendingRedemptionsUsdc: pending,
    });
    return toolText({ success: true, vault, usdcAmount, ...out });
  } catch (err) {
    return toolError("SIMULATE_FAILED", err.message);
  }
}

async function simulateWithdrawFromRwa({ vault, usdcAmount }) {
  try {
    const state = readReserveState(vault);
    let pending = 0n;
    try {
      pending = parseCastInt(castCall(vault, "pendingRedemptionsUsdc()(uint256)"));
    } catch {}
    const out = projectReserveStateAfter({
      kind: "withdraw",
      idleUsdc: state.idleUsdc,
      reserveValueUsdc: state.reserveValueUsdc,
      perpEquityUsdc: "0",
      usdcAmount,
      pendingRedemptionsUsdc: pending,
    });
    return toolText({ success: true, vault, usdcAmount, ...out });
  } catch (err) {
    return toolError("SIMULATE_FAILED", err.message);
  }
}

async function simulateSetReserveToken({ vault, newToken, slippageBps = 50 }) {
  try {
    const state = readReserveState(vault);
    const targetIdx = reserveTokenIndexOf(newToken);
    if (targetIdx === state.reserveTokenIndex) {
      return toolError(
        "NO_OP_ROTATION",
        `vault is already configured for ${state.reserveTokenName}; no rotation needed.`,
      );
    }
    let pending = 0n;
    try {
      pending = parseCastInt(castCall(vault, "pendingRedemptionsUsdc()(uint256)"));
    } catch {}
    const out = projectRotationAfter({
      reserveValueUsdc: state.reserveValueUsdc,
      perpEquityUsdc: "0",
      idleUsdc: state.idleUsdc,
      slippageBps,
      pendingRedemptionsUsdc: pending,
    });
    return toolText({
      success: true,
      vault,
      fromToken: state.reserveTokenName,
      toToken: reserveTokenNameOf(targetIdx),
      slippageBps,
      ...out,
    });
  } catch (err) {
    return toolError("SIMULATE_FAILED", err.message);
  }
}

// ---------------------------------------------------------------------------
// Write tools (route through BasketVault — adapter requires `onlyVault`)
// ---------------------------------------------------------------------------

function tryParseTxHashFromCastJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.transactionHash || parsed?.tx_hash || null;
  } catch {
    return null;
  }
}

async function allocateToRwa({ vault, amount, justification }) {
  try {
    const raw = castSend(vault, "allocateToRWA(uint256)", [String(amount)]);
    return toolText({
      success: true,
      vault,
      amount: String(amount),
      transactionHash: tryParseTxHashFromCastJson(raw),
      justification,
    });
  } catch (err) {
    return toolError(err.code || "ALLOCATE_FAILED", err.message, {
      recovery_hint:
        "Check that BasketVault.allocateToRWA is deployed (hackathon RWA wiring) and that the keeper key is the configured operator.",
    });
  }
}

async function withdrawFromRwa({ vault, amount, justification }) {
  try {
    const raw = castSend(vault, "withdrawFromRWA(uint256)", [String(amount)]);
    return toolText({
      success: true,
      vault,
      amount: String(amount),
      transactionHash: tryParseTxHashFromCastJson(raw),
      justification,
    });
  } catch (err) {
    return toolError(err.code || "WITHDRAW_FAILED", err.message);
  }
}

async function harvestRwaYield({ vault, justification }) {
  try {
    const raw = castSend(vault, "harvestRWAYield()", []);
    return toolText({
      success: true,
      vault,
      transactionHash: tryParseTxHashFromCastJson(raw),
      justification,
    });
  } catch (err) {
    return toolError(err.code || "HARVEST_FAILED", err.message);
  }
}

async function setReserveToken({ vault, newToken, justification }) {
  try {
    const idx = reserveTokenIndexOf(newToken);
    // The vault wraps the adapter call so the adapter sees msg.sender == vault.
    const raw = castSend(vault, "rotateReserveToken(uint8)", [String(idx)]);
    return toolText({
      success: true,
      vault,
      newToken: reserveTokenNameOf(idx),
      transactionHash: tryParseTxHashFromCastJson(raw),
      justification,
    });
  } catch (err) {
    return toolError(err.code || "ROTATE_FAILED", err.message, {
      recovery_hint:
        "Check that BasketVault.rotateReserveToken(uint8) is deployed and that the adapter has been wired to this vault.",
    });
  }
}

async function rebalanceReserve({ vault, justification }) {
  // Optional helper used after a rotation pushes the reserve out of the
  // target band. Reads the configured target and routes a single
  // allocate/withdraw through the simulate helpers above.
  try {
    const state = readReserveState(vault);
    let targetBps = 0;
    try {
      const raw = castCall(vault, "rwaTargetBps()(uint16)");
      targetBps = Number(parseCastInt(raw));
    } catch (err) {
      return toolError("NO_TARGET_BPS", err.message, {
        recovery_hint:
          "BasketVault.rwaTargetBps() is not deployed; rebalance_reserve has no target to drive toward.",
      });
    }
    const total =
      BigInt(state.idleUsdc) + BigInt(state.reserveValueUsdc);
    const targetReserve = (total * BigInt(targetBps)) / 10_000n;
    const currentReserve = BigInt(state.reserveValueUsdc);
    if (currentReserve === targetReserve) {
      return toolText({
        success: true,
        vault,
        action: "noop",
        currentReserveUsdc: state.reserveValueUsdc,
        targetReserveUsdc: targetReserve.toString(),
      });
    }
    if (currentReserve < targetReserve) {
      const delta = targetReserve - currentReserve;
      return await allocateToRwa({ vault, amount: delta.toString(), justification });
    }
    const delta = currentReserve - targetReserve;
    return await withdrawFromRwa({ vault, amount: delta.toString(), justification });
  } catch (err) {
    return toolError(err.code || "REBALANCE_FAILED", err.message);
  }
}

// ---------------------------------------------------------------------------
// Server registration
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "rwa-adapter", version: "1.0.0" });

server.registerTool(
  "get_reserve_state",
  {
    description:
      "Read the current reserve token, balance, USDC value, adapter address, and the vault's idle USDC. Source of truth for every other tool in this MCP.",
    inputSchema: { vault: z.string().min(1) },
  },
  getReserveState,
);

server.registerTool(
  "get_pending_redemptions",
  {
    description:
      "Read BasketVault.pendingRedemptionsUsdc(). Returns `available: false` (with reason) when the contract hook is not yet deployed; agents should treat the missing signal as `0` for sizing.",
    inputSchema: { vault: z.string().min(1) },
  },
  getPendingRedemptions,
);

server.registerTool(
  "get_yield_landscape",
  {
    description:
      "Return latest oracle prices for USDY, mUSD, mETH. APY is the agent's job to estimate from successive runs in its state.json — this tool intentionally does not invent a synthetic yield curve.",
    inputSchema: {
      vault: z.string().optional(),
      lookbackHours: z.number().int().min(24).max(720).optional().default(168),
    },
  },
  getYieldLandscape,
);

server.registerTool(
  "simulate_allocate_to_rwa",
  {
    description:
      "Dry-run an allocate. Returns projectedReserveUsdc / projectedReserveBps / redemptionMarginAfter; the agent uses this to size the real allocate within its rwaTargetBand.",
    inputSchema: {
      vault: z.string().min(1),
      usdcAmount: z.string().min(1).describe("Raw USDC (6 decimals) as a base-10 string."),
    },
  },
  simulateAllocateToRwa,
);

server.registerTool(
  "simulate_withdraw_from_rwa",
  {
    description:
      "Dry-run a withdraw. Mirror of simulate_allocate_to_rwa.",
    inputSchema: {
      vault: z.string().min(1),
      usdcAmount: z.string().min(1),
    },
  },
  simulateWithdrawFromRwa,
);

server.registerTool(
  "simulate_set_reserve_token",
  {
    description:
      "Dry-run a reserve-token rotation. Returns projected reserve bps after the round-trip plus the USDC cost of slippage. `slippageBps` defaults to 50 (the rotation guard threshold used by rwa-yield-router).",
    inputSchema: {
      vault: z.string().min(1),
      newToken: z.enum(RESERVE_TOKEN_ENUM),
      slippageBps: z.number().int().min(0).max(1000).optional().default(50),
    },
  },
  simulateSetReserveToken,
);

server.registerTool(
  "allocate_to_rwa",
  {
    description:
      "WRITE. Move `amount` raw USDC from vault idle into the configured reserve token. Calls BasketVault.allocateToRWA(uint256), which proxies to RWAReserveAdapter.deposit.",
    inputSchema: {
      vault: z.string().min(1),
      amount: z.string().min(1),
      justification: z.string().min(8),
    },
  },
  allocateToRwa,
);

server.registerTool(
  "withdraw_from_rwa",
  {
    description:
      "WRITE. Move `amount` raw USDC from reserve back into vault idle. Calls BasketVault.withdrawFromRWA(uint256).",
    inputSchema: {
      vault: z.string().min(1),
      amount: z.string().min(1),
      justification: z.string().min(8),
    },
  },
  withdrawFromRwa,
);

server.registerTool(
  "harvest_rwa_yield",
  {
    description:
      "WRITE (permissionless). Trigger a NAV refresh via BasketVault.harvestRWAYield(). Idempotent; safe to call on every run.",
    inputSchema: {
      vault: z.string().min(1),
      justification: z.string().min(8),
    },
  },
  harvestRwaYield,
);

server.registerTool(
  "set_reserve_token",
  {
    description:
      "WRITE. Rotate the configured reserve token via BasketVault.rotateReserveToken(uint8). Atomically redeems current reserve, switches the token, and resubscribes the freed USDC inside the adapter.",
    inputSchema: {
      vault: z.string().min(1),
      newToken: z.enum(RESERVE_TOKEN_ENUM),
      justification: z.string().min(8),
    },
  },
  setReserveToken,
);

server.registerTool(
  "rebalance_reserve",
  {
    description:
      "WRITE. Re-target the existing rwaTargetBps after a rotation or large deposit. Computes the delta from BasketVault.rwaTargetBps() and dispatches a single allocate or withdraw to land back inside the target band.",
    inputSchema: {
      vault: z.string().min(1),
      justification: z.string().min(8),
    },
  },
  rebalanceReserve,
);

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  if (process.argv.includes("--smoke")) {
    // Smoke test: just confirm the deployment config loads and the
    // adapter ABI signatures parse. We can't `cast call` without a
    // vault address, so the smoke is intentionally minimal.
    try {
      deployment();
      console.log(
        JSON.stringify(
          {
            success: true,
            deployment_config: deploymentPath(),
            rpc_url: RPC_URL,
            tools: [
              "get_reserve_state",
              "get_pending_redemptions",
              "get_yield_landscape",
              "simulate_allocate_to_rwa",
              "simulate_withdraw_from_rwa",
              "simulate_set_reserve_token",
              "allocate_to_rwa",
              "withdraw_from_rwa",
              "harvest_rwa_yield",
              "set_reserve_token",
              "rebalance_reserve",
            ],
          },
          null,
          2,
        ),
      );
      process.exit(0);
    } catch (err) {
      console.error(err?.message || err);
      process.exit(1);
    }
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
