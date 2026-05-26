import { useQuery } from "@tanstack/react-query";
import type { YFQuote } from "@/hooks/useYahooFinanceSearch";
import { isCryptoAgentSymbol } from "@/lib/yahoo-finance";

async function fetchSeedQuote(symbol: string): Promise<YFQuote | null> {
  const res = await fetch(`/api/yahoo-finance/quote?symbols=${encodeURIComponent(symbol)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { quotes?: YFQuote[] };
  return data.quotes?.[0] ?? null;
}

/**
 * Live seed quote metadata (Yahoo vs Bybit index) for crypto oracle symbols.
 * Used to pick the correct external market outlink when seedSource is not passed from a parent form.
 */
export function useOracleSeedQuote(oracleSymbol: string | undefined) {
  const sym = oracleSymbol?.trim() ?? "";
  const enabled = Boolean(sym) && isCryptoAgentSymbol(sym);

  return useQuery({
    queryKey: ["oracle-seed-quote", sym],
    queryFn: () => fetchSeedQuote(sym),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}
