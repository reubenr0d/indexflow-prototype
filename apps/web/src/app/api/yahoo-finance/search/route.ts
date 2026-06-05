import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function getString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function getSearchQuotes(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== "object") return [];
  const quotes = (raw as { quotes?: unknown }).quotes;
  if (!Array.isArray(quotes)) return [];
  return quotes.filter((quote): quote is Record<string, unknown> => Boolean(quote) && typeof quote === "object");
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const raw = await yf.search(q, { quotesCount: 20, newsCount: 0 }, { validateResult: false });
    const results = getSearchQuotes(raw)
      .filter((quote) => quote.quoteType === "EQUITY" && typeof quote.symbol === "string")
      .map((quote) => {
        return {
          symbol: quote.symbol as string,
          name: getString(quote, "longname") || getString(quote, "shortname"),
          exchange: getString(quote, "exchDisp") || getString(quote, "exchange"),
          sector: getString(quote, "sectorDisp"),
          industry: getString(quote, "industryDisp"),
        };
      });

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ results: [], error: message }, { status: 502 });
  }
}
