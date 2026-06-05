import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { classifySymbolWithSearch } from "../../../../../../shared/yahoo-symbol-policy.mjs";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const fxCache = new Map<string, { rate: number; ts: number }>();
const FX_TTL_MS = 60_000;

function getSearchQuotes(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== "object") return [];
  const quotes = (raw as { quotes?: unknown }).quotes;
  if (!Array.isArray(quotes)) return [];
  return quotes.filter(
    (quote): quote is Record<string, unknown> => Boolean(quote) && typeof quote === "object",
  );
}

function getString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

async function getUsdRate(currency: string): Promise<number | null> {
  if (currency === "USD") return 1;
  const baseCurrency = currency === "GBp" ? "GBP" : currency;
  const cached = fxCache.get(baseCurrency);
  if (cached && Date.now() - cached.ts < FX_TTL_MS) {
    return currency === "GBp" ? cached.rate / 100 : cached.rate;
  }
  try {
    const pair = `${baseCurrency}USD=X`;
    const q = await yf.quote(pair);
    const rate = q.regularMarketPrice;
    if (!rate || rate <= 0) return null;
    fxCache.set(baseCurrency, { rate, ts: Date.now() });
    return currency === "GBp" ? rate / 100 : rate;
  } catch {
    return null;
  }
}

async function getSearchRows(symbol: string) {
  try {
    const raw = await yf.search(symbol, { quotesCount: 20, newsCount: 0 }, { validateResult: false });
    return getSearchQuotes(raw)
      .filter((quote) => "symbol" in quote)
      .map((quote) => {
        return {
          symbol: getString(quote, "symbol"),
          quoteType: getString(quote, "quoteType"),
          exchange: getString(quote, "exchDisp") || getString(quote, "exchange"),
          name: getString(quote, "longname") || getString(quote, "shortname"),
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
      symbols.map(async (symbol) => {
        const searchRows = await getSearchRows(symbol);
        const classification = classifySymbolWithSearch(symbol, searchRows);
        try {
          const q = await yf.quote(symbol);
          const price = q.regularMarketPrice ?? null;
          const currency = q.currency ?? "USD";
          let priceUsd: number | null = null;
          if (price != null) {
            const fxRate = await getUsdRate(currency);
            priceUsd = fxRate != null ? price * fxRate : null;
          }
          return {
            requestedSymbol: symbol,
            resolvedSymbol: q.symbol ?? null,
            symbol: q.symbol,
            name: (q as Record<string, unknown>).longName ?? (q as Record<string, unknown>).shortName ?? "",
            price,
            priceUsd,
            currency,
            exchange: q.fullExchangeName ?? "",
            marketState: q.marketState ?? "CLOSED",
            isAmbiguous: classification.isAmbiguous,
            candidates: classification.candidates,
          };
        } catch {
          return {
            requestedSymbol: symbol,
            resolvedSymbol: null,
            symbol,
            name: "",
            price: null,
            priceUsd: null,
            currency: "USD",
            exchange: "",
            marketState: "ERROR",
            isAmbiguous: classification.isAmbiguous,
            candidates: classification.candidates,
          };
        }
      })
    );

    return NextResponse.json({ quotes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quote failed";
    return NextResponse.json({ quotes: [], error: message }, { status: 502 });
  }
}
