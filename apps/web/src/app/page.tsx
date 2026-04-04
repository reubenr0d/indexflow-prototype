import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import {
  ArrowRight,
  Layers,
  LineChart,
  Shield,
  Wallet,
  Zap,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <section className="relative overflow-hidden border-b border-app-border">
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-app-accent">
              USDC · Oracle-priced · Perp pool
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-app-text sm:text-5xl lg:text-[3.25rem]">
              Basket vaults backed by a shared perpetual liquidity pool
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-app-muted">
              Deposit USDC into weighted baskets whose share price tracks a blend of oracle feeds. Capital
              can route into perp infrastructure derived from GMX v1—so basket liquidity and pool positions
              stay linked, without retail order books or NAV-style models.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/baskets"
                className="inline-flex items-center gap-2 rounded-md bg-app-accent px-5 py-3 text-sm font-semibold text-app-accent-fg transition-opacity hover:opacity-90"
              >
                Open app
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-md border border-app-border bg-app-surface px-5 py-3 text-sm font-semibold text-app-text hover:border-app-border-strong hover:bg-app-surface-hover"
              >
                Protocol dashboard
              </Link>
              <Link href="/admin" className="text-sm font-medium text-app-muted hover:text-app-text">
                Operator admin →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-app-border bg-app-surface py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-app-text">What you get</h2>
          <p className="mt-2 max-w-2xl text-app-muted">
            One interface for depositors, operators, and monitoring—aligned with how the contracts behave
            on-chain.
          </p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={Layers}
              title="Weighted baskets"
              body="Each basket is a vault with asset IDs and weights in basis points. Share price comes from oracle prices—no DCF or fundraising mechanics."
            />
            <Feature
              icon={LineChart}
              title="Perp pool linkage"
              body="Vault accounting tracks how much USDC each basket sends to the shared pool, attribution of PnL, and position lifecycle against the forked GMX-style engine."
            />
            <Feature
              icon={Shield}
              title="Oracle-first risk surface"
              body="Chainlink and custom relayer feeds with staleness and deviation controls. The UI surfaces freshness so you know when prices are tradeable."
            />
            <Feature
              icon={Wallet}
              title="Deposit & redeem"
              body="GLP-style continuous mint and burn: USDC in, shares out, priced at the basket index minus configurable fees."
            />
            <Feature
              icon={Zap}
              title="Operator workflows"
              body="Admin routes for basket creation, perp allocation, fee collection, position open/close, and oracle visibility—without a public order book."
            />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold text-app-text">How capital moves</h2>
            <p className="mt-2 text-app-muted">
              From deposit to perp pool and back: each step below matches the on-chain contract path.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                k: "01",
                title: "Deposit",
                text: "USDC enters BasketVault. Shares mint at the oracle basket index after fees.",
              },
              {
                k: "02",
                title: "Allocate",
                text: "Capital routes to VaultAccounting as collateral for the shared perp pool.",
              },
              {
                k: "03",
                title: "Trade",
                text: "Operators open/close positions. PnL accrues to the accounting layer per vault.",
              },
              {
                k: "04",
                title: "Exit",
                text: "Burn shares to withdraw USDC. Liquidity depends on vault + pool balances.",
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

      <section className="border-t border-app-border bg-app-bg-subtle py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-xl font-bold text-app-text">Ready to interact?</h2>
            <p className="mt-1 text-sm text-app-muted">
              Connect a wallet, then browse baskets and your portfolio.
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
              href="/prices"
              className="inline-flex items-center rounded-md border border-app-border bg-app-surface px-5 py-2.5 text-sm font-semibold text-app-text hover:bg-app-surface-hover"
            >
              Oracle prices
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
  icon: LucideIcon;
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
