import type { Metadata } from "next";
import { CuratorsLeaderboardView } from "@/components/operators/curators-leaderboard-view";
import { loadCuratorLeaderboardSnapshot } from "@/lib/galxe/snapshot";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Curators Guild Leaderboard | IndexFlow",
  description:
    "Season 1 rankings for IndexFlow basket curators by best-basket 7-day NAV growth. $50 USDC weekly pool, achievement badges, and streak credit.",
  alternates: {
    canonical: `${SITE_URL}/operators`,
  },
  openGraph: {
    title: "Curators Guild Leaderboard | IndexFlow",
    description:
      "Top 5 curators each week by best-basket NAV growth. $50 USDC weekly pool, achievement badges, and streaks on IndexFlow.",
    url: `${SITE_URL}/operators`,
  },
};

export default async function OperatorsPage() {
  const snapshot = await loadCuratorLeaderboardSnapshot();
  return <CuratorsLeaderboardView snapshot={snapshot} />;
}
