import type { PriceHistoryWindow } from "@/lib/oracle-price-history";
import type { BybitPriceChartPoint } from "@/hooks/useBybitPriceHistory";
import type { YahooPriceChartPoint } from "@/hooks/useYahooPriceHistory";
import { isCryptoAgentSymbol } from "@/lib/yahoo-finance";

/** Use Bybit klines when Yahoo has fewer than two points and the asset is crypto. */
export function shouldFetchBybitKlineFallback(
  agentSymbol: string | undefined,
  yahooPointCount: number,
  wantsOffchain: boolean,
): boolean {
  if (!wantsOffchain) return false;
  const sym = agentSymbol?.trim() ?? "";
  if (!sym || !isCryptoAgentSymbol(sym)) return false;
  return yahooPointCount < 2;
}

export function pickChangeReferenceSeries(
  onchain: { priceUsd: number }[],
  yahoo: YahooPriceChartPoint[],
  bybit: BybitPriceChartPoint[],
  opts: {
    showOnchain: boolean;
    hasOnchainData: boolean;
    showYahoo: boolean;
    hasYahooData: boolean;
    showBybit: boolean;
    hasBybitData: boolean;
  },
): { priceUsd: number }[] | null {
  if (opts.showOnchain && opts.hasOnchainData) return onchain;
  if (opts.showYahoo && opts.hasYahooData) return yahoo;
  if (opts.showBybit && opts.hasBybitData) return bybit;
  return null;
}

export function windowLabelWithSources(
  yahooSymbol: string | undefined,
  showBybit: boolean,
): string {
  if (showBybit && yahooSymbol) return `Yahoo (${yahooSymbol}) + Bybit`;
  if (showBybit) return "Bybit";
  return yahooSymbol ? `Yahoo: ${yahooSymbol}` : "Yahoo unavailable";
}
