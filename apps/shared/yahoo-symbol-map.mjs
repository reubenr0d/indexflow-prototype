/**
 * Shared oracle-symbol → Yahoo Finance ticker map.
 *
 * Some on-chain oracle symbols differ from the Yahoo Finance ticker we want
 * to query for chart data. For example, gold/silver commodity codes (XAU,
 * XAG) are not quotable on Yahoo Finance — we use COMEX futures instead.
 *
 * This map is consumed by:
 *   - apps/web/src/lib/yahoo-finance.ts (web client + /api/yahoo-finance/history route)
 *   - scripts/fetch-historical-prices.js (testnet seeding)
 */

export const YAHOO_SYMBOL_MAP = Object.freeze({
  XAU: "GC=F",
  XAG: "SI=F",
});

/**
 * Resolve an oracle asset name to the Yahoo Finance ticker we should query.
 *
 * Returns `undefined` when the input is not a usable Yahoo symbol — e.g. an
 * empty value or a 0x-prefixed address-style placeholder used when no symbol
 * is configured on-chain.
 *
 * @param {string | undefined | null} oracleSymbol
 * @returns {string | undefined}
 */
export function oracleSymbolToYahooSymbol(oracleSymbol) {
  if (oracleSymbol == null) return undefined;
  const trimmed = String(oracleSymbol).trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase().startsWith("0x")) return undefined;
  return YAHOO_SYMBOL_MAP[trimmed] ?? trimmed;
}
