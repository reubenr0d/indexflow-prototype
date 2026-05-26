/**
 * Crypto oracle symbol policy: IndexFlow agent shape (`BASE-USD`) vs Yahoo vs Bybit.
 *
 * - Oracle spot prices: Yahoo CustomRelayer first.
 * - Bybit index price: fallback only for symbols in BYBIT_INDEX_ORACLE_FALLBACK_SYMBOLS
 *   when Yahoo returns no quote (keeper + documented operator flow).
 * - Bybit perp data (funding, OI, klines): all KNOWN_BASES via bybit-mcp.
 */

import { KNOWN_BASES_FOR_TESTS } from "../mcps/bybit/symbol-mapping.mjs";

/** @type {ReadonlySet<string>} */
export const KNOWN_CRYPTO_BASES = KNOWN_BASES_FOR_TESTS;

/** Agent symbols eligible for Bybit index oracle fallback (Yahoo miss only). */
export const BYBIT_INDEX_ORACLE_FALLBACK_SYMBOLS = [...KNOWN_CRYPTO_BASES].map(
  (base) => `${base}-USD`,
);

/**
 * Yahoo ticker overrides when the agent symbol does not resolve on Yahoo.
 * Probe with `npm run probe:crypto-symbols` before adding entries.
 */
export const YAHOO_TICKER_OVERRIDES = {
  MATIC: "POL-USD",
};

const CRYPTO_AGENT_SYMBOL_RE = /^[A-Z0-9]{2,8}-USD$/;

export function agentSymbolFromBase(base) {
  const b = String(base ?? "").trim().toUpperCase();
  if (!b || !KNOWN_CRYPTO_BASES.has(b)) return null;
  return `${b}-USD`;
}

export function isCryptoAgentSymbol(symbol) {
  const s = String(symbol ?? "").trim().toUpperCase();
  if (!CRYPTO_AGENT_SYMBOL_RE.test(s)) return false;
  const base = s.replace(/-USD$/, "");
  return KNOWN_CRYPTO_BASES.has(base);
}

export function yahooTickerForAgentSymbol(agentSymbol) {
  const s = String(agentSymbol ?? "").trim().toUpperCase();
  if (!isCryptoAgentSymbol(s)) return s;
  const base = s.replace(/-USD$/, "");
  return YAHOO_TICKER_OVERRIDES[base] ?? s;
}

export function canUseBybitIndexOracleFallback(agentSymbol) {
  const s = String(agentSymbol ?? "").trim().toUpperCase();
  return BYBIT_INDEX_ORACLE_FALLBACK_SYMBOLS.includes(s);
}
