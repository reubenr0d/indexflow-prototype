"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useOraclePriceHistory } from "@/hooks/useOraclePriceHistory";
import { useOracleAssetMetaMap, useOracleAssetPrice } from "@/hooks/useOracle";
import { useYahooPriceHistory } from "@/hooks/useYahooPriceHistory";
import {
  historyChartPoints,
  PRICE_CHART_SOURCE_OPTIONS,
  type PriceChartSource,
  type PriceHistoryWindow,
} from "@/lib/oracle-price-history";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { oracleSymbolToYahooSymbol, yahooFinanceQuoteUrl } from "@/lib/yahoo-finance";
import { ExternalLink } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";

const WINDOW_OPTIONS: { value: PriceHistoryWindow; label: string }[] = [
  { value: "24H", label: "24H" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
];

interface AssetPricePanelProps {
  assetIds: `0x${string}`[];
  className?: string;
}

export function AssetPricePanel({ assetIds, className }: AssetPricePanelProps) {
  const [window, setWindow] = useState<PriceHistoryWindow>("7D");
  const [source, setSource] = useState<PriceChartSource>("both");
  const { data: assetMeta } = useOracleAssetMetaMap();

  if (assetIds.length === 0) return null;

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-app-muted">
          Asset Prices
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            options={PRICE_CHART_SOURCE_OPTIONS}
            value={source}
            onChange={setSource}
            ariaLabel="Price source"
          />
          <SegmentedControl
            options={WINDOW_OPTIONS}
            value={window}
            onChange={setWindow}
            ariaLabel="Price history window"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {assetIds.map((assetId) => {
          const name = assetMeta.get(assetId)?.name;
          const label = name ?? assetId.slice(0, 10);
          const yahooSymbol = oracleSymbolToYahooSymbol(name);
          return (
            <AssetMiniChart
              key={assetId}
              assetId={assetId}
              label={label}
              yahooSymbol={yahooSymbol}
              window={window}
              source={source}
            />
          );
        })}
      </div>
    </div>
  );
}

