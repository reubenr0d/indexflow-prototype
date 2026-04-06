"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { type ComponentType } from "react";
import {
  ArrowRight,
  BarChart3,
  Coins,
  Lock,
  Radar,
  Shield,
  Workflow,
} from "lucide-react";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch, useVaultStateBatch } from "@/hooks/usePerpReader";
import { useBasketsOverviewQuery } from "@/hooks/subgraph/useSubgraphQueries";
import { formatCompact } from "@/lib/format";
import { USDC_PRECISION } from "@/lib/constants";
import { type Address } from "viem";

export default function HomePage() {
  const subgraph = useBasketsOverviewQuery({ first: 200, skip: 0 });
  const { data: baskets, isLoading: basketsLoading } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos, isLoading: infosLoading } = useBasketInfoBatch(vaultAddresses);
  const { data: vaultStates, isLoading: vaultStatesLoading } = useVaultStateBatch(vaultAddresses);

  const hasSubgraphData = Array.isArray(subgraph.data) && !subgraph.isError;
  const subgraphData = hasSubgraphData ? subgraph.data ?? [] : [];
  const rpcInfos = ((basketInfos as unknown as Array<{
    vault: Address;
    usdcBalance: bigint;
    perpAllocated: bigint;
  }>) ?? []);
  const hasRpcData = rpcInfos.length > 0;
  const isLoading = hasRpcData
    ? basketsLoading || infosLoading || vaultStatesLoading
    : hasSubgraphData
      ? subgraph.isLoading
      : basketsLoading || infosLoading || vaultStatesLoading;

  const infos = hasRpcData
    ? rpcInfos
    : hasSubgraphData
      ? subgraphData.map((item) => ({
        vault: item.vault,
        usdcBalance: item.usdcBalance,
        perpAllocated: item.perpAllocated,
      }))
      : [];

  const totalTVL = infos.reduce(
    (sum, info) => sum + (info.usdcBalance ?? 0n) + (info.perpAllocated ?? 0n),
    0n
  );
  const totalOpenInterest = (
    (vaultStates as Array<{ result?: { openInterest: bigint }; status: string }> | undefined) ?? []
  ).reduce((sum, state) => {
    if (state.status !== "success") return sum;
    return sum + (state.result?.openInterest ?? 0n);
  }, 0n);
  const totalPerpAllocated = infos.reduce((sum, info) => sum + (info.perpAllocated ?? 0n), 0n);
  const perpUtilization = totalTVL > 0n ? Number((totalPerpAllocated * 10_000n) / totalTVL) / 100 : 0;

  const metrics: Array<{ label: string; value: string; hint: string }> = [
    {
      label: "Aggregate TVL",
      value: isLoading ? "Loading..." : formatCompact(Number(totalTVL / USDC_PRECISION)),
      hint: "Idle USDC + perp allocation",
    },
    {
      label: "Open Interest",
      value: isLoading ? "Loading..." : formatCompact(Number(totalOpenInterest / USDC_PRECISION)),
      hint: "Across registered vaults",
    },
    {
      label: "Active Baskets",
      value: isLoading ? "Loading..." : `${infos.length}`,
      hint: "Factory indexed vaults",
    },
    {
      label: "Perp Utilization",
      value: isLoading ? "Loading..." : `${perpUtilization.toFixed(2)}%`,
      hint: "Capital routed into perp layer",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <section className="landing-hero relative overflow-hidden border-b border-app-border">
        <div className="landing-hero-grid absolute inset-0 opacity-45" aria-hidden />
        <div className="landing-hero-glow absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pb-16 sm:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, ease: "easeOut" }}
            className="max-w-4xl"
          >
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-app-accent">
              ORACLE-PRICED BASKETS · SHARED PERP INFRA
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-[0.98] tracking-tight text-app-text sm:text-5xl lg:text-[4rem]">
              Deposit into themed baskets backed by a shared trading engine
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-app-muted sm:text-lg">
              Users deposit USDC into baskets. Operators can route part of that capital into a shared
              perpetual trading system, while the app keeps track of where funds are sitting and how
              each basket is performing.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/baskets"
                className="inline-flex items-center gap-2 rounded-md bg-app-accent px-5 py-3 text-sm font-semibold text-app-accent-fg transition-opacity hover:opacity-90"
              >
                Open app
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-md border border-app-border bg-app-surface/80 px-5 py-3 text-sm font-semibold text-app-text hover:border-app-border-strong hover:bg-app-surface"
              >
                Live dashboard
              </Link>
              <Link href="#how-it-works" className="text-sm font-medium text-app-muted hover:text-app-text">
                How it works →
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, delay: 0.1, ease: "easeOut" }}
            className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-app-border bg-app-surface/85 p-4 backdrop-blur-sm"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-app-muted">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-app-text">{metric.value}</p>
                <p className="mt-1 text-xs text-app-muted">{metric.hint}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="border-b border-app-border bg-app-surface py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-app-text sm:text-3xl">Built for outcomes, not dashboard theater</h2>
          <p className="mt-2 max-w-2xl text-app-muted">
            The interface is meant to answer the basic questions quickly: where the money is, who controls it, and what happens next.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Feature
              icon={Coins}
              title="Liquidity you can audit"
              body="You can see how much USDC is sitting in the basket and how much has been moved into the trading side."
            />
            <Feature
              icon={BarChart3}
              title="Shared perp execution"
              body="Multiple baskets can use the same trading engine while the protocol still tracks profit and loss basket by basket."
            />
            <Feature
              icon={Shield}
              title="Risk controls with hard edges"
              body="Price checks, owner-only actions, and reserve rules make it clearer what can happen during stressed conditions."
            />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold text-app-text sm:text-3xl">How capital moves</h2>
            <p className="mt-2 text-app-muted">
              Money moves through three layers: the basket vault, the accounting layer, and the trading engine.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                k: "01",
                title: "Deposit",
                text: "A user deposits USDC into a basket and receives basket shares.",
              },
              {
                k: "02",
                title: "Allocate",
                text: "The basket owner can move part of that USDC into the perp system for trading.",
              },
              {
                k: "03",
                title: "Trade",
                text: "Operators open and close positions, and the protocol tracks gains and losses for each basket.",
              },
              {
                k: "04",
                title: "Exit",
                text: "Users redeem shares back to USDC, limited by how much liquid cash is available in the basket.",
              },
            ].map((row) => (
              <div
                key={row.k}
                className="rounded-lg border border-app-border bg-app-surface p-4"
              >
                <span className="font-mono text-xs font-bold text-app-accent">{row.k}</span>
                <h3 className="mt-2 font-semibold text-app-text">{row.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-app-muted">{row.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-app-border bg-app-bg-subtle py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-app-text sm:text-3xl">What to pay attention to</h2>
            <p className="mt-2 max-w-2xl text-sm text-app-muted">
              If you are new, these are the three things that matter most: where funds live, where prices come from, and who can act.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <TrustRow
              icon={Lock}
              title="Onchain custody path"
              body="Funds move through visible onchain contracts, and the app surfaces the main balances and state changes."
            />
            <TrustRow
              icon={Radar}
              title="Price checks"
              body="The system checks whether prices are fresh and within allowed bounds before they are trusted."
            />
            <TrustRow
              icon={Workflow}
              title="Role boundaries"
              body="Investors deposit and redeem. Operators manage allocation and trading. Gov and keepers handle deeper protocol controls."
            />
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-xl font-bold text-app-text">Ready to route capital?</h2>
            <p className="mt-1 text-sm text-app-muted">
              Start by checking basket balances and liquidity, then connect a wallet if you want to interact.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/baskets"
              className="inline-flex items-center rounded-md bg-app-accent px-5 py-2.5 text-sm font-semibold text-app-accent-fg hover:opacity-90"
            >
              Go to baskets
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-md border border-app-border bg-app-surface px-5 py-2.5 text-sm font-semibold text-app-text hover:bg-app-surface-hover"
            >
              View dashboard
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-app-border py-8 text-center text-xs text-app-muted">
        IndexFlow — prototype interface. Not financial advice. Smart contracts carry risk.
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-app-border bg-app-bg p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-app-accent-dim text-app-accent">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="mt-4 font-semibold text-app-text">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-app-muted">{body}</p>
    </div>
  );
}

function TrustRow({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-app-border bg-app-surface p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-app-accent-dim text-app-accent">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="mt-3 font-semibold text-app-text">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-app-muted">{body}</p>
    </div>
  );
}
