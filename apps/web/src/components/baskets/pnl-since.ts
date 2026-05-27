export function formatPnlSinceSubtext(createdAt?: bigint): string | undefined {
  if (!createdAt || createdAt <= 0n) return undefined;
  return `Since ${new Date(Number(createdAt) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}
