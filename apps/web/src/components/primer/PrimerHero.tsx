"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowRightLeft,
  Layers3,
  LineChart,
  Send,
} from "lucide-react";
import { useReadContract } from "wagmi";
import { OracleAdapterABI } from "@/abi/OracleAdapter";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { useHeroProtocolStats } from "@/hooks/useHeroProtocolStats";
import { formatApy } from "@/lib/apy";
import { formatCompact, formatSignedCompact } from "@/lib/format";
import { REFETCH_INTERVAL, USDC_PRECISION } from "@/lib/constants";

const TELEGRAM_URL = "https://t.me/+gNSBM_gBQ1NkNTY1";

const HERO_BENEFITS = [
  { icon: Layers3, label: "Diversified exposure" },
  { icon: LineChart, label: "Transparent NAV pricing" },
  { icon: ArrowRightLeft, label: "Clear redemption path" },
];

export function PrimerHero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-[calc(100vh-3.5rem)] flex-col overflow-hidden border-b border-app-border"
    >
      <div className="primer-hero-bg absolute inset-0" aria-hidden />
      <div className="primer-hero-grid absolute inset-0 opacity-40" aria-hidden />

      <div className="relative flex flex-1 items-center">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-left"
          >
            <h1 className="primer-gradient-text mt-5 text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl">
              Tokenized baskets.
              <br />
              Real liquidity. Verifiable pricing.
            </h1>

            <div className="mt-6 max-w-3xl">
              <p className="text-base leading-relaxed text-app-muted sm:text-lg">
                Deposit USDC into curated onchain baskets and hold a single
                token.
              </p>
              <div className="mt-2 flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-5">
                {HERO_BENEFITS.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-app-accent/80">
                      <Icon className="h-3 w-3" />
                    </span>
                    <span className="text-[11px] font-medium tracking-[0.03em] text-app-muted sm:text-xs">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/baskets"
                className="inline-flex items-center gap-2 rounded-lg bg-app-accent px-6 py-3 text-sm font-semibold text-app-accent-fg transition-opacity hover:opacity-90"
              >
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-app-border px-6 py-3 text-sm font-semibold text-app-text transition-colors hover:border-app-accent hover:text-app-accent"
              >
                <Send className="h-4 w-4" />
                Join Telegram
              </a>
            </div>

            <HeroStats />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Live stats strip                                                   */
/* ------------------------------------------------------------------ */

function HeroStats() {
  const { totalTvl, totalPnL, totalApy, basketCount, tokenHolderCount } =
    useHeroProtocolStats();
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter } = getContracts(chainId);
  const { data: assetCount } = useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getAssetCount",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
  const assets = assetCount != null ? Number(assetCount) : null;

  return (
    <div className="mt-10 border-t border-app-border pt-6">
      <div className="inline-flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-app-accent">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        Live testnet stats
      </div>
      <div className="mt-4 flex flex-wrap gap-10">
        <StatCell
          label="Total TVL"
          value={
            totalTvl != null
              ? formatCompact(Number(totalTvl / USDC_PRECISION))
              : "--"
          }
        />
        <StatCell
          label="Total PnL"
          value={
            totalPnL != null
              ? formatSignedCompact(Number(totalPnL / USDC_PRECISION))
              : "--"
          }
        />
        <StatCell label="Total APY" value={formatApy(totalApy)} />
        <StatCell
          label="Baskets"
          value={basketCount != null ? String(basketCount) : "--"}
        />
        <StatCell
          label="Assets tracked"
          value={assets != null ? String(assets) : "--"}
        />
        <StatCell
          label="Tokenholders"
          value={tokenHolderCount != null ? String(tokenHolderCount) : "--"}
        />
      </div>
      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-app-muted">
        These metrics reflect the current testnet deployment and are shown for
        product preview purposes, not live mainnet capital.
      </p>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">
        {label}
      </span>
      <span className="mt-0.5 font-mono text-base font-semibold text-app-text">
        {value}
      </span>
    </div>
  );
}
