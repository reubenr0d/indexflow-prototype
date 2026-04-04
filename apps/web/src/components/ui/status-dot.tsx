import { cn } from "@/lib/utils";

type Status = "fresh" | "aging" | "stale";

const statusColors: Record<Status, string> = {
  fresh: "bg-app-success",
  aging: "bg-app-warning",
  stale: "bg-app-danger",
};

interface StatusDotProps {
  status: Status;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", statusColors[status], className)}
    />
  );
}

export function getOracleStatus(isStale: boolean, lastUpdate: number): Status {
  if (isStale) return "stale";
  const age = Math.floor(Date.now() / 1000) - lastUpdate;
  if (age > 120) return "aging";
  return "fresh";
}
