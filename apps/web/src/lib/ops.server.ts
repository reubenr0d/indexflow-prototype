import "server-only";
import { cache } from "react";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import type {
  AgentMemoryState,
  BasketConcept,
  BlogPostMetaLite,
  Budgets,
  CompanyManifest,
  ContentCalendarRow,
  DeploymentRow,
  EmployeeCard,
  Heartbeat,
  OpsSnapshot,
  PartnerRow,
  PublicSurface,
  RunLogEntry,
} from "@/lib/ops-types";

// Repo root resolver — Next builds from apps/web, but the same code may
// run via `next start` from the repo root in CI smoke tests.
function repoRootPath(): string {
  const relativeToWebApp = path.resolve(process.cwd(), "..", "..");
  if (existsSync(path.join(relativeToWebApp, "COMPANY.md"))) return relativeToWebApp;
  return process.cwd();
}

// Patterns of secret-shaped strings to redact from any text the page
// renders (run log error frames, summaries, etc). Keep this conservative
// — over-redaction is preferable to ever surfacing a key in the public
// mirror.
const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted:openai-key]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[redacted:gh-token]"],
  [/\bkh_[A-Za-z0-9]{16,}\b/g, "[redacted:keeperhub-key]"],
  // tx hashes (0x + 64 hex) are public so we don't redact them; no entry here.
  [/\bLLM_API_KEY\s*=\s*\S+/g, "LLM_API_KEY=[redacted]"],
  [/\bGH_TOKEN\s*=\s*\S+/g, "GH_TOKEN=[redacted]"],
  [/\bKEEPERHUB_API_KEY\s*=\s*\S+/g, "KEEPERHUB_API_KEY=[redacted]"],
  [/\bZG_PRIVATE_KEY\s*=\s*\S+/g, "ZG_PRIVATE_KEY=[redacted]"],
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

// YAML date scalars (e.g. `proposedDate: 2026-05-26`) deserialize to JS
// Date objects. We always want ISO-yyyy-mm-dd strings on the snapshot so
// the React renderer never sees a raw Date (which throws "Objects are
// not valid as a React child").
function normalizeYamlDate(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

// ---------------------------------------------------------------------------
// Parse helpers — COMPANY.md uses YAML frontmatter for top-level metadata,
// then fenced ```yaml blocks under each heading for structured payloads.
// We grab them by heading anchor so the parser is resilient to surrounding
// prose edits.
// ---------------------------------------------------------------------------

interface YamlBlock {
  heading: string;
  body: string;
}

function extractYamlBlocks(markdown: string): YamlBlock[] {
  const blocks: YamlBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  let currentHeading = "";
  let inFence = false;
  let fenceLang = "";
  let buffer: string[] = [];

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch && !inFence) {
      currentHeading = headingMatch[2].replace(/\s+#*\s*$/, "").trim();
      continue;
    }

    const fenceMatch = /^```(\w+)?/.exec(line);
    if (fenceMatch && !inFence) {
      inFence = true;
      fenceLang = (fenceMatch[1] ?? "").toLowerCase();
      buffer = [];
      continue;
    }
    if (line.startsWith("```") && inFence) {
      if (fenceLang === "yaml" || fenceLang === "yml") {
        blocks.push({ heading: currentHeading, body: buffer.join("\n") });
      }
      inFence = false;
      fenceLang = "";
      buffer = [];
      continue;
    }
    if (inFence) buffer.push(line);
  }

  return blocks;
}

function parseYamlSafe<T = unknown>(body: string): T | null {
  try {
    return yaml.load(body) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// COMPANY.md — top-level manifest
// ---------------------------------------------------------------------------

const PUBLIC_SURFACE_URL_RE = /\((https?:[^)\s]+)\)/;
const PUBLIC_SURFACE_HANDLE_RE = /\[([^\]]+)\]/;

