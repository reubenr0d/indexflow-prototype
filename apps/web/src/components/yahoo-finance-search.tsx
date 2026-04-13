"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useYahooFinanceSearch, type YFSearchResult } from "@/hooks/useYahooFinanceSearch";
import { Loader2, Search } from "lucide-react";

export interface YFSearchSelection {
  symbol: string;
  name: string;
  exchange: string;
}

interface YahooFinanceSearchProps {
  onSelect: (result: YFSearchSelection) => void;
  /** Pre-populated registered assets to show at the top of results. */
  registeredAssets?: Array<{ idHex: `0x${string}`; label: string; name: string }>;
  /** If provided, will call back when a registered asset is picked instead. */
  onSelectRegistered?: (asset: { idHex: `0x${string}`; label: string }) => void;
  /** Already-selected asset IDs to dim/exclude. */
  excludeIds?: Set<`0x${string}`>;
  placeholder?: string;
  value?: string;
  className?: string;
  "data-testid"?: string;
}

export function YahooFinanceSearch({
  onSelect,
  registeredAssets,
  onSelectRegistered,
  excludeIds,
  placeholder = "Search stocks (e.g. BHP.AX, Rio Tinto, Glencore...)",
  value: controlledValue,
  className,
  ...rest
}: YahooFinanceSearchProps) {
  const isControlled = controlledValue !== undefined;
  const [internalQuery, setInternalQuery] = useState(controlledValue ?? "");
  const query = isControlled ? controlledValue : internalQuery;
  const setQuery = setInternalQuery;
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const { results, isLoading } = useYahooFinanceSearch(query);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredRegistered = (registeredAssets ?? []).filter((a) => {
    if (excludeIds?.has(a.idHex)) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return a.label.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  });

  const allItems: Array<
    | { kind: "registered"; asset: (typeof filteredRegistered)[number] }
    | { kind: "yf"; result: YFSearchResult }
  > = [];
  for (const a of filteredRegistered) allItems.push({ kind: "registered", asset: a });
  for (const r of results) allItems.push({ kind: "yf", result: r });

  const handleSelect = useCallback(
    (item: (typeof allItems)[number]) => {
      if (item.kind === "registered") {
        onSelectRegistered?.(item.asset);
        setQuery(item.asset.label);
      } else {
        onSelect({ symbol: item.result.symbol, name: item.result.name, exchange: item.result.exchange });
        setQuery(item.result.symbol);
      }
      setOpen(false);
    },
    [onSelect, onSelectRegistered, setQuery]
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightIdx >= 0 && highlightIdx < allItems.length) {
      e.preventDefault();
      handleSelect(allItems[highlightIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && (allItems.length > 0 || isLoading);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
        <Input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlightIdx(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="pl-9"
          data-testid={rest["data-testid"]}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-app-muted" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-app-border bg-app-surface shadow-lg">
          {filteredRegistered.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                Registered Assets
              </div>
              {filteredRegistered.map((a, idx) => (
                <button
                  key={a.idHex}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-app-accent/10",
                    highlightIdx === idx && "bg-app-accent/10"
                  )}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onClick={() => handleSelect(allItems[idx])}
                >
                  <span className="font-medium text-app-text">{a.label}</span>
                  <span className="rounded bg-app-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-app-accent">
                    On-chain
                  </span>
                </button>
              ))}
            </>
          )}

          {results.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                Yahoo Finance
              </div>
              {results.map((r, rIdx) => {
                const idx = filteredRegistered.length + rIdx;
                return (
                  <button
                    key={r.symbol}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-app-accent/10",
                      highlightIdx === idx && "bg-app-accent/10"
                    )}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onClick={() => handleSelect(allItems[idx])}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-app-text">{r.symbol}</span>
                      <span className="ml-2 truncate text-app-muted">{r.name}</span>
                    </div>
                    <span className="ml-2 shrink-0 rounded bg-app-bg-subtle px-1.5 py-0.5 text-[10px] font-semibold text-app-muted">
                      {r.exchange}
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {isLoading && allItems.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-app-muted">Searching...</div>
          )}
        </div>
      )}
    </div>
  );
}
