import { Calendar, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentCalendarRow } from "@/lib/ops-types";

interface ContentCalendarStripProps {
  rows: ContentCalendarRow[];
  repoUrl: string;
}

const STATUS_TONE: Record<string, string> = {
  posted: "border-app-success/40 bg-app-success/10 text-app-success",
  scheduled: "border-app-accent/40 bg-app-accent/10 text-app-accent",
  polished: "border-app-warning/40 bg-app-warning/10 text-app-warning",
  seeded: "border-app-border bg-app-bg-subtle text-app-muted",
};

function pickUpcoming(rows: ContentCalendarRow[], limit: number): ContentCalendarRow[] {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => r.date >= today);
  const window = upcoming.slice(0, limit);
  if (window.length >= limit) return window;
  // pad with last few past rows to give context
  const past = rows.filter((r) => r.date < today).slice(-(limit - window.length));
  return [...past, ...window];
}

export function ContentCalendarStrip({ rows, repoUrl }: ContentCalendarStripProps) {
  if (rows.length === 0) return null;
  const window = pickUpcoming(rows, 7);
  const posted = rows.filter((r) => r.status === "posted");
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-app-muted">
          <Calendar className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-wider">
            Season 1 content calendar — next 7 slots
          </h2>
        </div>
        <a
          href={`${repoUrl}/blob/main/growth/X_CONTENT_CALENDAR.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-app-muted transition-colors hover:text-app-text"
        >
          <ExternalLink className="h-3 w-3" />
          Full schedule
        </a>
      </header>
      <p className="mt-2 text-sm text-app-muted">
        {posted.length} of {rows.length} posted so far. Every post is human-gated;
        templates are pre-approved in COMPANY.md so content-publisher can draft
        without per-post friction.
      </p>
      <div className="mt-5 overflow-x-auto rounded-lg border border-app-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-app-bg-subtle text-xs uppercase tracking-wider text-app-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Slot</th>
              <th className="px-3 py-2 font-medium">Track</th>
              <th className="px-3 py-2 font-medium">Pillar</th>
              <th className="px-3 py-2 font-medium">Hook</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {window.map((row) => (
              <tr key={row.date} className="border-t border-app-border odd:bg-app-surface">
                <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-app-text">
                  {row.day} {row.date.slice(5)}{" "}
                  <span className="text-app-muted">{row.timeUtc}</span>
                </td>
                <td className="px-3 py-2 text-xs text-app-text">{row.slotType}</td>
                <td className="px-3 py-2 font-mono text-xs text-app-muted">{row.track}</td>
                <td className="px-3 py-2 font-mono text-xs text-app-muted">{row.pillar}</td>
                <td className="px-3 py-2 text-xs">{row.hookType}</td>
                <td className="px-3 py-2">
                  {row.postedUrl ? (
                    <a
                      href={row.postedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                        STATUS_TONE.posted,
                      )}
                    >
                      posted
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                        STATUS_TONE[row.status] ?? STATUS_TONE.seeded,
                      )}
                    >
                      {row.status}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
