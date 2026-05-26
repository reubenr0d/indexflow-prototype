#!/usr/bin/env node

// MCP server for Nansen smart-money + token anomaly tools, scoped to
// Mantle. Required by agents/smart-money-mirror-manager.md.
//
// Two operating modes:
//
//   - LIVE: NANSEN_API_KEY is set. Calls are proxied to Nansen's REST
//     API. Endpoints intentionally narrow — the agent only needs holdings
//     + anomaly signals, never the full label graph.
//
//   - ENVIO_ONLY (degraded): NANSEN_API_KEY is unset. We query the
//     IndexFlow Envio HyperIndex for Mantle DEX swap aggregates and
//     derive a low-fidelity smart-money / anomaly signal locally so the
//     agent can still run, just with reduced confidence weights. The
//     `nansen_mode` field in every response tells the agent which mode
//     it's reading.
//
// Tools:
//   - nansen_smart_money_holdings({ chain?, lookbackHours? })
//       Returns an array of { token, smartMoneyWalletCount, netFlow7dUsd,
//       medianHoldingDays, confidenceTier }. `chain` is locked to
//       "mantle" until the agent expands beyond it.
//   - nansen_token_anomaly({ token, lookbackHours? })
//       Returns { token, severity, signals[], lookbackHours }. Severity is
//       "high" / "medium" / "low" / "none".
//
// Smoke mode: `node index.js --smoke` calls
// `nansen_smart_money_holdings({ chain: "mantle" })` and exits 0/1.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { classifyConfidenceTier } from "./confidence-tier.mjs";

const FETCH_TIMEOUT_MS = 15_000;
const NANSEN_BASE_URL = process.env.NANSEN_BASE_URL || "https://api.nansen.ai";
const SUPPORTED_CHAINS = new Set(["mantle"]);

function modeIsLive() {
  return Boolean(process.env.NANSEN_API_KEY);
}

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
          { success: false, error_code, message, ...extra },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Live mode (Nansen REST)
// ---------------------------------------------------------------------------

async function nansenLiveSmartMoneyHoldings({ chain, lookbackHours }) {
  const url = `${NANSEN_BASE_URL}/v1/smart-money/holdings?chain=${encodeURIComponent(chain)}&lookbackHours=${encodeURIComponent(lookbackHours)}`;
  const resp = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": process.env.NANSEN_API_KEY,
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Nansen HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const body = await resp.json();
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map((row) => {
    const wallets = Number(row.smartMoneyWalletCount ?? 0);
    const flow = Number(row.netFlowUsd ?? 0);
    const { tier } = classifyConfidenceTier({
      smartMoneyWalletCount: wallets,
      netFlow7dUsd: flow,
    });
    return {
      token: row.tokenSymbol || row.token,
      tokenAddress: row.tokenAddress || null,
      smartMoneyWalletCount: wallets,
      netFlow7dUsd: flow,
      medianHoldingDays: Number(row.medianHoldingDays ?? 0),
      confidenceTier: tier,
    };
  });
}

async function nansenLiveTokenAnomaly({ token, lookbackHours }) {
  const url = `${NANSEN_BASE_URL}/v1/token/anomaly?token=${encodeURIComponent(token)}&lookbackHours=${encodeURIComponent(lookbackHours)}`;
  const resp = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": process.env.NANSEN_API_KEY,
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Nansen HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const body = await resp.json();
  return {
    severity: body?.severity || "none",
    signals: Array.isArray(body?.signals) ? body.signals : [],
  };
}

// ---------------------------------------------------------------------------
// Degraded mode (Envio HyperIndex Mantle swap events)
// ---------------------------------------------------------------------------
//
// In the absence of a Nansen key we treat large net buys on Mantle DEX
// pools as a smart-money proxy. The signal is intentionally low-fidelity:
// confidence scores stay capped at "medium" and the response carries
// `nansen_mode: "envio_only"` so the agent can apply the documented weight
// reduction.

const ENVIO_FALLBACK_QUERY = `
  query MantleEcoSwaps($chain: numeric!, $sinceTimestampSec: numeric!) {
    SwapEvent(
      where: {
        chainId: { _eq: $chain }
        timestamp: { _gte: $sinceTimestampSec }
      }
      limit: 500
      order_by: { timestamp: desc }
    ) {
      tokenSymbol
      tokenAddress
      buyerAddress
      amountUsd
      timestamp
    }
  }
`;

async function fetchEnvioMantleSwaps({ lookbackHours }) {
  const url = process.env.ENVIO_URL;
  if (!url) {
    return { rows: [], reason: "ENVIO_URL unset; degraded fallback cannot reach indexer" };
  }
  const sinceTimestampSec = Math.floor(Date.now() / 1000) - lookbackHours * 3600;
  const body = JSON.stringify({
    query: ENVIO_FALLBACK_QUERY,
    variables: { chain: 5003, sinceTimestampSec },
  });
  try {
    const resp = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
    });
    if (!resp.ok) {
      return { rows: [], reason: `Envio HTTP ${resp.status}` };
    }
    const payload = await resp.json();
    // The IndexFlow Envio schema may not (yet) expose SwapEvent for Mantle —
    // returning errors is fine, we degrade further to an empty payload.
    if (payload?.errors) {
      return { rows: [], reason: `Envio GraphQL error: ${payload.errors[0]?.message ?? "unknown"}` };
    }
    const rows = payload?.data?.SwapEvent ?? [];
    return { rows, reason: null };
  } catch (err) {
    return { rows: [], reason: String(err?.message || err) };
  }
}

