"use client";

import { PageWrapper } from "@/components/layout/page-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch } from "@/hooks/usePerpReader";
import { formatUSDC, formatCompact } from "@/lib/format";
import { USDC_PRECISION } from "@/lib/constants";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { type Address } from "viem";

export default function Dashboard() {
  const { data: baskets, isLoading: basketsLoading } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos, isLoading: infosLoading } = useBasketInfoBatch(vaultAddresses);

  const isLoading = basketsLoading || infosLoading;

  const totalTVL = basketInfos
    ? (basketInfos as unknown as Array<{ usdcBalance: bigint; perpAllocated: bigint }>).reduce(
        (sum, info) => sum + (info.usdcBalance ?? 0n) + (info.perpAllocated ?? 0n),
        0n
      )
    : 0n;

  const sortedBaskets = basketInfos
    ? [...(basketInfos as unknown as Array<{ vault: Address; name: string; basketPrice: bigint; sharePrice: bigint; totalSupply: bigint; usdcBalance: bigint; perpAllocated: bigint }>)]
        .sort((a, b) => {
          const tvlA = (a.usdcBalance ?? 0n) + (a.perpAllocated ?? 0n);
          const tvlB = (b.usdcBalance ?? 0n) + (b.perpAllocated ?? 0n);
          return tvlB > tvlA ? 1 : -1;
        })
        .slice(0, 6)
    : [];

  return (
    <PageWrapper>
      <div className="mb-16 text-center">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-14 w-64" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <p className="text-sm font-medium text-neutral-400">Total Value Locked</p>
            <p className="mt-1 text-5xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              {formatCompact(Number(totalTVL / USDC_PRECISION))}
            </p>
          </motion.div>
        )}
      </div>

      <div className="mb-12 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active Baskets"
          value={String(vaultAddresses.length)}
          isLoading={isLoading}
        />
        <StatCard
          label="Total Baskets"
          value={String(vaultAddresses.length)}
          subValue="Across all vaults"
          isLoading={isLoading}
        />
        <StatCard
          label="Protocol TVL"
          value={formatCompact(Number(totalTVL / USDC_PRECISION))}
          isLoading={isLoading}
        />
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Top Baskets</h2>
        <Link
          href="/baskets"
          className="flex items-center gap-1 text-sm font-medium text-blue-500 hover:text-blue-600"
        >
          View all <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="mb-3 h-5 w-32" />
              <Skeleton className="mb-2 h-8 w-24" />
              <Skeleton className="h-4 w-20" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedBaskets.map((info, i) => (
            <motion.div
              key={info.vault}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Link href={`/baskets/${info.vault}`}>
                <Card className="p-6 transition-shadow hover:shadow-md">
                  <p className="text-sm font-medium text-neutral-500">{info.name || "Basket"}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                    {formatUSDC((info.usdcBalance ?? 0n) + (info.perpAllocated ?? 0n))}
                  </p>
                  <p className="mt-1 text-sm text-neutral-400">TVL</p>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {!isLoading && vaultAddresses.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-lg font-medium text-neutral-400">No baskets yet</p>
          <p className="mt-2 text-sm text-neutral-400">
            Create your first basket to get started.
          </p>
          <Link
            href="/admin/baskets"
            className="mt-6 inline-flex items-center rounded-full bg-blue-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-600"
          >
            Create Basket
          </Link>
        </div>
      )}
    </PageWrapper>
  );
}
