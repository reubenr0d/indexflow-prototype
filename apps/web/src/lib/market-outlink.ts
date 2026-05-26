import {
  resolveMarketOutlink as resolveMarketOutlinkJs,
  yahooFinanceQuoteUrl as yahooFinanceQuoteUrlJs,
  bybitLinearPerpTradeUrl as bybitLinearPerpTradeUrlJs,
} from "../../../shared/market-outlinks.mjs";

export type MarketVenue = "yahoo" | "bybit";
export type OracleSeedSource = "yahoo" | "bybit-index" | null;

export interface MarketOutlink {
  href: string;
  venue: MarketVenue;
  label: string;
  ariaLabel: string;
  yahooTicker?: string;
  bybitSymbol?: string;
}

export function yahooFinanceQuoteUrl(symbol: string): string {
  return yahooFinanceQuoteUrlJs(symbol);
}

export function bybitLinearPerpTradeUrl(bybitSymbol: string): string {
  return bybitLinearPerpTradeUrlJs(bybitSymbol, { testnet: false });
}

export function resolveMarketOutlink(params: {
  oracleSymbol: string;
  seedSource?: OracleSeedSource;
  bybitSymbol?: string | null;
  yahooTicker?: string | null;
  chartUsesBybit?: boolean;
}): MarketOutlink | null {
  return resolveMarketOutlinkJs(params) as MarketOutlink | null;
}