function parsePublicSurfaces(markdown: string): PublicSurface[] {
  // The "Public surfaces" subsection is a markdown table — parse rows
  // between the header divider and the next blank line / heading.
  const lines = markdown.split(/\r?\n/);
  const headingIdx = lines.findIndex((l) => l.trim().startsWith("### Public surfaces"));
  if (headingIdx < 0) return [];

  const surfaces: PublicSurface[] = [];
  let started = false;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("#")) break;
    if (line.trim().startsWith("|") && line.includes("|")) {
      const parts = line.split("|").map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // Skip header rows
        if (parts[0].toLowerCase() === "surface") continue;
        if (parts.every((p) => /^-+$/.test(p))) continue;
        const [surface, value] = parts;
        const urlMatch = value.match(PUBLIC_SURFACE_URL_RE);
        const handleMatch = value.match(PUBLIC_SURFACE_HANDLE_RE);
        surfaces.push({
          surface,
          value: handleMatch?.[1] ?? value.replace(/`/g, ""),
          url: urlMatch?.[1] ?? (value.startsWith("http") ? value : undefined),
        });
        started = true;
      }
    } else if (started && line.trim() === "") {
      break;
    }
  }
  return surfaces;
}

interface CompanyParseResult {
  manifest: CompanyManifest;
  employees: EmployeeCard[];
  brainstorm: EmployeeCard[];
  outOfScope: EmployeeCard[];
}

interface RawEmployeeYaml {
  id?: string;
  title?: string;
  role?: string;
  team?: string;
  reportsTo?: string;
  state?: string;
  kind?: string;
  promptFile?: string;
  proposedPromptFile?: string;
  notes?: string;
  rationale?: string;
  manageVia?: string;
  vault?: string;
}

interface OutOfScopeYaml {
  outOfScope: {
    agents: RawEmployeeYaml[];
  };
}

interface EmployeesYaml {
  employees: RawEmployeeYaml[];
}

interface BrainstormYaml {
  brainstorm: RawEmployeeYaml[];
}

interface GovernanceYaml {
  governance: {
    hardConstraints: Array<{ id: string; description: string }>;
    approvalsRequired: string[];
  };
}

interface BudgetsYaml {
  budgets: Budgets;
}

interface GoalsYaml {
  goals: Array<{
    id: string;
    name: string;
    description?: string;
    rationale?: string;
    horizon?: string;
    metric?: string | string[];
    sourceDoc?: string;
    sourceDocs?: string[];
  }>;
}

function formatGoalMetric(metric: string | string[] | undefined): string | undefined {
  if (!metric) return undefined;
  if (Array.isArray(metric)) {
    return metric.map((m) => String(m).trim()).join(" · ");
  }
  return metric.trim() || undefined;
}

function toEmployeeCard(raw: RawEmployeeYaml, fallbackState: "active" | "brainstorm" | "out-of-scope"): EmployeeCard {
  const state = (raw.state as "active" | "brainstorm" | "out-of-scope") ?? fallbackState;
  const promptFile = raw.promptFile ?? raw.proposedPromptFile ?? "";
  return {
    id: raw.id ?? "",
    title: raw.title ?? raw.id ?? "",
    role: raw.role ?? "",
    team: raw.team ?? "",
    state,
    kind: raw.kind === "prompt-only" ? "prompt-only" : inferKind(raw.id ?? "", raw.team ?? "", fallbackState),
    promptFile,
    description: (raw.notes ?? raw.rationale ?? "").trim(),
    reportsTo: raw.reportsTo,
    vault: raw.vault ? { address: "", name: raw.vault } : null,
    heartbeat: null,
    memory: null,
    recentRuns: [],
  };
}

function inferKind(id: string, team: string, fallback: "active" | "brainstorm" | "out-of-scope"): EmployeeCard["kind"] {
  if (fallback === "out-of-scope") return "trading";
  if (id.includes("risk-officer")) return "prompt-only";
  if (team === "growth") return "growth";
  return "meta";
}

export async function loadCompany(): Promise<CompanyParseResult> {
  const filePath = path.join(repoRootPath(), "COMPANY.md");
  const raw = await fs.readFile(filePath, "utf8");
  const { data, content } = matter(raw);

  const blocks = extractYamlBlocks(content);

  const employeesBlock = blocks.find((b) => b.heading.startsWith("Active"));
  const brainstormBlock = blocks.find((b) => b.heading.startsWith("Brainstorm"));
  const outOfScopeBlock = blocks.find((b) => b.heading.startsWith("Out of Scope"));
  const governanceBlock = blocks.find((b) => b.heading === "Governance");
  const budgetsBlock = blocks.find((b) => b.heading === "Budgets");
  const goalsBlock = blocks.find((b) => b.heading === "Strategic priorities");

  const parsedEmployees = parseYamlSafe<EmployeesYaml>(employeesBlock?.body ?? "");
  const parsedBrainstorm = parseYamlSafe<BrainstormYaml>(brainstormBlock?.body ?? "");
  const parsedOutOfScope = parseYamlSafe<OutOfScopeYaml>(outOfScopeBlock?.body ?? "");
  const parsedGovernance = parseYamlSafe<GovernanceYaml>(governanceBlock?.body ?? "");
  const parsedBudgets = parseYamlSafe<BudgetsYaml>(budgetsBlock?.body ?? "");
  const parsedGoals = parseYamlSafe<GoalsYaml>(goalsBlock?.body ?? "");

  const employees = (parsedEmployees?.employees ?? []).map((e) => toEmployeeCard(e, "active"));
  const brainstorm = (parsedBrainstorm?.brainstorm ?? []).map((e) => toEmployeeCard(e, "brainstorm"));
  const outOfScope = (parsedOutOfScope?.outOfScope?.agents ?? []).map((e) => toEmployeeCard(e, "out-of-scope"));

  const manifest: CompanyManifest = {
    name: (data.name as string) ?? "IndexFlow",
    slug: (data.slug as string) ?? "indexflow",
    tagline: (data.tagline as string) ?? "",
    mission: ((data.mission as string) ?? "").trim(),
    sourceRepo: (data.sourceRepo as string) ?? "https://github.com/reubenr0d/indexflow-prototype",
    publicSurfaces: parsePublicSurfaces(content),
    hardConstraints: parsedGovernance?.governance?.hardConstraints ?? [],
    approvalsRequired: parsedGovernance?.governance?.approvalsRequired ?? [],
    budgets:
      parsedBudgets?.budgets ?? {
        defaultCurrency: "USD",
        cycle: "monthly",
        active: [],
        proposedOnPromotion: [],
        totalActive: 0,
        totalIfAllPromoted: 0,
      },
    strategicPriorities: (parsedGoals?.goals ?? [])
      .filter((g) => g.id !== "partnership-pipeline")
      .map((g) => ({
        id: g.id,
        name: g.name,
        description: (g.description ?? g.rationale ?? "").trim() || undefined,
        horizon: g.horizon,
        metric: formatGoalMetric(g.metric),
        sourceDoc: g.sourceDoc ?? g.sourceDocs?.[0],
      })),
  };

  return { manifest, employees, brainstorm, outOfScope };
}

// ---------------------------------------------------------------------------
// agents/memory loaders
// ---------------------------------------------------------------------------

async function readJsonIfExists<T>(p: string): Promise<T | null> {
  if (!existsSync(p)) return null;
  try {
    const text = await fs.readFile(p, "utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function readRunLogTail(p: string, limit: number): Promise<RunLogEntry[]> {
  if (!existsSync(p)) return [];
  try {
    const text = await fs.readFile(p, "utf8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const entries: RunLogEntry[] = [];
    for (const line of lines.slice(-limit)) {
      try {
        entries.push(JSON.parse(line) as RunLogEntry);
      } catch {
        // skip malformed lines silently
      }
    }
    return entries.reverse();
  } catch {
    return [];
  }
}

async function hydrateWithMemory(card: EmployeeCard, network = "sepolia"): Promise<EmployeeCard> {
  const memoryDir = path.join(repoRootPath(), "agents", "memory", card.id);
  const [heartbeat, state, runs] = await Promise.all([
    readJsonIfExists<Heartbeat>(path.join(memoryDir, "paperclip-heartbeat.json")),
    readJsonIfExists<AgentMemoryState>(path.join(memoryDir, "state.json")),
    readRunLogTail(path.join(memoryDir, `run-log.${network}.jsonl`), 5),
  ]);

  // Redact summary/thesis/errors defensively
  const redactedHeartbeat: Heartbeat | null = heartbeat
    ? {
        ...heartbeat,
        thesis: heartbeat.thesis ? redactSecrets(heartbeat.thesis) : heartbeat.thesis,
        summary: heartbeat.summary ? redactSecrets(heartbeat.summary) : heartbeat.summary,
        errors: heartbeat.errors?.map((e) => redactSecrets(e)) ?? [],
        writeActions: (heartbeat.writeActions ?? []).map((w) => {
          // Back-compat kind inference for pre-2026-05-26 heartbeats
          // (the runner now stamps `kind` directly; older heartbeats
          // never had it). Mirrors the runner's stamping rules so /ops
          // renders consistently regardless of which side wrote them.
          let kind = w.kind;
          if (!kind) {
            if (w.tool === "propose_issue") kind = "issue-proposal";
            else if (
              w.tool === "propose_file_edit" ||
              w.tool === "propose_file_create" ||
              w.tool === "propose_file_rename"
            ) {
              kind = w.path === "growth/X_CONTENT_CALENDAR.md"
                ? "calendar-update"
                : "file-diff";
            } else if (w.txHash) {
              kind = "vault-tx";
            } else {
              kind = "vault-tx"; // legacy default
            }
          }
          return {
            ...w,
            kind,
            justification: w.justification ? redactSecrets(w.justification) : "",
            riskOfficer: w.riskOfficer
              ? { ...w.riskOfficer, reason: redactSecrets(w.riskOfficer.reason) }
              : undefined,
          };
        }),
      }
    : null;

  const vaultAddress = state?.vaultAddress ?? redactedHeartbeat?.vaultAddress ?? card.vault?.address ?? null;
  const vaultName = state?.vaultName ?? redactedHeartbeat?.vaultName ?? card.vault?.name ?? null;

  return {
    ...card,
    heartbeat: redactedHeartbeat,
    memory: state,
    recentRuns: runs,
    vault: vaultAddress && vaultName ? { address: vaultAddress, name: vaultName } : card.vault,
  };
}

// ---------------------------------------------------------------------------
// growth/* loaders
// ---------------------------------------------------------------------------

async function loadContentCalendar(): Promise<ContentCalendarRow[]> {
  const filePath = path.join(repoRootPath(), "growth", "X_CONTENT_CALENDAR.md");
  if (!existsSync(filePath)) return [];
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const rows: ContentCalendarRow[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.includes("| date | day |")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.trim().startsWith("|")) {
      if (line.trim() === "") continue;
      break;
    }
    const parts = line.split("|").map((s) => s.trim());
    // first and last entries are empty due to leading/trailing pipes
    const cells = parts.slice(1, -1);
    if (cells.length < 10) continue;
    if (cells.every((c) => /^-+$/.test(c))) continue;
    if (cells[0].toLowerCase() === "date") continue;
    const [date, day, timeUtc, slotType, track, , pillar, hookType, draftPath, status, postedUrl] = cells;
    rows.push({
      date,
      day,
      timeUtc,
      slotType,
      track,
      pillar,
      hookType,
      draftPath: draftPath?.replace(/`/g, ""),
      status,
      postedUrl: (postedUrl ?? "").trim() || undefined,
    });
  }
  return rows;
}

