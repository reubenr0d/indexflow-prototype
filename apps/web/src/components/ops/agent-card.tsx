import Link from "next/link";
import {
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Activity,
  FileDiff,
  Calendar,
  Bug,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmployeeCard, WriteActionSummary, WriteActionKind } from "@/lib/ops-types";

interface AgentCardProps {
  agent: EmployeeCard;
  repoUrl: string;
}

const STATE_BADGE: Record<EmployeeCard["state"], string> = {
  active: "border-app-success/40 bg-app-success/10 text-app-success",
  brainstorm: "border-app-warning/40 bg-app-warning/10 text-app-warning",
  "out-of-scope": "border-app-accent/40 bg-app-accent/10 text-app-accent",
};

const STATE_LABEL: Record<EmployeeCard["state"], string> = {
  active: "Active",
  brainstorm: "Brainstorm",
  "out-of-scope": "Repo-managed",
};

const KIND_LABEL: Record<EmployeeCard["kind"], string> = {
  trading: "Trading",
  meta: "Meta-engineer",
  growth: "Growth / CMO",
  "prompt-only": "Prompt-only reviewer",
};

const STATUS_TONE: Record<string, string> = {
  succeeded: "text-app-success",
  succeeded_with_errors: "text-app-warning",
  failed: "text-app-danger",
};

