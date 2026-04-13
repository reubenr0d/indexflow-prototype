"use client";

import { useEffect, useRef, useState } from "react";

export interface YFSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
}

export function useYahooFinanceSearch(query: string, debounceMs = 300) {
  const [results, setResults] = useState<YFSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/yahoo-finance/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!controller.signal.aborted) {
          setResults(data.results ?? []);
          setError(data.error ?? null);
          setIsLoading(false);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Search failed");
          setResults([]);
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [query, debounceMs]);

  return { results, isLoading, error };
}

export interface YFQuote {
  requestedSymbol: string;
  resolvedSymbol: string | null;
  symbol: string;
  name: string;
  price: number | null;
  /** Local-currency price converted to USD (null when FX rate unavailable). */
  priceUsd: number | null;
  currency: string;
  exchange: string;
  marketState: string;
  isAmbiguous: boolean;
  candidates: string[];
}

export async function fetchYahooFinanceQuote(symbol: string): Promise<YFQuote | null> {
  try {
    const res = await fetch(`/api/yahoo-finance/quote?symbols=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.quotes?.[0] ?? null;
  } catch {
    return null;
  }
}