async function loadPartnerships(): Promise<PartnerRow[]> {
  const filePath = path.join(repoRootPath(), "growth", "partnerships", "README.md");
  if (!existsSync(filePath)) return [];
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const rows: PartnerRow[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.includes("| partner | type | handle |")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.trim().startsWith("|")) {
      if (line.trim() === "") continue;
      break;
    }
    const cells = line.split("|").map((s) => s.trim()).slice(1, -1);
    if (cells.length < 9) continue;
    if (cells.every((c) => /^-+$/.test(c))) continue;
    if (cells[0].toLowerCase() === "partner") continue;
    const [partner, type, handle, status, coMarketing, funding, nextMilestone, nextMilestoneDate, file] = cells;
    const partnerNameMatch = partner.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const fileMatch = file.match(/\(([^)]+)\)/);
    rows.push({
      partner: partnerNameMatch?.[1] ?? partner,
      type,
      handle: handle.replace(/`/g, ""),
      status,
      coMarketing,
      funding,
      nextMilestone,
      nextMilestoneDate,
      filePath: fileMatch?.[1] ?? partnerNameMatch?.[2] ?? "",
    });
  }
  return rows;
}

async function loadBasketConcepts(): Promise<BasketConcept[]> {
  const dir = path.join(repoRootPath(), "growth", "basket-concepts", "queue");
  if (!existsSync(dir)) return [];
  const files = await fs.readdir(dir);
  const concepts: BasketConcept[] = [];
  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const filePath = path.join(dir, file);
    const text = await fs.readFile(filePath, "utf8");
    const { data } = matter(text);
    if (!data.theme) continue;
    concepts.push({
      slug: (data.slug as string) ?? file.replace(/\.md$/, ""),
      theme: (data.theme as string) ?? "",
      status: (data.status as string) ?? "proposed",
      proposedDate: normalizeYamlDate(data.proposedDate),
      proposedBy: (data.proposedBy as string) ?? "",
      filePath: `growth/basket-concepts/queue/${file}`,
      rationale: ((data.rationale as string) ?? "").trim().slice(0, 280),
      targetCuratorPersona: Array.isArray(data.targetCuratorPersona) ? data.targetCuratorPersona : [],
      assetCount: Array.isArray(data.assets) ? data.assets.length : 0,
    });
  }
  return concepts.sort((a, b) => b.proposedDate.localeCompare(a.proposedDate));
}

// ---------------------------------------------------------------------------
// AGENT_DEPLOYMENT_MEMORY.md loader (markdown table → JSON cards)
// ---------------------------------------------------------------------------

async function loadDeployments(): Promise<DeploymentRow[]> {
  const filePath = path.join(repoRootPath(), "AGENT_DEPLOYMENT_MEMORY.md");
  if (!existsSync(filePath)) return [];
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const rows: DeploymentRow[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.includes("| Provider |") && line.includes("Resource Type")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((s) => s.trim()).slice(1, -1);
    if (cells.length < 9) continue;
    if (cells.every((c) => /^-+$/.test(c))) continue;
    if (cells[0].toLowerCase() === "provider") continue;
    const [provider, project, resourceType, resourceName, environment, owner, allowedActions, purpose, created] = cells;
    const superseded = /SUPERSEDED|~~/.test(provider) || /~~/.test(resourceName);
    const planned = /planned/i.test(provider) || /\*\*PLANNED/i.test(purpose);
    rows.push({
      provider: provider.replace(/~~/g, "").trim(),
      project,
      resourceType,
      resourceName,
      environment,
      owner: owner.toLowerCase().includes("agent") ? "agent" : owner.toLowerCase().includes("user") ? "user" : owner,
      allowedActions,
      purpose: purpose.slice(0, 320),
      created,
      superseded,
      planned,
    });
  }
  return rows.filter((r) => !r.superseded);
}

// ---------------------------------------------------------------------------
// Blog index (limited public meta)
// ---------------------------------------------------------------------------

async function loadRecentBlogPosts(limit = 5): Promise<BlogPostMetaLite[]> {
  const dir = path.join(repoRootPath(), "content", "blog");
  if (!existsSync(dir)) return [];
  const files = await fs.readdir(dir);
  const posts: BlogPostMetaLite[] = [];
  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const filePath = path.join(dir, file);
    const text = await fs.readFile(filePath, "utf8");
    const { data } = matter(text);
    if (!data.title || !data.date) continue;
    if (data.published === false) continue;
    posts.push({
      slug: file.replace(/\.md$/, ""),
      title: data.title as string,
      date: normalizeYamlDate(data.date),
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    });
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Main entry — composes the full snapshot
// ---------------------------------------------------------------------------

export const getOpsSnapshot = cache(async (): Promise<OpsSnapshot> => {
  const { manifest, employees, brainstorm, outOfScope } = await loadCompany();

  const [activeEmployees, brainstormEmployees, outOfScopeAgents] = await Promise.all([
    Promise.all(employees.map((e) => hydrateWithMemory(e))),
    Promise.all(brainstorm.map((e) => hydrateWithMemory(e))),
    Promise.all(outOfScope.map((e) => hydrateWithMemory(e))),
  ]);

  const [contentCalendar, partnerships, basketConcepts, deployments, recentBlogPosts] = await Promise.all([
    loadContentCalendar(),
    loadPartnerships(),
    loadBasketConcepts(),
    loadDeployments(),
    loadRecentBlogPosts(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    company: manifest,
    activeEmployees,
    brainstormEmployees,
    outOfScopeAgents,
    contentCalendar,
    partnerships,
    basketConcepts,
    deployments,
    recentBlogPosts,
  };
});
