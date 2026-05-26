import {
  oracleSymbolToYahooSymbol as oracleSymbolToYahooSymbolJs,
  YAHOO_SYMBOL_MAP as YAHOO_SYMBOL_MAP_JS,
  isCryptoAgentSymbol as isCryptoAgentSymbolJs,
} from "../../../shared/yahoo-symbol-map.mjs";

export const YAHOO_SYMBOL_MAP: Readonly<Record<string, string>> = YAHOO_SYMBOL_MAP_JS;

export function oracleSymbolToYahooSymbol(oracleSymbol: string | undefined | null): string | undefined {
  return oracleSymbolToYahooSymbolJs(oracleSymbol) as string | undefined;
}

export function isCryptoAgentSymbol(agentSymbol: string | undefined | null): boolean {
  return isCryptoAgentSymbolJs(agentSymbol);
}

export { yahooFinanceQuoteUrl } from "./market-outlink";
