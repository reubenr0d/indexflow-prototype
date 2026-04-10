"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useChainId, useConfig } from "wagmi";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Clock3 } from "lucide-react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { StatusDot, getOracleStatus } from "@/components/ui/status-dot";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  useOracleAssetConfig,
  useOracleAssetLabelMap,
  useOracleAssetPrice,
  useOracleIsStale,
  getOracleSourceBadgeLabel,
} from "@/hooks/useOracle";
import { useOraclePriceHistory } from "@/hooks/useOraclePriceHistory";
import { formatAssetId, formatPrice, formatPriceFull, formatRelativeTime } from "@/lib/format";
import { historyChartPoints, type PriceHistoryWindow, getTxHref } from "@/lib/oracle-price-history";

const WINDOW_OPTIONS: { value: PriceHistoryWindow; label: string }[] = [
  { value: "24H", label: "24H" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
];

export default function AssetPriceDetailPage() {
  const params = useParams<{ assetId: string }>();
  const rawAssetId = params.assetId;
  const assetId = normalizeAssetId(rawAssetId);
  const [window, setWindow] = useState<PriceHistoryWindow>("7D");
  const chainId = useChainId();

  const { data: assetLabels } = useOracleAssetLabelMap();
  const { data: priceData } = useOracleAssetPrice(assetId ?? ZERO_BYTES32);
  const { data: isStale } = useOracleIsStale(assetId ?? ZERO_BYTES32);
  const { data: config } = useOracleAssetConfig(assetId ?? ZERO_BYTES32);
  const { data: history, source, isLoading } = useOraclePriceHistory(assetId, window);
  const wagmiConfig = useConfig();
  const explorer = wagmiConfig.chains.find((chain) => chain.id === chainId)?.blockExplorers?.default?.url;
  const chartData = useMemo(() => historyChartPoints(history), [history]);

  if (!assetId) {
    return (
      <PageWrapper>
        <Card className="p-6">
          <p className="text-sm text-app-muted">Invalid asset id.</p>
          <Link href="/prices" className="mt-4 inline-flex text-sm font-medium text-app-accent hover:underline">
            Back to prices
          </Link>
        </Card>
      </PageWrapper>
    );
  }

  const label = assetLabels.get(assetId) ?? formatAssetId(assetId);
  const price = (priceData as [bigint, bigint] | undefined)?.[0] ?? 0n;
  const timestamp = Number((priceData as [bigint, bigint] | undefined)?.[1] ?? 0n);
  const status = getOracleStatus((isStale as boolean) ?? false, timestamp);
  const feedType = (config as { feedType: number | bigint } | undefined)?.feedType;
  const sourceLabel = getOracleSourceBadgeLabel(assetId, feedType);

  return (
    <PageWrapper className="max-w-7xl">
      <div className="mb-6">
        <Link href="/prices" className="mb-3 inline-flex items-center gap-1.5 text-sm text-app-muted hover:text-app-text">
          <ArrowLeft className="h-4 w-4" />
          Back to prices
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <StatusDot status={status} />
              <h1 className="text-3xl font-semibold tracking-tight text-app-text">{label}</h1>
              <span className="rounded-md bg-app-bg-subtle px-2 py-0.5 text-[10px] font-semibold tracking-wide text-app-muted">
                {sourceLabel}
              </span>
            </div>
            <p className="font-mono text-2xl font-semibold text-app-text">{formatPrice(price)}</p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-app-muted">
              <Clock3 className="h-3.5 w-3.5" />
              {timestamp > 0 ? `${formatRelativeTime(timestamp)} · ${new Date(timestamp * 1000).toLocaleString()}` : "No update yet"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SegmentedControl
              options={WINDOW_OPTIONS}
              value={window}
              onChange={setWindow}
              ariaLabel="Price history window"
            />
            <span className="rounded-md bg-app-bg-subtle px-2 py-1 text-[11px] font-medium text-app-muted">
              Source: {source}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-app-muted">Price Chart</h2>
          {isLoading ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-app-muted">Loading price history…</div>
          ) : chartData.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-app-muted">
              No price updates in selected window.
            </div>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => new Date(value * 1000).toLocaleDateString()}
                    tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                    minTickGap={20}
                  />
                  <YAxis
                    tickFormatter={(value) => `$${Number(value).toFixed(2)}`}
                    tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                    width={90}
                  />
                  <Tooltip
                    formatter={(value) => {
                      const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                      return [`$${numericValue.toLocaleString(undefined, { maximumFractionDigits: 4 })}`, "Price"];
                    }}
                    labelFormatter={(value) => new Date(Number(value ?? 0) * 1000).toLocaleString()}
                    contentStyle={{
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                    }}
                  />
                  <Line type="monotone" dataKey="priceUsd" stroke="var(--accent)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-app-muted">Price Updates</h2>
          <div className="max-h-[320px] overflow-auto">
            {isLoading ? (
              <p className="text-sm text-app-muted">Loading updates…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-app-muted">No price updates in selected window.</p>
            ) : (
              <div className="space-y-3">
                {history.map((row) => (
                  <div key={row.id} className="rounded-md border border-app-border bg-app-bg-subtle px-3 py-2">
                    <p className="font-mono text-sm font-semibold text-app-text">{formatPriceFull(row.price)}</p>
                    <p className="mt-0.5 text-xs text-app-muted">
                      {new Date(Number(row.priceTimestamp) * 1000).toLocaleString()}
                    </p>
                    <a
                      className="mt-1 inline-flex text-xs font-medium text-app-accent hover:underline"
                      href={getTxHref(explorer, row.txHash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {`${row.txHash.slice(0, 8)}...${row.txHash.slice(-6)}`}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageWrapper>
  );
}

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function normalizeAssetId(value: string | undefined): `0x${string}` | undefined {
  if (!value) return undefined;
  let decoded = "";
  try {
    decoded = decodeURIComponent(value).toLowerCase();
  } catch {
    return undefined;
  }
  if (!/^0x[0-9a-f]{64}$/.test(decoded)) return undefined;
  return decoded as `0x${string}`;
}
