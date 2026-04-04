"use client";

import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { UtilizationRing } from "@/components/ui/utilization-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { usePoolUtilization } from "@/hooks/usePerpReader";
import { useChainId } from "wagmi";
import { getContracts } from "@/config/contracts";
import { formatUSDC } from "@/lib/format";
import { motion } from "framer-motion";

export default function AdminPoolPage() {
  const chainId = useChainId();
  const { usdc } = getContracts(chainId);
  const { data, isLoading } = usePoolUtilization(usdc);

  const pool = data as {
    token: string;
    poolAmount: bigint;
    reservedAmount: bigint;
    globalShortSize: bigint;
    guaranteedUsd: bigint;
    utilizationBps: bigint;
  } | undefined;

  const utilizationPct = pool ? Number(pool.utilizationBps) / 100 : 0;

  return (
    <PageWrapper>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight text-app-text">
        Pool Health
      </h1>

      <div className="mb-10 flex justify-center">
        {isLoading ? (
          <Skeleton className="h-32 w-32 rounded-full" />
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="relative"
          >
            <UtilizationRing
              percentage={utilizationPct}
              size={160}
              strokeWidth={14}
              label="Utilization"
            />
          </motion.div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pool Amount"
          value={pool ? formatUSDC(pool.poolAmount) : "--"}
          isLoading={isLoading}
        />
        <StatCard
          label="Reserved Amount"
          value={pool ? formatUSDC(pool.reservedAmount) : "--"}
          isLoading={isLoading}
        />
        <StatCard
          label="Global Short Size"
          value={pool ? formatUSDC(pool.globalShortSize) : "--"}
          isLoading={isLoading}
        />
        <StatCard
          label="Guaranteed USD"
          value={pool ? formatUSDC(pool.guaranteedUsd) : "--"}
          isLoading={isLoading}
        />
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-app-text">
          Pool Details
        </h2>
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-app-muted">Utilization Rate</span>
              <span className="font-medium text-app-text">
                {utilizationPct.toFixed(2)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-app-bg-subtle">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  utilizationPct < 50 ? "bg-app-success" :
                  utilizationPct < 80 ? "bg-app-warning" :
                  "bg-app-danger"
                }`}
                style={{ width: `${Math.min(utilizationPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-app-muted">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </Card>
      </div>
    </PageWrapper>
  );
}
