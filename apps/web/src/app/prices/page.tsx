"use client";

import { useState } from "react";
import Link from "next/link";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot, getOracleStatus } from "@/components/ui/status-dot";
import { useReadContract } from "wagmi";
import { OracleAdapterABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import {
  useOracleAssetPrice,
  useOracleIsStale,
  useOracleAssetLabelMap,
  useOracleAssetConfig,
  getOracleSourceLabel,
} from "@/hooks/useOracle";
import { usePoolLiquidityUsd1e30, usePricingExecutionQuoteBothSides } from "@/hooks/usePricingQuote";
import { formatPrice, formatRelativeTime, formatAssetId, formatBps, parseUSDCInput } from "@/lib/format";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { toAssetPricePath } from "@/lib/prices-routes";
import { motion } from "framer-motion";
import { Search, Radio, ChevronRight } from "lucide-react";

export default function PricesPage() {
  const [search, setSearch] = useState("");
  const [notional, setNotional] = useState("");
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter } = getContracts(chainId);
  const { liquidityUsd1e30, poolLoading } = usePoolLiquidityUsd1e30();
  const { data: assetLabels } = useOracleAssetLabelMap();
  const notionalAtoms = notional ? parseUSDCInput(notional) : 0n;

  const { data: assetCount, isLoading } = useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getAssetCount",
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  const count = assetCount ? Number(assetCount) : 0;

  return (
    <PageWrapper>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-app-text">
            Live Prices
          </h1>
          <p className="mt-1 text-sm text-app-muted">
            Oracle mid prices; optional notional shows PricingEngine execution (pool-liquidity-aware).
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-app-border bg-app-accent-dim px-3 py-1.5">
          <Radio className="h-3 w-3 text-app-accent" />
          <span className="text-xs font-semibold uppercase tracking-wide text-app-accent">Live</span>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="w-full sm:w-56">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-app-muted">
            Notional (USDC)
          </label>
          <Input
            placeholder="e.g. 100000"
            value={notional}
            onChange={(e) => setNotional(e.target.value)}
            className="font-mono"
          />
        </div>
      </div>
      {poolLoading && notionalAtoms > 0n && (
        <p className="mb-4 text-xs text-app-muted">Loading pool liquidity for impact…</p>
      )}

      {isLoading ? (
        <Card>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-app-border px-6 py-4 last:border-0">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </Card>
      ) : count > 0 ? (
        <Card>
          <div className="divide-y divide-app-border">
            {Array.from({ length: count }).map((_, i) => (
              <AssetPriceRow
                key={i}
                index={i}
                search={search}
                assetLabels={assetLabels}
                notionalUsdcAtoms={notionalAtoms}
                liquidityUsd1e30={liquidityUsd1e30}
              />
            ))}
          </div>
        </Card>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg font-medium text-app-muted">No oracle assets configured</p>
        </div>
      )}
    </PageWrapper>
  );
}

function AssetPriceRow({
  index,
  search,
  assetLabels,
  notionalUsdcAtoms,
  liquidityUsd1e30,
}: {
  index: number;
  search: string;
  assetLabels: Map<`0x${string}`, string>;
  notionalUsdcAtoms: bigint;
  liquidityUsd1e30: bigint;
}) {
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter } = getContracts(chainId);

  const { data: assetId } = useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "assetList",
    args: [BigInt(index)],
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  const id = assetId as `0x${string}` | undefined;
  const zeroBytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
  const queryId = id ?? zeroBytes32;
  const { data: priceData } = useOracleAssetPrice(queryId);
  const { data: isStale } = useOracleIsStale(queryId);
  const { data: config } = useOracleAssetConfig(queryId);

  const pe = usePricingExecutionQuoteBothSides({
    assetId: id,
    sizeUsdcAtoms: notionalUsdcAtoms,
    liquidityUsd1e30,
    enabled: notionalUsdcAtoms > 0n,
  });

  if (!id) return null;

  const name = assetLabels.get(id) ?? formatAssetId(id);
  if (search && !name.toLowerCase().includes(search.toLowerCase())) return null;

  const price = (priceData as [bigint, bigint] | undefined)?.[0] ?? 0n;
  const timestamp = Number((priceData as [bigint, bigint] | undefined)?.[1] ?? 0n);
  const status = getOracleStatus(isStale as boolean ?? false, timestamp);
  const feedType = (config as { feedType: number | bigint } | undefined)?.feedType;
  const sourceLabel = getOracleSourceLabel(feedType);

  return (
    <Link
      href={toAssetPricePath(id)}
      className="block focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-app-bg-subtle/60"
      >
        <div className="flex items-center gap-3">
          <StatusDot status={status} />
          <div className="flex items-center gap-2">
            <span className="font-medium text-app-text">{name}</span>
            <span className="rounded-md bg-app-bg-subtle px-2 py-0.5 text-[10px] font-semibold tracking-wide text-app-muted">
              {sourceLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-xs text-app-muted">
              {timestamp > 0 ? formatRelativeTime(timestamp) : "--"}
            </span>
            <div className="text-right">
              <span className="block font-mono text-sm font-medium text-app-text">{formatPrice(price)}</span>
              {notionalUsdcAtoms > 0n && (
                <span className="mt-0.5 block max-w-[14rem] text-right text-[10px] leading-tight text-app-muted sm:max-w-xs">
                  {pe.isStale ? (
                    "Stale — no model quote"
                  ) : pe.isLoading ? (
                    "Model quote…"
                  ) : pe.error || !pe.canQuery ? (
                    "Model quote n/a"
                  ) : pe.execLong !== undefined && pe.execShort !== undefined ? (
                    <>
                      L {formatPrice(pe.execLong)} / S {formatPrice(pe.execShort)}
                      {pe.impactBps !== undefined && ` · ${formatBps(pe.impactBps)} impact`}
                    </>
                  ) : null}
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-app-muted" aria-hidden />
        </div>
      </motion.div>
    </Link>
  );
}
