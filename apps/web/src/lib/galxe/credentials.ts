import { GraphQLClient } from "graphql-request";
import {
  addressQualifiesForGenesisLive,
  addressQualifiesForVeteran,
  normalizeAddress,
} from "./curator-quests";
import { loadCuratorLeaderboardSnapshot } from "./snapshot";
import { CONSISTENT_CURATOR_MIN_WEEKS } from "./types";

export interface GalxeCredentialContext {
  envioUrl: string;
  hubChainId: number;
}

function getEnvioClient(envioUrl: string): GraphQLClient {
  return new GraphQLClient(envioUrl, { fetch });
}

/**
 * Evaluate a Galxe REST credential for the Curators Guild.
 *
 * Supported credIds:
 * - curator-genesis: entry quest (live Envio check)
 * - curator-weekly-winner-{weekKey}: top 5 for ISO week (snapshot)
 * - curator-streak-2, curator-streak-3: consecutive top 5 weeks (snapshot)
 * - curator-badge-champion: won #1 any week (snapshot)
 * - curator-badge-consistent: top 5 in ≥3 weeks (snapshot)
 * - curator-badge-veteran: basket alive ≥30 days (live Envio)
 */
export async function evaluateGalxeCredential(
  credId: string,
  address: string,
  context: GalxeCredentialContext,
): Promise<boolean> {
  const normalized = normalizeAddress(address);
  const client = getEnvioClient(context.envioUrl);

  // Live Envio checks (no snapshot needed)
  if (credId === "curator-genesis") {
    return addressQualifiesForGenesisLive(client, normalized);
  }
  if (credId === "curator-badge-veteran") {
    return addressQualifiesForVeteran(client, normalized);
  }

  // Weekly winner check
  if (credId.startsWith("curator-weekly-winner-")) {
    const weekKey = credId.slice("curator-weekly-winner-".length);
    return evaluateWeeklyWinner(normalized, weekKey);
  }

  // Snapshot-based checks
  const snapshot = await loadCuratorLeaderboardSnapshot();
  if (!snapshot) {
    return false;
  }

  const metrics = snapshot.streaks[normalized];
  switch (credId) {
    case "curator-streak-2":
      return (metrics?.currentConsecutiveTop5 ?? 0) >= 2;
    case "curator-streak-3":
      return (metrics?.currentConsecutiveTop5 ?? 0) >= 3;
    case "curator-badge-champion":
      return (metrics?.weeklyWins ?? 0) >= 1;
    case "curator-badge-consistent":
      return (metrics?.totalTop5Weeks ?? 0) >= CONSISTENT_CURATOR_MIN_WEEKS;
    default:
      return false;
  }
}

async function evaluateWeeklyWinner(address: string, weekKey: string): Promise<boolean> {
  const snapshot = await loadCuratorLeaderboardSnapshot();
  if (!snapshot) return false;
  const week = snapshot.weeks.find((entry) => entry.weekKey === weekKey);
  if (!week) return false;
  return week.entries.some((entry) => normalizeAddress(entry.address) === address);
}

export function parseGalxeCredentialRequest(
  searchParams: URLSearchParams,
): { credId: string; address: string } | null {
  const credId = (searchParams.get("cred_id") ?? searchParams.get("credId") ?? "").trim();
  const address = (searchParams.get("address") ?? searchParams.get("addr") ?? "").trim();
  if (!credId || !address) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
  return { credId, address };
}
