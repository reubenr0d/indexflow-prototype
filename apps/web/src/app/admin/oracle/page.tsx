"use client";

import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot, getOracleStatus } from "@/components/ui/status-dot";
import { useReadContract, useChainId } from "wagmi";
import { OracleAdapterABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { useOracleAssetPrice, useOracleIsStale, useOracleAssetConfig } from "@/hooks/useOracle";
import { formatPrice, formatRelativeTime, formatAssetId, formatAddress } from "@/lib/format";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { motion } from "framer-motion";
import { Radio } from "lucide-react";

export default function AdminOraclePage() {
  const chainId = useChainId();
  const { oracleAdapter } = getContracts(chainId);

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
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            Oracle Status
          </h1>
          <p className="mt-1 text-sm text-neutral-400">{count} assets configured</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 dark:bg-emerald-950/40">
          <Radio className="h-3 w-3 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Monitoring</span>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="mb-2 h-5 w-20" />
              <Skeleton className="mb-4 h-8 w-28" />
              <Skeleton className="h-4 w-24" />
            </Card>
          ))}
        </div>
      ) : count > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: count }).map((_, i) => (
            <OracleAssetCard key={i} index={i} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg font-medium text-neutral-400">No oracle assets configured</p>
        </div>
      )}
    </PageWrapper>
  );
}

function OracleAssetCard({ index }: { index: number }) {
  const chainId = useChainId();
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

  if (!id) return null;

  const price = (priceData as [bigint, bigint] | undefined)?.[0] ?? 0n;
  const timestamp = Number((priceData as [bigint, bigint] | undefined)?.[1] ?? 0n);
  const status = getOracleStatus(isStale as boolean ?? false, timestamp);

  const assetConfig = config as {
    feedType: number;
    chainlinkFeed: string;
    stalenessThreshold: bigint;
    deviationThresholdBps: bigint;
    active: boolean;
  } | undefined;

  const feedTypeName = assetConfig?.feedType === 0 ? "Chainlink" : "Relayer";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card className={`p-6 ring-2 ${
        status === "stale" ? "ring-red-200 dark:ring-red-900" :
        status === "aging" ? "ring-amber-200 dark:ring-amber-900" :
        "ring-emerald-100 dark:ring-emerald-900/50"
      }`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusDot status={status} className="h-2.5 w-2.5" />
            <h3 className="font-semibold text-neutral-900 dark:text-white">
              {formatAssetId(id)}
            </h3>
          </div>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {feedTypeName}
          </span>
        </div>

        <p className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          {formatPrice(price)}
        </p>

        <div className="mt-3 space-y-1 text-xs text-neutral-400">
          <p>Updated: {timestamp > 0 ? formatRelativeTime(timestamp) : "never"}</p>
          {assetConfig && (
            <>
              <p>Staleness: {String(assetConfig.stalenessThreshold)}s</p>
              <p>Deviation: {Number(assetConfig.deviationThresholdBps) / 100}%</p>
            </>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
