"use client";

import { useMemo } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useVaultStateBatch } from "@/hooks/usePerpReader";
import { useBasketsOverviewQuery } from "@/hooks/subgraph/useBasketOverview";
import { formatCompact, formatUSDC, formatBps } from "@/lib/format";
import { USDC_PRECISION } from "@/lib/constants";
import { computeBlendedComposition } from "@/lib/blendedComposition";
import Link from "next/link";
import { ArrowUpRight, Layers, Radio, Activity, Gauge, BookOpenText } from "lucide-react";
import { type Address } from "viem";

const quickLinks = [
  { href: "/admin/baskets", label: "Manage Baskets", icon: Layers, desc: "Create and configure baskets" },
  { href: "/admin/funding", label: "Funding", icon: Gauge, desc: "Manage funding owner and keeper controls" },
  { href: "/admin/oracle", label: "Assets", icon: Radio, desc: "Oracle assets, prices, and sync" },
  { href: "/admin/pool", label: "Pool Health", icon: Activity, desc: "View pool utilization" },
  { href: "/docs", label: "Docs Wiki", icon: BookOpenText, desc: "Runbooks and integration reference" },
];

export default function AdminOverview() {
  const subgraph = useBasketsOverviewQuery({ first: 500, skip: 0 });

  const { data: baskets } = useAllBaskets();
  const vaultAddresses = useMemo(() => (baskets as unknown as Address[]) ?? [], [baskets]);
  const { data: vaultStates } = useVaultStateBatch(vaultAddresses);

  const subgraphData = useMemo(
    () => (Array.isArray(subgraph.data) ? subgraph.data : []),
    [subgraph.data]
  );

  const infos = useMemo(
    () =>
      subgraphData.map((item) => ({
        usdcBalance: item.usdcBalance,
        perpAllocated: item.perpAllocated,
      })),
    [subgraphData]
  );

  const totalOpenInterest = useMemo(() => {
    const states = (vaultStates as Array<{ result?: { openInterest: bigint }; status: string }> | undefined) ?? [];
    return states.reduce((sum, s) => sum + (s.status === "success" ? s.result?.openInterest ?? 0n : 0n), 0n);
  }, [vaultStates]);

  const totalTVL = useMemo(
    () =>
      infos.reduce(
        (sum, info) => sum + (info.usdcBalance ?? 0n) + (info.perpAllocated ?? 0n),
        0n
      ),
    [infos]
  );

  const totalPerp = useMemo(
    () => infos.reduce((sum, info) => sum + (info.perpAllocated ?? 0n), 0n),
    [infos]
  );

  const aggregatePerpBlendBps = useMemo(
    () =>
      computeBlendedComposition(
        totalTVL - totalPerp,
        totalPerp,
        totalOpenInterest,
        []
      ).perpBlendBps,
    [totalOpenInterest, totalPerp, totalTVL]
  );

  return (
    <PageWrapper>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight text-app-text">
        Admin Dashboard
      </h1>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total TVL" value={formatCompact(Number(totalTVL / USDC_PRECISION))} tooltipKey="totalTvl" />
        <StatCard label="Active Baskets" value={String(infos.length)} tooltipKey="activeBaskets" />
        <StatCard
          label="Perp Allocated"
          value={formatUSDC(totalPerp)}
          subValue={`Perp sleeve ${formatBps(aggregatePerpBlendBps)}`}
          tooltipKey="perpAllocated"
        />
      </div>

      <h2 className="mb-4 text-lg font-semibold text-app-text">
        <InfoLabel label="Quick Actions" tooltipKey="quickActions" />
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {quickLinks.map(({ href, label, icon: Icon, desc }) => (
          <Link key={href} href={href}>
            <Card className="flex items-center gap-4 p-6 transition-shadow hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-app-accent-dim">
                <Icon className="h-5 w-5 text-app-accent" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-app-text">
                  <InfoLabel label={label} tooltip={desc} />
                </p>
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
