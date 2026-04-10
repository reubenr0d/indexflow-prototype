import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const fxCache = new Map<string, { rate: number; ts: number }>();
const FX_TTL_MS = 60_000;

async function getUsdRate(currency: string): Promise<number | null> {
  if (currency === "USD") return 1;
  const cached = fxCache.get(currency);
  if (cached && Date.now() - cached.ts < FX_TTL_MS) return cached.rate;
  try {
    const pair = `${currency}USD=X`;
    const q = await yf.quote(pair);
    const rate = q.regularMarketPrice;
    if (!rate || rate <= 0) return null;
    fxCache.set(currency, { rate, ts: Date.now() });
    return rate;
  } catch {
    return null;
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
            symbol: q.symbol,
            name: (q as Record<string, unknown>).longName ?? (q as Record<string, unknown>).shortName ?? "",
            price,
            priceUsd,
            currency,
            exchange: q.fullExchangeName ?? "",
            marketState: q.marketState ?? "CLOSED",
          };
        } catch {
          return { symbol, name: "", price: null, priceUsd: null, currency: "USD", exchange: "", marketState: "ERROR" };
        }
      })
    );

    return NextResponse.json({ quotes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quote failed";
    return NextResponse.json({ quotes: [], error: message }, { status: 502 });
  }
}
