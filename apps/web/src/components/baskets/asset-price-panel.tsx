"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useOraclePriceHistory } from "@/hooks/useOraclePriceHistory";
import { useOracleAssetMetaMap, useOracleAssetPrice } from "@/hooks/useOracle";
import { useYahooPriceHistory } from "@/hooks/useYahooPriceHistory";
import { useBybitPriceHistory } from "@/hooks/useBybitPriceHistory";
import {
  historyChartPoints,
  PRICE_CHART_SOURCE_OPTIONS,
  type PriceChartSource,
  type PriceHistoryWindow,
} from "@/lib/oracle-price-history";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { oracleSymbolToYahooSymbol } from "@/lib/yahoo-finance";
import { MarketOutlink } from "@/components/market-outlink";
import {
  pickChangeReferenceSeries,
  shouldFetchBybitKlineFallback,
} from "@/lib/offchain-price-chart";
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
              agentSymbol={name}
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
    payload: { timestamp: number; onchainUsd?: number; yahooUsd?: number; bybitUsd?: number };
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
      {pt.bybitUsd != null && (
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-app-text">
            ${pt.bybitUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-app-muted">bybit</span>
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
  bybitUsd?: number;
}

function mergeSeries(
  onchain: { timestamp: number; priceUsd: number }[],
  yahoo: { timestamp: number; priceUsd: number }[],
  bybit: { timestamp: number; priceUsd: number }[] = [],
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
  for (const p of bybit) {
    const existing = map.get(p.timestamp);
    if (existing) existing.bybitUsd = p.priceUsd;
    else map.set(p.timestamp, { timestamp: p.timestamp, bybitUsd: p.priceUsd });
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function AssetMiniChart({
  assetId,
  label,
  agentSymbol,
  yahooSymbol,
  window,
  source,
}: {
  assetId: `0x${string}`;
  label: string;
  agentSymbol?: string;
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

  const wantsBybit = shouldFetchBybitKlineFallback(
    agentSymbol,
    yahooQuery.data.length,
    wantsYahoo,
  );
  const bybitQuery = useBybitPriceHistory(agentSymbol, window, wantsBybit);

  const showOnchain = source !== "yahoo" || !yahooSymbol;
  const showYahoo = wantsYahoo && yahooQuery.error == null && yahooQuery.data.length >= 2;
  const showBybit = wantsBybit && bybitQuery.error == null && bybitQuery.data.length >= 2;

  const currentPrice = (priceData as [bigint, bigint] | undefined)?.[0] ?? 0n;
  const onchainPoints = useMemo(() => historyChartPoints(history), [history]);
  const yahooPoints = yahooQuery.data;
  const bybitPoints = bybitQuery.data;

  const hasOnchainData = onchainPoints.length >= 2;
  const hasYahooData = yahooPoints.length >= 2;
  const hasBybitData = bybitPoints.length >= 2;

  const chartData = useMemo(
    () =>
      mergeSeries(
        showOnchain && hasOnchainData ? onchainPoints : [],
        showYahoo && hasYahooData ? yahooPoints : [],
        showBybit && hasBybitData ? bybitPoints : [],
      ),
    [
      onchainPoints,
      yahooPoints,
      bybitPoints,
      showOnchain,
      showYahoo,
      showBybit,
      hasOnchainData,
      hasYahooData,
      hasBybitData,
    ],
  );

  const change = useMemo(() => {
    const reference = pickChangeReferenceSeries(onchainPoints, yahooPoints, bybitPoints, {
      showOnchain,
      hasOnchainData,
      showYahoo,
      hasYahooData,
      showBybit,
      hasBybitData,
    });
    if (!reference || reference.length < 2) return null;
    const first = reference[0].priceUsd;
    const last = reference[reference.length - 1].priceUsd;
    if (first === 0) return null;
    const pct = ((last - first) / first) * 100;
    return { pct, positive: pct >= 0 };
  }, [
    onchainPoints,
    yahooPoints,
    bybitPoints,
    showOnchain,
    showYahoo,
    showBybit,
    hasOnchainData,
    hasYahooData,
    hasBybitData,
  ]);

  const priceRange = useMemo(() => {
    const values: number[] = [];
    if (showOnchain && hasOnchainData) for (const p of onchainPoints) values.push(p.priceUsd);
    if (showYahoo && hasYahooData) for (const p of yahooPoints) values.push(p.priceUsd);
    if (showBybit && hasBybitData) for (const p of bybitPoints) values.push(p.priceUsd);
    if (values.length === 0) return { min: 0, max: 1 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.1 || 0.01;
    return { min: Math.max(0, min - pad), max: max + pad };
  }, [
    onchainPoints,
    yahooPoints,
    bybitPoints,
    showOnchain,
    showYahoo,
    showBybit,
    hasOnchainData,
    hasYahooData,
    hasBybitData,
  ]);

  const onchainStroke =
    change === null || change.positive ? "var(--success)" : "var(--danger)";
  const yahooStroke = ONCHAIN_COLOR;

  const isLoading =
    (showOnchain && isOnchainLoading) ||
    (wantsYahoo && yahooQuery.isLoading) ||
    (wantsBybit && bybitQuery.isLoading);
  const hasData = hasOnchainData || hasYahooData || hasBybitData;

  const yahooMissing = source !== "onchain" && !yahooSymbol;
  const yahooFetchError = wantsYahoo && yahooQuery.error != null;

  return (
    <Card className="flex flex-col p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        {agentSymbol ? (
          <MarketOutlink
            oracleSymbol={agentSymbol}
            label={label}
            chartUsesBybit={showBybit}
            className="min-w-0 truncate text-xs font-semibold"
            iconClassName="h-3 w-3"
          />
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
        {(yahooMissing || yahooFetchError || showBybit) && (
          <span
            className="rounded bg-app-bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-app-muted"
            title={
              showBybit
                ? "Yahoo history sparse; showing Bybit perp klines"
                : yahooMissing
                  ? "No Yahoo Finance ticker mapped for this asset"
                  : "Yahoo Finance request failed"
            }
          >
            {showBybit ? "Bybit" : yahooMissing ? "No Yahoo" : "Yahoo error"}
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
              {showOnchain && hasOnchainData && (
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
              {showYahoo && hasYahooData && (
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
              {showBybit && hasBybitData && (
                <Area
                  type="monotone"
                  dataKey="bybitUsd"
                  name="Bybit"
                  stroke="var(--warning)"
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                  fill="transparent"
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
