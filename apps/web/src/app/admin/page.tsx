"use client";

import { PageWrapper } from "@/components/layout/page-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch } from "@/hooks/usePerpReader";
import { formatCompact, formatUSDC } from "@/lib/format";
import { USDC_PRECISION } from "@/lib/constants";
import Link from "next/link";
import { ArrowUpRight, Layers, Crosshair, Radio, Activity } from "lucide-react";
import { type Address } from "viem";

const quickLinks = [
  { href: "/admin/baskets", label: "Manage Baskets", icon: Layers, desc: "Create and configure baskets" },
  { href: "/admin/positions", label: "Positions", icon: Crosshair, desc: "Open and close perp positions" },
  { href: "/admin/oracle", label: "Oracle Status", icon: Radio, desc: "Monitor oracle health" },
  { href: "/admin/pool", label: "Pool Health", icon: Activity, desc: "View pool utilization" },
];

export default function AdminOverview() {
  const { data: baskets } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos } = useBasketInfoBatch(vaultAddresses);

  const totalTVL = basketInfos
    ? (basketInfos as unknown as Array<{ usdcBalance: bigint; perpAllocated: bigint }>).reduce(
        (sum, info) => sum + (info.usdcBalance ?? 0n) + (info.perpAllocated ?? 0n),
        0n
      )
    : 0n;

  const totalPerp = basketInfos
    ? (basketInfos as unknown as Array<{ perpAllocated: bigint }>).reduce(
        (sum, info) => sum + (info.perpAllocated ?? 0n),
        0n
      )
    : 0n;

  return (
    <PageWrapper>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
        Admin Dashboard
      </h1>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total TVL" value={formatCompact(Number(totalTVL / USDC_PRECISION))} />
        <StatCard label="Active Baskets" value={String(vaultAddresses.length)} />
        <StatCard label="Perp Allocated" value={formatUSDC(totalPerp)} />
      </div>

      <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">Quick Actions</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {quickLinks.map(({ href, label, icon: Icon, desc }) => (
          <Link key={href} href={href}>
            <Card className="flex items-center gap-4 p-6 transition-shadow hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
                <Icon className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-neutral-900 dark:text-white">{label}</p>
                <p className="text-sm text-neutral-400">{desc}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-neutral-400" />
            </Card>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}