const ONCHAIN_COLOR = "var(--accent)";

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { timestamp: number; onchainUsd?: number; yahooUsd?: number };
    dataKey?: string;
  }>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  return (
    <div className="rounded-md border border-app-border bg-app-surface px-2 py-1 text-xs shadow">
      {pt.onchainUsd != null && (
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-app-text">
            ${pt.onchainUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-app-muted">on-chain</span>
        </div>
      )}
      {pt.yahooUsd != null && (
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-app-text">
            ${pt.yahooUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-app-muted">yahoo</span>
        </div>
      )}
      <span className="mt-1 block text-app-muted">
        {new Date(pt.timestamp * 1000).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}

interface MergedChartPoint {
  timestamp: number;
  onchainUsd?: number;
  yahooUsd?: number;
}

function mergeSeries(
  onchain: { timestamp: number; priceUsd: number }[],
  yahoo: { timestamp: number; priceUsd: number }[],
): MergedChartPoint[] {
  const map = new Map<number, MergedChartPoint>();
  for (const p of onchain) {
    map.set(p.timestamp, { timestamp: p.timestamp, onchainUsd: p.priceUsd });
  }
  for (const p of yahoo) {
    const existing = map.get(p.timestamp);
    if (existing) existing.yahooUsd = p.priceUsd;
    else map.set(p.timestamp, { timestamp: p.timestamp, yahooUsd: p.priceUsd });
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function AssetMiniChart({
  assetId,
  label,
  yahooSymbol,
  window,
  source,
}: {
  assetId: `0x${string}`;
  label: string;
  yahooSymbol?: string;
  window: PriceHistoryWindow;
  source: PriceChartSource;
}) {
  const { data: priceData } = useOracleAssetPrice(assetId);
  const { data: history, isLoading: isOnchainLoading } = useOraclePriceHistory(
    assetId,
    window,
  );

  const wantsYahoo = source !== "onchain" && Boolean(yahooSymbol);
  const yahooQuery = useYahooPriceHistory(wantsYahoo ? yahooSymbol : undefined, window);

  const showOnchain = source !== "yahoo" || !yahooSymbol;
  const showYahoo = wantsYahoo && yahooQuery.error == null;

  const currentPrice = (priceData as [bigint, bigint] | undefined)?.[0] ?? 0n;
  const onchainPoints = useMemo(() => historyChartPoints(history), [history]);
  const yahooPoints = yahooQuery.data;

  const chartData = useMemo(
    () =>
      mergeSeries(
        showOnchain ? onchainPoints : [],
        showYahoo ? yahooPoints : [],
      ),
    [onchainPoints, yahooPoints, showOnchain, showYahoo],
  );

  const change = useMemo(() => {
    const reference = showYahoo && !showOnchain ? yahooPoints : onchainPoints;
    if (reference.length < 2) return null;
    const first = reference[0].priceUsd;
    const last = reference[reference.length - 1].priceUsd;
    if (first === 0) return null;
    const pct = ((last - first) / first) * 100;
    return { pct, positive: pct >= 0 };
  }, [onchainPoints, yahooPoints, showOnchain, showYahoo]);

  const priceRange = useMemo(() => {
    const values: number[] = [];
    if (showOnchain) for (const p of onchainPoints) values.push(p.priceUsd);
    if (showYahoo) for (const p of yahooPoints) values.push(p.priceUsd);
    if (values.length === 0) return { min: 0, max: 1 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.1 || 0.01;
    return { min: Math.max(0, min - pad), max: max + pad };
  }, [onchainPoints, yahooPoints, showOnchain, showYahoo]);

  const onchainStroke =
    change === null || change.positive ? "var(--success)" : "var(--danger)";
  const yahooStroke = ONCHAIN_COLOR;

  const isLoading = (showOnchain && isOnchainLoading) || (showYahoo && yahooQuery.isLoading);
  const hasData =
    (showOnchain && onchainPoints.length >= 2) ||
    (showYahoo && yahooPoints.length >= 2);

  const yahooMissing = source !== "onchain" && !yahooSymbol;
  const yahooFetchError = wantsYahoo && yahooQuery.error != null;

  return (
    <Card className="flex flex-col p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        {yahooSymbol ? (
          <a
            href={yahooFinanceQuoteUrl(yahooSymbol)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-app-text hover:text-app-accent"
            aria-label={`View ${label} on Yahoo Finance`}
          >
            <span className="truncate">{label}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
          </a>
        ) : (
          <span className="truncate text-xs font-semibold text-app-text">{label}</span>
        )}
        {change !== null && (
          <span
            className={cn(
              "shrink-0 font-mono text-[11px] font-semibold",
              change.positive ? "text-app-success" : "text-app-danger",
            )}
          >
            {change.positive ? "+" : ""}
            {change.pct.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-app-text">
          {formatPrice(currentPrice)}
        </span>
        {(yahooMissing || yahooFetchError) && (
          <span
            className="rounded bg-app-bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-app-muted"
            title={yahooMissing ? "No Yahoo Finance ticker mapped for this asset" : "Yahoo Finance request failed"}
          >
            {yahooMissing ? "No Yahoo" : "Yahoo error"}
          </span>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-[100px] w-full rounded" />
      ) : !hasData ? (
        <div className="flex h-[100px] items-center justify-center text-[11px] text-app-muted">
          Not enough data
        </div>
      ) : (
        <div className="h-[100px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-on-${assetId.slice(2, 10)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={onchainStroke} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={onchainStroke} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`grad-yf-${assetId.slice(2, 10)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={yahooStroke} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={yahooStroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis domain={[priceRange.min, priceRange.max]} hide />
              <RechartsTooltip content={<ChartTooltip />} />
              {showOnchain && (
                <Area
                  type="monotone"
                  dataKey="onchainUsd"
                  name="On-chain"
                  stroke={onchainStroke}
                  strokeWidth={1.5}
                  fill={`url(#grad-on-${assetId.slice(2, 10)})`}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 1.5 }}
                  connectNulls
                />
              )}
              {showYahoo && (
                <Area
                  type="monotone"
                  dataKey="yahooUsd"
                  name="Yahoo"
                  stroke={yahooStroke}
                  strokeWidth={1.5}
                  strokeDasharray={source === "both" ? "4 3" : undefined}
                  fill={
                    source === "both"
                      ? "transparent"
                      : `url(#grad-yf-${assetId.slice(2, 10)})`
                  }
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 1.5 }}
                  connectNulls
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
