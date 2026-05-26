import { Activity, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmployeeCard } from "@/lib/ops-types";

interface ActivityFeedProps {
  agents: EmployeeCard[];
  limit?: number;
}

const STATUS_TONE: Record<string, string> = {
  succeeded: "text-app-success",
  succeeded_with_errors: "text-app-warning",
  failed: "text-app-danger",
};

function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityFeed({ agents, limit = 8 }: ActivityFeedProps) {
  const beats = agents
    .filter((a) => a.heartbeat?.finishedAt)
    .sort((a, b) =>
      (b.heartbeat?.finishedAt ?? "").localeCompare(a.heartbeat?.finishedAt ?? ""),
    )
    .slice(0, limit);

  if (beats.length === 0) {
    return (
      <div className="rounded-lg border border-app-border bg-app-surface p-6 text-center">
        <Activity className="mx-auto h-5 w-5 text-app-muted" />
        <p className="mt-2 text-sm text-app-muted">No heartbeats recorded yet.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-app-border overflow-hidden rounded-lg border border-app-border bg-app-surface">
      {beats.map((agent) => {
        const hb = agent.heartbeat!;
        const tone = STATUS_TONE[hb.status] ?? "text-app-muted";
        const writeCount = hb.writeActions?.length ?? 0;
        const vetoes = hb.writeActions?.filter((w) => w.riskOfficer?.verdict === "veto").length ?? 0;
        const downsizes =
          hb.writeActions?.filter((w) => w.riskOfficer?.verdict === "downsize").length ?? 0;
        const approves =
          hb.writeActions?.filter((w) => w.riskOfficer?.verdict === "approve").length ?? 0;
        return (
          <li key={`${agent.id}-${hb.runId}`} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-app-text">{agent.title || agent.id}</span>
                  <span
                    className={cn(
                      "font-mono text-[10px] font-semibold uppercase tracking-wider",
                      tone,
                    )}
                  >
                    {hb.status}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-app-muted">
                  {agent.id} · {writeCount} write{writeCount === 1 ? "" : "s"}
                  {hb.usage && (
                    <>
                      {" "}· turns {hb.usage.turns} · tools {hb.usage.toolCalls}
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[11px] text-app-muted">
                {(approves > 0 || downsizes > 0 || vetoes > 0) && (
                  <span className="inline-flex items-center gap-2">
                    {approves > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-app-success">
                        <ShieldCheck className="h-3 w-3" />
                        {approves}
                      </span>
                    )}
                    {downsizes > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-app-warning">
                        <ShieldAlert className="h-3 w-3" />
                        {downsizes}
                      </span>
                    )}
                    {vetoes > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-app-danger">
                        <ShieldX className="h-3 w-3" />
                        {vetoes}
                      </span>
                    )}
                  </span>
                )}
                <span className="font-mono" title={formatTime(hb.finishedAt)}>
                  {formatRelative(hb.finishedAt)}
                </span>
              </div>
            </div>
            {hb.thesis && (
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-app-text">{hb.thesis}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
