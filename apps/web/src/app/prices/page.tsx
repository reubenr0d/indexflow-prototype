"use client";

import { useState } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot, getOracleStatus } from "@/components/ui/status-dot";
import { useReadContract } from "wagmi";
import { useChainId } from "wagmi";
import { OracleAdapterABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { useOracleAssetPrice, useOracleIsStale } from "@/hooks/useOracle";
import { formatPrice, formatRelativeTime, formatAssetId } from "@/lib/format";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { motion } from "framer-motion";
import { Search, Radio } from "lucide-react";

export default function PricesPage() {
  const [search, setSearch] = useState("");
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
          <h1 className="text-3xl font-semibold tracking-tight text-app-text">
            Live Prices
          </h1>
          <p className="mt-1 text-sm text-app-muted">
            Oracle prices refreshed every 15 seconds
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-app-border bg-app-accent-dim px-3 py-1.5">
          <Radio className="h-3 w-3 text-app-accent" />
          <span className="text-xs font-semibold uppercase tracking-wide text-app-accent">Live</span>
        </div>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

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
              <AssetPriceRow key={i} index={i} search={search} />
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

function AssetPriceRow({ index, search }: { index: number; search: string }) {
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
  const { data: priceData } = useOracleAssetPrice(id ?? "0x0000000000000000000000000000000000000000000000000000000000000000");
  const { data: isStale } = useOracleIsStale(id ?? "0x0000000000000000000000000000000000000000000000000000000000000000");

  if (!id) return null;

  const name = formatAssetId(id);
  if (search && !name.toLowerCase().includes(search.toLowerCase())) return null;

  const price = (priceData as [bigint, bigint] | undefined)?.[0] ?? 0n;
  const timestamp = Number((priceData as [bigint, bigint] | undefined)?.[1] ?? 0n);
  const status = getOracleStatus(isStale as boolean ?? false, timestamp);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-between px-6 py-4"
    >
      <div className="flex items-center gap-3">
        <StatusDot status={status} />
        <span className="font-medium text-app-text">{name}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-app-muted">
          {timestamp > 0 ? formatRelativeTime(timestamp) : "--"}
        </span>
        <span className="w-28 text-right font-mono text-sm font-medium text-app-text">
          {formatPrice(price)}
        </span>
      </div>
    </motion.div>
  );
}