function shortenHash(hash: string | null | undefined): string {
  if (!hash) return "";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export function AgentCard({ agent, repoUrl }: AgentCardProps) {
  const heartbeat = agent.heartbeat;
  const statusTone = heartbeat?.status ? STATUS_TONE[heartbeat.status] ?? "text-app-muted" : "text-app-muted";
  const promptUrl = agent.promptFile ? `${repoUrl}/blob/main/${agent.promptFile}` : null;
  const vaultUrl = agent.vault?.address ? `/baskets/${agent.vault.address.toLowerCase()}` : null;

  return (
    <article className="rounded-lg border border-app-border bg-app-surface p-5 shadow-[var(--shadow)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-app-text">{agent.title || agent.id}</h3>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                STATE_BADGE[agent.state],
              )}
            >
              {STATE_LABEL[agent.state]}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-app-muted">
            {agent.id} · {KIND_LABEL[agent.kind]}
            {agent.team && <> · {agent.team}</>}
          </p>
        </div>
        {promptUrl && (
          <a
            href={promptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-app-border bg-app-bg-subtle px-2 py-1 text-xs text-app-muted transition-colors hover:border-app-border-strong hover:text-app-text"
          >
            <ExternalLink className="h-3 w-3" />
            prompt
          </a>
        )}
      </header>

      {agent.vault && agent.vault.address && (
        <Link
          href={vaultUrl!}
          className="mt-3 inline-flex items-center gap-1 rounded-md border border-app-accent/30 bg-app-accent/5 px-2.5 py-1 text-xs font-medium text-app-accent transition-colors hover:bg-app-accent/10"
        >
          <Activity className="h-3 w-3" />
          {agent.vault.name}
        </Link>
      )}

      {(agent.heartbeat?.thesis || agent.description) && (
        <p className="mt-3 text-sm leading-relaxed text-app-text">
          {agent.heartbeat?.thesis ?? agent.description}
        </p>
      )}

      {heartbeat && (
        <div className="mt-4 rounded-md border border-app-border bg-app-bg-subtle p-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={cn("font-mono font-semibold uppercase tracking-wider", statusTone)}>
              {heartbeat.status}
            </span>
            <span className="text-app-muted">
              {formatTime(heartbeat.finishedAt)} · run {heartbeat.runId.slice(0, 19)}
            </span>
          </div>
          {heartbeat.usage && (
            <div className="mt-2 flex flex-wrap gap-3 text-app-muted">
              <span>turns {heartbeat.usage.turns}</span>
              <span>tools {heartbeat.usage.toolCalls}</span>
              <span>writes {heartbeat.usage.writeActions}</span>
              {heartbeat.usage.errors > 0 && (
                <span className="text-app-danger">errors {heartbeat.usage.errors}</span>
              )}
              {heartbeat.usage.softFailures > 0 && (
                <span className="text-app-warning">soft-fails {heartbeat.usage.softFailures}</span>
              )}
            </div>
          )}
          {heartbeat.writeActions.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {heartbeat.writeActions.slice(0, 4).map((action, idx) => (
                <li key={idx} className="text-app-text">
                  <WriteActionRow action={action} repoUrl={repoUrl} />
                </li>
              ))}
            </ul>
          )}
          {heartbeat.errors && heartbeat.errors.length > 0 && (
            <details className="mt-3 text-app-danger">
              <summary className="cursor-pointer text-xs font-medium">
                {heartbeat.errors.length} error{heartbeat.errors.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 space-y-1 font-mono text-[11px]">
                {heartbeat.errors.slice(0, 3).map((err, i) => (
                  <li key={i} className="break-words">{err}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {!heartbeat && agent.description && agent.state !== "active" && (
        <p className="mt-3 text-xs italic text-app-muted">
          No heartbeats yet — proposed surface awaits prompt-file authoring.
        </p>
      )}
    </article>
  );
}

const KIND_ICON: Record<WriteActionKind, typeof Receipt> = {
  "vault-tx": Receipt,
  "issue-proposal": Bug,
  "file-diff": FileDiff,
  "calendar-update": Calendar,
};

const KIND_LABEL_WRITE: Record<WriteActionKind, string> = {
  "vault-tx": "vault tx",
  "issue-proposal": "issue",
  "file-diff": "file edit",
  "calendar-update": "calendar",
};

function WriteActionRow({
  action,
  repoUrl,
}: {
  action: WriteActionSummary;
  repoUrl: string;
}) {
  const kind: WriteActionKind = action.kind ?? "vault-tx";
  const Icon = KIND_ICON[kind] ?? Receipt;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-app-muted">
          <Icon className="h-3 w-3" />
          {KIND_LABEL_WRITE[kind]}
        </span>
        {kind === "vault-tx" && action.txHash && (
          <span className="font-mono text-app-muted">tx {shortenHash(action.txHash)}</span>
        )}
        {kind === "issue-proposal" && action.issueCategory && (
          <span className="rounded border border-app-border bg-app-bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-app-muted">
            {action.issueCategory}
          </span>
        )}
        {kind === "calendar-update" && action.slotDate && (
          <span className="font-mono text-app-muted">{action.slotDate}</span>
        )}
        {kind === "calendar-update" && action.statusTransition && (
          <span className="rounded border border-app-border bg-app-bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-app-muted">
            {action.statusTransition}
          </span>
        )}
        {action.riskOfficer && <RiskBadge verdict={action.riskOfficer.verdict} />}
      </div>

      {kind === "issue-proposal" && action.issueTitle && (
        <div className="mt-0.5 text-app-text">
          {action.issueUrl ? (
            <a
              href={action.issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {action.issueTitle}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            action.issueTitle
          )}
        </div>
      )}

      {(kind === "file-diff" || kind === "calendar-update") && action.path && (
        <div className="mt-0.5">
          <a
            href={`${repoUrl}/blob/main/${action.path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-app-muted hover:text-app-text hover:underline"
          >
            {action.path}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {action.justification && (
        <div className="mt-0.5 text-app-muted">{action.justification}</div>
      )}
    </div>
  );
}

function RiskBadge({ verdict }: { verdict: "approve" | "downsize" | "veto" }) {
  const tone =
    verdict === "approve"
      ? { Icon: ShieldCheck, cls: "text-app-success" }
      : verdict === "downsize"
        ? { Icon: ShieldAlert, cls: "text-app-warning" }
        : { Icon: ShieldX, cls: "text-app-danger" };
  return (
    <span className={cn("ml-1 inline-flex items-center gap-0.5 align-middle", tone.cls)}>
      <tone.Icon className="h-3 w-3" />
      <span className="text-[10px] font-medium uppercase tracking-wider">{verdict}</span>
    </span>
  );
}