function aggregateSmartMoneyFromSwaps(rows) {
  // Bucket by token, count distinct buyers above the $10k threshold,
  // sum signed flow. This is the agent-documented degraded heuristic.
  const buckets = new Map();
  for (const row of rows) {
    const usd = Number(row.amountUsd ?? 0);
    if (!Number.isFinite(usd) || usd < 10_000) continue;
    const key = row.tokenSymbol || row.tokenAddress || "UNKNOWN";
    if (!buckets.has(key)) {
      buckets.set(key, {
        token: key,
        tokenAddress: row.tokenAddress || null,
        wallets: new Set(),
        netFlow7dUsd: 0,
      });
    }
    const bucket = buckets.get(key);
    bucket.wallets.add(row.buyerAddress);
    bucket.netFlow7dUsd += usd;
  }
  return Array.from(buckets.values()).map((b) => {
    const walletCount = b.wallets.size;
    const { tier } = classifyConfidenceTier({
      smartMoneyWalletCount: walletCount,
      netFlow7dUsd: b.netFlow7dUsd,
    });
    // Cap degraded mode at "medium" — never claim "high" without Nansen labels.
    const capped = tier === "high" ? "medium" : tier;
    return {
      token: b.token,
      tokenAddress: b.tokenAddress,
      smartMoneyWalletCount: walletCount,
      netFlow7dUsd: b.netFlow7dUsd,
      medianHoldingDays: 0,
      confidenceTier: capped,
    };
  });
}

// ---------------------------------------------------------------------------
// Tool entrypoints
// ---------------------------------------------------------------------------

async function nansenSmartMoneyHoldings({ chain = "mantle", lookbackHours = 168 }) {
  if (!SUPPORTED_CHAINS.has(chain)) {
    return toolError(
      "UNSUPPORTED_CHAIN",
      `Chain ${JSON.stringify(chain)} is not enabled in this MCP build. Supported: ${[...SUPPORTED_CHAINS].join(", ")}.`,
    );
  }
  if (modeIsLive()) {
    try {
      const holdings = await nansenLiveSmartMoneyHoldings({ chain, lookbackHours });
      return toolText({
        success: true,
        nansen_mode: "live",
        chain,
        lookbackHours,
        holdings,
        degraded: false,
      });
    } catch (err) {
      return toolError("NANSEN_FETCH_FAILED", String(err?.message || err), {
        recovery_hint:
          "Retry once; if the failure persists, unset NANSEN_API_KEY locally to fall back to the Envio-only path.",
      });
    }
  }
  // Degraded path.
  const { rows, reason } = await fetchEnvioMantleSwaps({ lookbackHours });
  const holdings = aggregateSmartMoneyFromSwaps(rows);
  return toolText({
    success: true,
    nansen_mode: "envio_only",
    chain,
    lookbackHours,
    holdings,
    degraded: true,
    degraded_reason:
      reason || "NANSEN_API_KEY unset; aggregated from Mantle DEX swap events via Envio.",
  });
}

async function nansenTokenAnomaly({ token, lookbackHours = 72 }) {
  if (typeof token !== "string" || !token.trim()) {
    return toolError("INVALID_TOKEN", "`token` must be a non-empty string (symbol or address).");
  }
  if (modeIsLive()) {
    try {
      const { severity, signals } = await nansenLiveTokenAnomaly({ token, lookbackHours });
      return toolText({
        success: true,
        nansen_mode: "live",
        token,
        lookbackHours,
        severity,
        signals,
        degraded: false,
      });
    } catch (err) {
      return toolError("NANSEN_FETCH_FAILED", String(err?.message || err));
    }
  }
  // Degraded anomaly detection: skip — we don't have label graph data.
  // Surface "unknown" rather than guessing so the agent knows to be cautious.
  return toolText({
    success: true,
    nansen_mode: "envio_only",
    token,
    lookbackHours,
    severity: "unknown",
    signals: [],
    degraded: true,
    degraded_reason:
      "NANSEN_API_KEY unset; anomaly detection requires Nansen label graph data and is not derivable from raw Envio swap events.",
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "nansen", version: "1.0.0" });

server.registerTool(
  "nansen_smart_money_holdings",
  {
    description:
      "Return smart-money holdings for a given chain (default: mantle). Each row carries { token, smartMoneyWalletCount, netFlow7dUsd, medianHoldingDays, confidenceTier }. Falls back to Envio-derived Mantle DEX swap aggregates when NANSEN_API_KEY is unset (response carries `nansen_mode: \"envio_only\"` and `degraded: true`).",
    inputSchema: {
      chain: z.string().optional().default("mantle"),
      lookbackHours: z.number().int().min(24).max(720).optional().default(168),
    },
  },
  nansenSmartMoneyHoldings,
);

server.registerTool(
  "nansen_token_anomaly",
  {
    description:
      "Return anomaly signals for a single token (whale liquidations, single-wallet dumps, label changes). Severity is `high`/`medium`/`low`/`none`/`unknown`. Without NANSEN_API_KEY the tool returns `severity: \"unknown\"` and an empty signal array.",
    inputSchema: {
      token: z.string().min(1),
      lookbackHours: z.number().int().min(8).max(720).optional().default(72),
    },
  },
  nansenTokenAnomaly,
);

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  if (process.argv.includes("--smoke")) {
    const res = await nansenSmartMoneyHoldings({ chain: "mantle" });
    const text = res?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text);
    if (parsed?.success) {
      console.log(JSON.stringify(parsed, null, 2));
      process.exit(0);
    }
    console.error(text);
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
