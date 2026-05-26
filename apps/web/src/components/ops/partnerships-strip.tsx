import { Handshake, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PartnerRow } from "@/lib/ops-types";

interface PartnershipsStripProps {
  rows: PartnerRow[];
  repoUrl: string;
}

const STATUS_TONE: Record<string, string> = {
  active: "text-app-success",
  signed_mou: "text-app-accent",
  in_discussion: "text-app-warning",
};

const COMARKETING_TONE: Record<string, string> = {
  agreed: "text-app-success",
  pending_deploy: "text-app-warning",
  not_confirmed: "text-app-muted",
  active: "text-app-success",
};

export function PartnershipsStrip({ rows, repoUrl }: PartnershipsStripProps) {
  if (rows.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-app-muted">
          <Handshake className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-wider">
            Partnerships pipeline
          </h2>
        </div>
        <a
          href={`${repoUrl}/blob/main/growth/partnerships/README.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-app-muted transition-colors hover:text-app-text"
        >
          <ExternalLink className="h-3 w-3" />
          Full pipeline
        </a>
      </header>
      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <article
            key={`${p.partner}-${p.filePath}`}
            className="rounded-lg border border-app-border bg-app-surface p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-app-text">{p.partner}</h3>
              <span className="text-[10px] font-mono uppercase tracking-wider text-app-muted">
                {p.type}
              </span>
            </div>
            <div className="mt-1 font-mono text-xs text-app-muted">{p.handle}</div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <span>
                <span className="text-app-muted">status </span>
                <span className={cn("font-mono", STATUS_TONE[p.status] ?? "text-app-text")}>
                  {p.status}
                </span>
              </span>
              <span>
                <span className="text-app-muted">co-marketing </span>
                <span
                  className={cn(
                    "font-mono",
                    COMARKETING_TONE[p.coMarketing] ?? "text-app-text",
                  )}
                >
                  {p.coMarketing}
                </span>
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-app-text">{p.nextMilestone}</p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-app-muted">
              <span>next milestone</span>
              <span className="font-mono">{p.nextMilestoneDate || "TBD"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
