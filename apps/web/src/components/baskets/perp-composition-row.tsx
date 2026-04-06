import { formatBps, formatNetExposure1e30, formatUsd1e30, type ExposureDirection } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PerpCompositionRowProps = {
  assetName: string;
  assetAddressLabel: string;
  netSize1e30: bigint;
  longSize1e30: bigint;
  shortSize1e30: bigint;
  blendBps: bigint;
};

export function getLongShortPercents(longSize1e30: bigint, shortSize1e30: bigint): {
  longPct: number;
  shortPct: number;
} {
  const total = longSize1e30 + shortSize1e30;
  if (total <= 0n) return { longPct: 0, shortPct: 0 };
  const longPct = Number((longSize1e30 * 10_000n) / total) / 100;
  return {
    longPct,
    shortPct: 100 - longPct,
  };
}

function getDirectionBadgeClass(direction: ExposureDirection): string {
  if (direction === "Long") return "border-app-success bg-app-bg-subtle text-app-success";
  if (direction === "Short") return "border-app-danger bg-app-bg-subtle text-app-danger";
  return "border-app-border bg-app-bg-subtle text-app-muted";
}

export function PerpCompositionRow({
  assetName,
  assetAddressLabel,
  netSize1e30,
  longSize1e30,
  shortSize1e30,
  blendBps,
}: PerpCompositionRowProps) {
  const net = formatNetExposure1e30(netSize1e30);
  const { longPct, shortPct } = getLongShortPercents(longSize1e30, shortSize1e30);

  return (
    <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-app-text">{assetName}</p>
        <p className="font-mono text-xs text-app-muted">{assetAddressLabel}</p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide",
              getDirectionBadgeClass(net.direction)
            )}
          >
            {net.direction}
          </span>
          <span className="font-mono text-sm font-semibold text-app-text">Net {net.amount}</span>
        </div>

        <div className="mt-2 max-w-lg">
          <div className="relative h-2 overflow-hidden rounded-full border border-app-border bg-app-bg-subtle">
            <div className="absolute inset-y-0 left-1/2 w-px bg-app-border-strong" />
            <div className="absolute inset-y-0 right-1/2 bg-app-success" style={{ width: `${longPct / 2}%` }} />
            <div className="absolute inset-y-0 left-1/2 bg-app-danger" style={{ width: `${shortPct / 2}%` }} />
          </div>
          <p className="mt-1 flex items-center justify-between font-mono text-xs text-app-muted">
            <span>Long {formatUsd1e30(longSize1e30)}</span>
            <span>Short {formatUsd1e30(shortSize1e30)}</span>
          </p>
        </div>
      </div>

      <div className="w-full sm:w-40">
        <p className="text-right font-mono text-[11px] uppercase tracking-wide text-app-muted">Allocation</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-bg-subtle">
          <div
            className="h-full rounded-full bg-app-accent"
            style={{ width: `${Number(blendBps) / 100}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-app-muted">{formatBps(blendBps)}</p>
      </div>
    </div>
  );
}
