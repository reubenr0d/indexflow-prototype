import { GraphQLClient } from "graphql-request";
import {
  buildLeaderboardSnapshot,
  isoWeekKey,
} from "../../../apps/web/src/lib/galxe/curator-quests.ts";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function weekKeysToCompute(nowUnix: number): string[] {
  const current = isoWeekKey(nowUnix);
  const previous = isoWeekKey(nowUnix - 7 * 86_400);
  const keys = [previous, current];
  return [...new Set(keys)];
}

async function main() {
  const envioUrl = requiredEnv("ENVIO_URL");
  const outputPath =
    process.env.CURATOR_LEADERBOARD_OUTPUT_PATH?.trim() ??
    "apps/web/public/curator-leaderboard.snapshot.json";
  const hubChainId = Number(process.env.CURATOR_HUB_CHAIN_ID ?? "11155111");
  const nowUnix = process.env.CURATOR_SNAPSHOT_NOW_UNIX
    ? Number(process.env.CURATOR_SNAPSHOT_NOW_UNIX)
    : Math.floor(Date.now() / 1000);

  const client = new GraphQLClient(envioUrl, {
    headers: { "content-type": "application/json" },
  });

  const snapshot = await buildLeaderboardSnapshot(client, weekKeysToCompute(nowUnix), {
    hubChainId,
    nowUnix,
  });

  const payload = JSON.stringify(snapshot, null, 2);
  if (process.env.CURATOR_LEADERBOARD_STDOUT === "1") {
    process.stdout.write(`${payload}\n`);
    return;
  }

  const fs = await import("node:fs/promises");
  await fs.writeFile(outputPath, payload, "utf8");
  console.log(`Wrote curator leaderboard snapshot to ${outputPath}`);
  console.log(
    `Weeks: ${snapshot.weeks.map((week) => `${week.weekKey} (${week.entries.length} ranked)`).join(", ")}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
