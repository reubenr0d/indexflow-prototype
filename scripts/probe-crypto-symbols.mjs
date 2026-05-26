#!/usr/bin/env node
/**
 * Probe Yahoo vs Bybit coverage for KNOWN_BASES crypto symbols.
 *
 *   BYBIT_TESTNET=0 node scripts/probe-crypto-symbols.mjs
 *   BYBIT_TESTNET=0 node scripts/probe-crypto-symbols.mjs --json
 */

import { fetchLivePriceUsd } from "../apps/shared/yahoo-usd-quote.mjs";
import { fetchBybitIndexPriceUsd } from "../apps/shared/bybit-public-market.mjs";
import {
  KNOWN_CRYPTO_BASES,
  agentSymbolFromBase,
  yahooTickerForAgentSymbol,
  canUseBybitIndexOracleFallback,
} from "../apps/shared/crypto-oracle-symbols.mjs";
import { normaliseAgentSymbolToBybit } from "../apps/mcps/bybit/symbol-mapping.mjs";

const jsonOnly = process.argv.includes("--json");

async function probeOne(base) {
  const agentSymbol = agentSymbolFromBase(base);
  const yahooTicker = yahooTickerForAgentSymbol(agentSymbol);
  const bybitSymbol = normaliseAgentSymbolToBybit(agentSymbol);

  const row = {
    base,
    agentSymbol,
    yahooTicker,
    bybitSymbol,
    yahoo: { ok: false, priceUsd: null, error: null },
    bybit: { ok: false, indexPriceUsd: null, error: null },
    fallbackAllowed: canUseBybitIndexOracleFallback(agentSymbol),
    oracleEligible: false,
  };

  try {
    const live = await fetchLivePriceUsd(yahooTicker);
    row.yahoo = { ok: true, priceUsd: live.priceUsd, error: null };
  } catch (err) {
    row.yahoo.error = err?.message || String(err);
  }

  if (bybitSymbol) {
    try {
      const bb = await fetchBybitIndexPriceUsd(bybitSymbol);
      row.bybit = { ok: true, indexPriceUsd: bb.priceUsd, error: null };
    } catch (err) {
      row.bybit.error = err?.message || String(err);
    }
  } else {
    row.bybit.error = "not_mapped_to_bybit";
  }

  row.oracleEligible =
    row.yahoo.ok || (row.bybit.ok && row.fallbackAllowed);

  return row;
}

async function main() {
  const bases = [...KNOWN_CRYPTO_BASES].sort();
  const results = [];
  for (const base of bases) {
    results.push(await probeOne(base));
  }

  const summary = {
    probedAt: new Date().toISOString(),
    bybitVenue: process.env.BYBIT_TESTNET === "1" ? "testnet" : "mainnet",
    total: results.length,
    yahooOk: results.filter((r) => r.yahoo.ok).length,
    bybitOk: results.filter((r) => r.bybit.ok).length,
    oracleEligible: results.filter((r) => r.oracleEligible).length,
    results,
  };

  if (jsonOnly) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.oracleEligible === summary.total ? 0 : 1);
  }

  console.log(`Crypto probe (${summary.bybitVenue} Bybit) — ${summary.total} bases\n`);
  console.log(
    "base".padEnd(8) +
      "agent".padEnd(12) +
      "yahoo".padEnd(8) +
      "bybit".padEnd(8) +
      "oracle",
  );
  for (const r of results) {
    const y = r.yahoo.ok ? `$${r.yahoo.priceUsd}` : "FAIL";
    const b = r.bybit.ok ? `$${r.bybit.indexPriceUsd}` : "FAIL";
    const o = r.oracleEligible ? "yes" : "no";
    console.log(
      r.base.padEnd(8) +
        r.agentSymbol.padEnd(12) +
        y.padEnd(8) +
        b.padEnd(8) +
        o,
    );
  }
  console.log(
    `\nYahoo OK: ${summary.yahooOk}/${summary.total}  Bybit OK: ${summary.bybitOk}/${summary.total}  Oracle-eligible: ${summary.oracleEligible}/${summary.total}`,
  );
  console.log("\nSee docs/CRYPTO_ORACLE_COVERAGE.md");
  process.exit(summary.oracleEligible === summary.total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
