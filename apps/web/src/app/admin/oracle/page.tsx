"use client";

import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { StatusDot, getOracleStatus } from "@/components/ui/status-dot";
import { useReadContract, useChainId } from "wagmi";
import { OracleAdapterABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import {
  useOracleAssetPrice,
  useOracleIsStale,
  useOracleAssetConfig,
  useOracleAssetLabelMap,
  getOracleSourceLabel,
} from "@/hooks/useOracle";
import { formatPrice, formatRelativeTime, formatAssetId } from "@/lib/format";
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
  const { data: assetLabels } = useOracleAssetLabelMap();

  return (
    <PageWrapper>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-app-text">
            Oracle Status
          </h1>
          <p className="mt-1 text-sm text-app-muted">{count} assets configured</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-app-border bg-app-accent-dim px-3 py-1.5">
          <Radio className="h-3 w-3 text-app-accent" />
          <span className="text-xs font-semibold uppercase tracking-wide text-app-accent">Monitoring</span>
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
            <OracleAssetCard key={i} index={i} assetLabels={assetLabels} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg font-medium text-app-muted">No oracle assets configured</p>
        </div>
      )}
    </PageWrapper>
  );
}

function OracleAssetCard({
  index,
  assetLabels,
}: {
  index: number;
  assetLabels: Map<`0x${string}`, string>;
}) {
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
    feedAddress: `0x${string}`;
    feedType: number;
    stalenessThreshold: bigint;
    deviationBps: bigint;
    decimals: number;
    active: boolean;
  } | undefined;

  const feedTypeName = getOracleSourceLabel(assetConfig?.feedType);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card className={`p-6 ring-2 ${
        status === "stale" ? "ring-app-danger/50" :
        status === "aging" ? "ring-app-warning/50" :
        "ring-app-success/40"
      }`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusDot status={status} className="h-2.5 w-2.5" />
            <h3 className="font-semibold text-app-text">
              <InfoLabel
                label={assetLabels.get(id) ?? formatAssetId(id)}
                tooltip="Oracle asset currently monitored for freshness and price health."
              />
            </h3>
          </div>
          <span className="rounded-md bg-app-bg-subtle px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-app-muted">
            {feedTypeName}
          </span>
        </div>

        <p className="text-2xl font-semibold tracking-tight text-app-text">
          {formatPrice(price)}
        </p>

        <div className="mt-3 space-y-1 text-xs text-app-muted">
          <p>Updated: {timestamp > 0 ? formatRelativeTime(timestamp) : "never"}</p>
          {assetConfig && (
            <>
              <p>Staleness: {String(assetConfig.stalenessThreshold)}s</p>
              <p>Deviation: {Number(assetConfig.deviationBps) / 100}%</p>
            </>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
