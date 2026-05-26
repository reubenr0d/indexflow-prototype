/**
 * External market quote URLs (Yahoo Finance vs Bybit linear perps).
 */

import { oracleSymbolToYahooSymbol } from "./yahoo-symbol-map.mjs";
import { normaliseAgentSymbolToBybit } from "../mcps/bybit/symbol-mapping.mjs";

export function yahooFinanceQuoteUrl(symbol) {
  const s = String(symbol ?? "").trim();
  if (!s) return "https://finance.yahoo.com/";
  return `https://finance.yahoo.com/quote/${encodeURIComponent(s)}/`;
}

/**
 * @param {string} bybitSymbol e.g. BTCUSDT
 * @param {{ testnet?: boolean }} [opts]
 */
export function bybitLinearPerpTradeUrl(bybitSymbol, opts = {}) {
  const sym = String(bybitSymbol ?? "").trim().toUpperCase();
  const testnet =
    opts.testnet === true ||
    (opts.testnet !== false && process.env.BYBIT_TESTNET === "1");
  const base = testnet ? "https://testnet.bybit.com" : "https://www.bybit.com";
  return `${base}/trade/usdt/${encodeURIComponent(sym)}`;
}

/**
 * @typedef {"yahoo" | "bybit"} MarketVenue
 */

/**
 * @typedef {object} MarketOutlink
 * @property {string} href
 * @property {MarketVenue} venue
 * @property {string} label
 * @property {string} ariaLabel
 * @property {string} [yahooTicker]
 * @property {string} [bybitSymbol]
 */

/**
 * Resolve an external quote link for an oracle symbol.
 *
 * @param {object} params
 * @param {string} params.oracleSymbol On-chain / agent symbol (e.g. RNDR-USD, BHP.AX).
 * @param {"yahoo"|"bybit-index"|null|undefined} [params.seedSource] From fetchOracleSeedPriceUsd / quote API.
 * @param {string|null|undefined} [params.bybitSymbol] e.g. RNDRUSDT when seed is Bybit.
 * @param {string|null|undefined} [params.yahooTicker] Yahoo ticker queried (may differ from oracle symbol).
 * @param {boolean} [params.chartUsesBybit] Chart/UI is showing Bybit klines as the off-chain reference.
 * @param {{ testnet?: boolean }} [params.bybitOpts]
 * @returns {MarketOutlink|null}
 */
export function resolveMarketOutlink(params) {
  const oracleSymbol = String(params.oracleSymbol ?? "").trim();
  if (!oracleSymbol) return null;

  const prefersBybit =
    params.seedSource === "bybit-index" || params.chartUsesBybit === true;

  if (prefersBybit) {
    const bybitSymbol =
      String(params.bybitSymbol ?? "").trim().toUpperCase() ||
      normaliseAgentSymbolToBybit(oracleSymbol);
    if (bybitSymbol) {
      return {
        href: bybitLinearPerpTradeUrl(bybitSymbol, params.bybitOpts),
        venue: "bybit",
        label: "Bybit",
        ariaLabel: `View ${oracleSymbol} on Bybit`,
        bybitSymbol,
      };
    }
  }

  const yahooTicker =
    String(params.yahooTicker ?? "").trim() ||
    oracleSymbolToYahooSymbol(oracleSymbol) ||
    oracleSymbol;

  return {
    href: yahooFinanceQuoteUrl(yahooTicker),
    venue: "yahoo",
    label: "Yahoo Finance",
    ariaLabel: `View ${oracleSymbol} on Yahoo Finance`,
    yahooTicker,
  };
}
