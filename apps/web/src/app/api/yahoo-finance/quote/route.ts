import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { classifySymbolWithSearch } from "../../../../../../shared/yahoo-symbol-policy.mjs";
import { fetchOracleSeedPriceUsd } from "../../../../../../shared/oracle-seed-price.mjs";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

async function getSearchRows(symbol: string) {
  try {
    const raw = await yf.search(symbol, { quotesCount: 20, newsCount: 0 });
    return (raw.quotes ?? [])
      .filter((quote) => "symbol" in quote)
      .map((quote) => {
        const q = quote as Record<string, unknown>;
        return {
          symbol: q.symbol as string,
          quoteType: (q.quoteType ?? "") as string,
          exchange: (q.exchDisp ?? q.exchange ?? "") as string,
          name: (q.longname ?? q.shortname ?? "") as string,
        };
      });
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("symbols")?.trim();
  if (!raw) {
    return NextResponse.json({ quotes: [] });
  }

  const symbols = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  try {
    const quotes = await Promise.all(
      symbols.map(async (requestedSymbol) => {
        const searchRows = await getSearchRows(requestedSymbol);
        const classification = classifySymbolWithSearch(requestedSymbol, searchRows);
        try {
          const seed = await fetchOracleSeedPriceUsd(requestedSymbol);
          return {
            requestedSymbol,
            resolvedSymbol: seed.resolvedSymbol,
            yahooTicker: seed.yahooTicker,
            symbol: seed.resolvedSymbol ?? requestedSymbol,
            name: seed.name,
            price: seed.price,
            priceUsd: seed.priceUsd,
            currency: seed.currency,
            exchange: seed.exchange,
            marketState: seed.marketState,
            source: seed.source,
            bybitSymbol: seed.bybitSymbol,
            isAmbiguous: classification.isAmbiguous,
            candidates: classification.candidates,
          };
        } catch {
          return {
            requestedSymbol,
            resolvedSymbol: null,
            yahooTicker: requestedSymbol,
            symbol: requestedSymbol,
            name: "",
            price: null,
            priceUsd: null,
            currency: "USD",
            exchange: "",
            marketState: "ERROR",
            source: null,
            bybitSymbol: null,
            isAmbiguous: classification.isAmbiguous,
            candidates: classification.candidates,
          };
        }
      }),
    );

    return NextResponse.json({ quotes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quote failed";
    return NextResponse.json({ quotes: [], error: message }, { status: 502 });
  }
}
