"use client";

import { PageWrapper } from "@/components/layout/page-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch, useVaultStateBatch } from "@/hooks/usePerpReader";
import { useBasketsOverviewQuery } from "@/hooks/subgraph/useSubgraphQueries";
import { formatCompact, formatUSDC, formatBps } from "@/lib/format";
import { USDC_PRECISION } from "@/lib/constants";
import { computeBlendedComposition } from "@/lib/blendedComposition";
import Link from "next/link";
import { ArrowUpRight, Layers, Radio, Activity, Gauge } from "lucide-react";
import { type Address } from "viem";

const quickLinks = [
  { href: "/admin/baskets", label: "Manage Baskets", icon: Layers, desc: "Create and configure baskets" },
  { href: "/admin/funding", label: "Funding", icon: Gauge, desc: "Manage funding owner and keeper controls" },
  { href: "/admin/oracle", label: "Oracle Status", icon: Radio, desc: "Monitor oracle health" },
  { href: "/admin/pool", label: "Pool Health", icon: Activity, desc: "View pool utilization" },
];

export default function AdminOverview() {
  const subgraph = useBasketsOverviewQuery({ first: 500, skip: 0 });

  const { data: baskets } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos } = useBasketInfoBatch(vaultAddresses);
  const { data: vaultStates } = useVaultStateBatch(vaultAddresses);

  const hasSubgraphData = Array.isArray(subgraph.data) && !subgraph.isError;
  const subgraphData = hasSubgraphData ? subgraph.data ?? [] : [];
  const rpcInfos = ((basketInfos as unknown as Array<{ usdcBalance: bigint; perpAllocated: bigint }>) ?? []);
  const hasRpcData = rpcInfos.length > 0;
  const infos = hasRpcData
    ? rpcInfos
    : hasSubgraphData
      ? subgraphData.map((item) => ({
        usdcBalance: item.usdcBalance,
        perpAllocated: item.perpAllocated,
      }))
      : [];

  const totalOpenInterest = ((vaultStates as Array<{ result?: { openInterest: bigint }; status: string }> | undefined) ?? [])
    .reduce((sum, s) => sum + (s.status === "success" ? s.result?.openInterest ?? 0n : 0n), 0n);

  const totalTVL = infos.reduce(
    (sum, info) => sum + (info.usdcBalance ?? 0n) + (info.perpAllocated ?? 0n),
    0n
  );

  const totalPerp = infos.reduce((sum, info) => sum + (info.perpAllocated ?? 0n), 0n);
  const aggregatePerpBlendBps = computeBlendedComposition(
    totalTVL - totalPerp,
    totalPerp,
    totalOpenInterest,
    []
  ).perpBlendBps;

  return (
    <PageWrapper>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight text-app-text">
        Admin Dashboard
      </h1>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total TVL" value={formatCompact(Number(totalTVL / USDC_PRECISION))} />
        <StatCard label="Active Baskets" value={String(infos.length)} />
        <StatCard label="Perp Allocated" value={formatUSDC(totalPerp)} subValue={`Perp sleeve ${formatBps(aggregatePerpBlendBps)}`} />
      </div>

      <h2 className="mb-4 text-lg font-semibold text-app-text">Quick Actions</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {quickLinks.map(({ href, label, icon: Icon, desc }) => (
          <Link key={href} href={href}>
            <Card className="flex items-center gap-4 p-6 transition-shadow hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-app-accent-dim">
                <Icon className="h-5 w-5 text-app-accent" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-app-text">{label}</p>
                <p className="text-sm text-app-muted">{desc}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-app-muted" />
            </Card>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}
