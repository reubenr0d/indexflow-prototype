import Link from "next/link";
import {
  Award,
  Calendar,
  Coins,
  Crown,
  LineChart,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { formatAddress } from "@/lib/format";
import {
  CURATOR_BADGE_META,
  collectCuratorAddresses,
  deriveCuratorBadges,
  formatNavChangePct,
  formatWeekLabel,
  getLatestWeek,
  getStreakMetrics,
  sortWeeksNewestFirst,
  vaultFromBasketId,
  type CuratorBadgeKind,
} from "@/lib/galxe/leaderboard-display";
import type { CuratorLeaderboardSnapshot, CuratorWeeklyEntry } from "@/lib/galxe/types";

function CuratorBadgePills({ badges }: { badges: CuratorBadgeKind[] }) {
  if (badges.length === 0) {
    return <span className="text-xs text-app-muted">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => {
        const meta = CURATOR_BADGE_META[badge];
        return (
          <span
            key={badge}
            title={meta.label}
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
          >
            {meta.shortLabel}
          </span>
        );
      })}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const tone =
    rank === 1
      ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : rank <= 3
        ? "border-app-border bg-app-surface text-app-text"
        : "border-app-border bg-app-surface text-app-muted";

  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border font-mono text-xs font-semibold ${tone}`}
    >
      {rank}
    </span>
  );
}

function WeeklyRankingsTable({ entries }: { entries: CuratorWeeklyEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-app-muted">
        No curators qualified this week. Baskets must meet Season 1 eligibility—including Genesis
        entry, minimum age, active assets, and recent operator activity.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-app-border text-xs uppercase tracking-wider text-app-muted">
            <th className="px-4 py-3 font-medium">Rank</th>
            <th className="px-4 py-3 font-medium">Curator</th>
            <th className="px-4 py-3 font-medium">Basket</th>
            <th className="px-4 py-3 font-medium text-right">7-day NAV</th>
            <th className="px-4 py-3 font-medium text-right">Weekly payout</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const vault = vaultFromBasketId(entry.basketId);
            return (
              <tr key={`${entry.rank}-${entry.address}`} className="border-b border-app-border/60 last:border-0">
                <td className="px-4 py-3">
                  <RankBadge rank={entry.rank} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-app-text">{formatAddress(entry.address)}</td>
                <td className="px-4 py-3">
                  {vault ? (
                    <Link
                      href={`/baskets/${vault}`}
                      className="font-medium text-app-text hover:text-app-accent"
                    >
                      {entry.basketName}
                    </Link>
                  ) : (
                    <span className="text-app-text">{entry.basketName}</span>
                  )}
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono ${
                    entry.navChangePct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {formatNavChangePct(entry.navChangePct)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-app-text">${entry.payoutUsd}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const HERO_CONCEPTS: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: LineChart,
    title: "Best-basket NAV growth",
    description:
      "Top 5 curators each week by 7-day NAV change on their strongest eligible basket—skill, not deposit volume.",
  },
  {
    icon: Coins,
    title: "$50 USDC weekly pool",
    description:
      "Winners split $20 / $12 / $8 / $6 / $4. Claim payouts on Galxe after the weekly close.",
  },
  {
    icon: Award,
    title: "Achievement badges",
    description:
      "Genesis entry, Weekly Champion, and Consistent Curator badges track your Season 1 track record.",
  },
  {
    icon: Calendar,
    title: "Sunday 23:59 UTC close",
    description:
      "Rankings reset every week at close. Complete the Genesis entry quest to qualify.",
  },
];

function HeroConceptCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-app-border bg-app-accent/10">
        <Icon className="h-4 w-4 text-app-accent" />
      </div>
      <h2 className="text-sm font-semibold text-app-text">{title}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-app-muted">{description}</p>
    </Card>
  );
}

function EmptyLeaderboardState() {
  return (
    <Card className="p-8">
      <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-app-border bg-app-surface">
          <Trophy className="h-5 w-5 text-app-accent" />
        </div>
        <p className="text-lg font-medium text-app-text">Waiting for the first weekly rankings</p>
        <p className="max-w-lg text-sm leading-relaxed text-app-muted">
          Rankings publish every Sunday at 23:59 UTC. Create a basket, complete the Genesis entry
          quest, and keep it active with qualifying operator actions to compete for weekly USDC
          rewards and achievement badges.
        </p>
        <Link
          href="/admin/baskets"
          className="mt-2 text-sm font-medium text-app-accent hover:underline"
        >
          Create a basket →
        </Link>
      </div>
    </Card>
  );
}

interface CuratorsLeaderboardViewProps {
  snapshot: CuratorLeaderboardSnapshot | null;
}

export function CuratorsLeaderboardView({ snapshot }: CuratorsLeaderboardViewProps) {
  const latestWeek = snapshot ? getLatestWeek(snapshot) : null;
  const historicalWeeks = snapshot ? sortWeeksNewestFirst(snapshot.weeks).slice(1) : [];
  const curatorAddresses = snapshot ? collectCuratorAddresses(snapshot) : [];

  const generatedLabel = snapshot?.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }) + " UTC"
    : null;

  return (
    <PageWrapper>
      <header className="mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-3 py-1 text-xs font-medium text-app-muted">
          <Sparkles className="h-3.5 w-3.5 text-app-accent" />
          Season 1 · Curators Guild
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">Curators Guild Leaderboard</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-app-muted">
          The official Season 1 hall of fame for IndexFlow basket curators.
        </p>

        <section
          aria-label="How the leaderboard works"
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {HERO_CONCEPTS.map((concept) => (
            <HeroConceptCard key={concept.title} {...concept} />
          ))}
        </section>

        {generatedLabel && (
          <p className="mt-4 text-xs text-app-muted">Last updated {generatedLabel}</p>
        )}
      </header>

      <section aria-label="Leaderboard summary" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-app-muted">
            <Calendar className="h-3.5 w-3.5 text-app-accent" />
            Weeks completed
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-app-text">{snapshot?.weeks.length ?? 0}</p>
          <p className="mt-1 text-xs text-app-muted">Weekly ranking periods completed</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-app-muted">
            <Award className="h-3.5 w-3.5 text-app-accent" />
            Genesis curators
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-app-text">
            {snapshot?.genesisAddresses.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-app-muted">Completed the Genesis entry quest</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-app-muted">
            <Crown className="h-3.5 w-3.5 text-app-accent" />
            Current week
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-app-text">{latestWeek?.weekKey ?? "—"}</p>
          <p className="mt-1 text-xs text-app-muted">Most recent ranking period</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-app-muted">
            <Trophy className="h-3.5 w-3.5 text-app-accent" />
            Curators ranked
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-app-text">{curatorAddresses.length}</p>
          <p className="mt-1 text-xs text-app-muted">Unique addresses with a ranking or badge</p>
        </Card>
      </section>

      <section aria-label="Latest weekly rankings" className="mb-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-app-text">Weekly leaders</h2>
            {latestWeek ? (
              <p className="mt-1 text-sm text-app-muted">{formatWeekLabel(latestWeek)}</p>
            ) : (
              <p className="mt-1 text-sm text-app-muted">
                Top five curators by 7-day NAV growth on their strongest basket.
              </p>
            )}
          </div>
        </div>
        <Card className="overflow-hidden">
          {latestWeek && latestWeek.entries.length > 0 ? (
            <WeeklyRankingsTable entries={latestWeek.entries} />
          ) : (
            <EmptyLeaderboardState />
          )}
        </Card>
        <p className="mt-3 text-xs text-app-muted">
          Each score uses a curator&apos;s highest 7-day NAV change among eligible baskets. Payouts
          are claimed on Galxe after the weekly close.
        </p>
      </section>

      {curatorAddresses.length > 0 && (
        <section aria-label="Curator streaks and badges" className="mb-10">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-app-text">Curator track records</h2>
            <p className="mt-1 text-sm text-app-muted">
              Achievement badges and weekly placement history across Season 1. Hover a badge for
              details.
            </p>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-app-border text-xs uppercase tracking-wider text-app-muted">
                    <th className="px-4 py-3 font-medium">Curator</th>
                    <th className="px-4 py-3 font-medium">Badges</th>
                    <th className="px-4 py-3 font-medium text-right">Top-5 streak</th>
                    <th className="px-4 py-3 font-medium text-right">Top-5 weeks</th>
                    <th className="px-4 py-3 font-medium text-right">#1 finishes</th>
                  </tr>
                </thead>
                <tbody>
                  {curatorAddresses.map((address) => {
                    const streak = snapshot ? getStreakMetrics(snapshot, address) : null;
                    const badges = snapshot ? deriveCuratorBadges(address, snapshot) : [];
                    return (
                      <tr key={address} className="border-b border-app-border/60 last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-app-text">{formatAddress(address)}</td>
                        <td className="px-4 py-3">
                          <CuratorBadgePills badges={badges} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-app-text">
                          {streak?.currentConsecutiveTop5 ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-app-text">
                          {streak?.totalTop5Weeks ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-app-text">
                          {streak?.weeklyWins ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="mt-3 text-xs text-app-muted">
            The Veteran badge (basket maintained 30+ days with active assets) is awarded separately
            and will appear here in a future update.
          </p>
        </section>
      )}

      {historicalWeeks.length > 0 && (
        <section aria-label="Historical weekly rankings">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-app-text">Past weeks</h2>
            <p className="mt-1 text-sm text-app-muted">Completed weekly rankings, newest first.</p>
          </div>
          <div className="space-y-4">
            {historicalWeeks.map((week) => (
              <Card key={week.weekKey} className="overflow-hidden">
                <div className="border-b border-app-border px-4 py-3">
                  <h3 className="font-medium text-app-text">{formatWeekLabel(week)}</h3>
                </div>
                <WeeklyRankingsTable entries={week.entries} />
              </Card>
            ))}
          </div>
        </section>
      )}

      {!snapshot && (
        <Card className="mt-6 border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
          Leaderboard data isn&apos;t available right now. Check back after the first weekly
          rankings publish.
        </Card>
      )}
    </PageWrapper>
  );
}
