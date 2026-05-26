/**
 * Unified oracle seed price: Yahoo first, Bybit index fallback for allowlisted crypto.
 *
 * Used by keeper, admin register, vault-manager wire_asset, and yfinance_quote
 * so seed prices and deviation guards stay aligned.
 */

import { oracleSymbolToYahooSymbol } from "./yahoo-symbol-map.mjs";
import { fetchLivePriceUsd, YahooUnavailableError } from "./yahoo-usd-quote.mjs";
import {
  isCryptoAgentSymbol,
  canUseBybitIndexOracleFallback,
} from "./crypto-oracle-symbols.mjs";
import { fetchBybitIndexPriceUsd } from "./bybit-public-market.mjs";
import { normaliseAgentSymbolToBybit } from "../mcps/bybit/symbol-mapping.mjs";

/**
 * @typedef {"yahoo" | "bybit-index"} OracleSeedSource
 */

/**
 * @typedef {object} OracleSeedPrice
 * @property {string} requestedSymbol On-chain / agent symbol (e.g. BHP.AX, ETH-USD).
 * @property {string} yahooTicker Yahoo ticker actually queried.
 * @property {OracleSeedSource} source
 * @property {number} priceUsd USD price for wire_asset / keeper (8-dec on-chain).
 * @property {number} price Local quote price (same as priceUsd when USD).
 * @property {string} currency
 * @property {string} marketState
 * @property {string|null} resolvedSymbol
 * @property {string} name
 * @property {string} exchange
 * @property {string|null} bybitSymbol e.g. BTCUSDT when source is bybit-index.
 * @property {string} [yahooError] Set when Bybit fallback used after Yahoo miss.
 */

/**
 * Fetch USD seed price for an oracle symbol (equity commodity or crypto BASE-USD).
 * @param {string} agentSymbol
 * @returns {Promise<OracleSeedPrice>}
 */
export async function fetchOracleSeedPriceUsd(agentSymbol) {
  const requestedSymbol = String(agentSymbol ?? "").trim();
  if (!requestedSymbol) {
    throw new Error("missing symbol");
  }

  const yahooTicker = oracleSymbolToYahooSymbol(requestedSymbol) ?? requestedSymbol;

  try {
    const live = await fetchLivePriceUsd(yahooTicker);
    return {
      requestedSymbol,
      yahooTicker,
      source: "yahoo",
      priceUsd: live.priceUsd,
      price: live.price,
      currency: live.currency,
      marketState: live.marketState,
      resolvedSymbol: live.resolvedSymbol,
      name: live.name ?? "",
      exchange: live.exchange ?? "",
      bybitSymbol: null,
    };
  } catch (yahooErr) {
    const yahooMessage =
      yahooErr instanceof YahooUnavailableError
        ? yahooErr.message
        : String(yahooErr?.message || yahooErr);

    if (!canUseBybitIndexOracleFallback(requestedSymbol)) {
      throw new YahooUnavailableError(
        `No seed price for ${requestedSymbol} (Yahoo: ${yahooMessage})`,
        yahooErr instanceof Error ? yahooErr : undefined,
      );
    }

    const bybitSymbol = normaliseAgentSymbolToBybit(requestedSymbol);
    if (!bybitSymbol) {
      throw new YahooUnavailableError(
        `No seed price for ${requestedSymbol} (Yahoo: ${yahooMessage}; not mapped to Bybit)`,
        yahooErr instanceof Error ? yahooErr : undefined,
      );
    }

    const bb = await fetchBybitIndexPriceUsd(bybitSymbol);
    return {
      requestedSymbol,
      yahooTicker,
      source: "bybit-index",
      priceUsd: bb.priceUsd,
      price: bb.priceUsd,
      currency: "USD",
      marketState: "REGULAR",
      resolvedSymbol: requestedSymbol,
      name: `Bybit linear index (${bybitSymbol})`,
      exchange: "Bybit",
      bybitSymbol,
      yahooError: yahooMessage,
    };
  }
}

/**
 * Batch fetch for keeper-style loops. Missing symbols are omitted from the map.
 * @param {string[]} agentSymbols
 * @returns {Promise<Record<string, OracleSeedPrice & { ok: true }>>}
 */
export async function fetchOracleSeedPricesMap(agentSymbols) {
  const out = {};
  for (const symbol of agentSymbols) {
    try {
      const row = await fetchOracleSeedPriceUsd(symbol);
      out[symbol] = { ...row, ok: true };
    } catch (err) {
      console.warn(
        `  WARNING: seed price unavailable for ${symbol}: ${err?.message || err}`,
      );
    }
  }
  return out;
}

export { isCryptoAgentSymbol, canUseBybitIndexOracleFallback };
