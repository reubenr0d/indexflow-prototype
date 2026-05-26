// Public ops mirror types — consumed by /ops route and components.
// Source files live under the repo root and are committed by the
// `commit-results` job in .github/workflows/vault-agent.yml. Anything
// rendered on /ops must trace back to one of these files (see
// lib/ops.server.ts for the loaders).

export type AgentState = "active" | "brainstorm" | "out-of-scope";

export type AgentKind = "trading" | "meta" | "growth" | "prompt-only";

export interface HardConstraint {
  id: string;
  description: string;
}

export interface BudgetEntry {
  employee: string;
  monthlyCapUsd: number;
  softWarnPct?: number;
}

export interface Budgets {
  defaultCurrency: string;
  cycle: string;
  active: BudgetEntry[];
  proposedOnPromotion: BudgetEntry[];
  totalActive: number;
  totalIfAllPromoted: number;
}

export interface Governance {
  hardConstraints: HardConstraint[];
  approvalsRequired: string[];
}

export interface StrategicPriority {
  id: string;
  name: string;
  description?: string;
  horizon?: string;
  metric?: string;
  sourceDoc?: string;
}

export interface PublicSurface {
  surface: string;
  value: string;
  url?: string;
}

export interface CompanyManifest {
  name: string;
  slug: string;
  tagline: string;
  mission: string;
  publicSurfaces: PublicSurface[];
  hardConstraints: HardConstraint[];
  approvalsRequired: string[];
  budgets: Budgets;
  strategicPriorities: StrategicPriority[];
  sourceRepo: string;
}

export interface RiskOfficerVerdict {
  verdict: "approve" | "downsize" | "veto";
  reason: string;
}

// The kind of write the agent performed. Drives the agent-card.tsx
// render branch. Inferred at runner-persist time from tool name + args
// (see `kindFromWriteAction` in scripts/agent-runner.mjs), and round-
// tripped through `paperclip-heartbeat.json` so the UI doesn't have to
// re-derive it from the tool string. Heartbeats produced before this
// field was added (trading agents pre-2026-05-26) have `kind` absent;
// the loader falls back to "vault-tx" for those.
export type WriteActionKind =
  | "vault-tx"          // a real on-chain tx — links to /baskets/<vault>
  | "issue-proposal"    // propose_issue — links to the GitHub issue when filed
  | "file-diff"         // propose_file_edit / create / rename — shows path + summary
  | "calendar-update";  // propose_file_edit against growth/X_CONTENT_CALENDAR.md — shows date + status transition

export interface WriteActionSummary {
  tool: string;
  txHash: string | null;
  justification: string;
  riskOfficer?: RiskOfficerVerdict;
  // Non-trading write metadata. All fields optional for back-compat with
  // pre-2026-05-26 heartbeats (mining-manager + quality-matrix-manager
  // never wrote these because their only write tool was vault-manager-mcp).
  kind?: WriteActionKind;
  // For `file-diff` and `calendar-update`: the repo-relative path the
  // edit targets (e.g. `growth/partnerships/nox.md`).
  path?: string;
  // For `issue-proposal`: the GitHub issue URL once the applier files it
  // (the agent itself only writes the manifest entry; this field is
  // populated only when `apply-self-improvement-issues.mjs --open-issues`
  // has run AND can be resolved from the open-issue list). Otherwise
  // a stable manifest id the founder can grep for.
  issueUrl?: string;
  issueTitle?: string;
  issueCategory?: string;
  manifestId?: string;
  // For `calendar-update`: the parsed (slotDate, statusTransition)
  // pair extracted from the diff justification. Render-only — the
  // canonical source is the calendar row itself.
  slotDate?: string;
  statusTransition?: string;
}

export interface Heartbeat {
  schema: string;
  agentName: string;
  agentDescription?: string;
  signalSource?: string | null;
  entryMode?: string | null;
  network?: string;
  vaultAddress?: string | null;
  vaultName?: string | null;
  runId: string;
  startedAt: string;
  finishedAt: string;
  status: "succeeded" | "succeeded_with_errors" | "failed" | string;
  usage?: {
    turns: number;
    toolCalls: number;
    errors: number;
    softFailures: number;
    writeActions: number;
  };
  thesis?: string | null;
  summary?: string;
  writeActions: WriteActionSummary[];
  errors?: string[];
}

export interface AgentMemoryState {
  vaultAddress?: string;
  vaultName?: string;
  thesis?: string;
  lastRunAt?: string;
  deployedAt?: string;
}

export interface RunLogEntry {
  timestamp: string;
  agent: string;
  network: string;
  vault?: string;
  turns: number;
  toolCalls: string[];
  writeActions?: Array<{
    tool: string;
    txHash?: string | null;
    justification?: string;
    skipped?: boolean;
  }>;
}

export interface EmployeeCard {
  id: string;
  title: string;
  role: string;
  team: string;
  state: AgentState;
  kind: AgentKind;
  promptFile: string;
  description: string;
  reportsTo?: string;
  // Optional vault binding for trading agents
  vault?: {
    address: string;
    name: string;
  } | null;
  heartbeat?: Heartbeat | null;
  memory?: AgentMemoryState | null;
  recentRuns?: RunLogEntry[];
}

export interface ContentCalendarRow {
  date: string;
  day: string;
  timeUtc: string;
  slotType: string;
  track: string;
  pillar: string;
  hookType: string;
  draftPath: string;
  status: "seeded" | "polished" | "scheduled" | "posted" | string;
  postedUrl?: string;
}

/** Stable list key — multiple slots can share the same calendar date. */
export function contentCalendarRowKey(row: ContentCalendarRow): string {
  return `${row.date}T${row.timeUtc}:${row.slotType}`;
}

export interface PartnerRow {
  partner: string;
  type: string;
  handle: string;
  status: string;
  coMarketing: string;
  funding: string;
  nextMilestone: string;
  nextMilestoneDate: string;
  filePath: string;
}

export interface BasketConcept {
  slug: string;
  theme: string;
  status: string;
  proposedDate: string;
  proposedBy: string;
  filePath: string;
  rationale: string;
  targetCuratorPersona: string[];
  assetCount: number;
}

export interface DeploymentRow {
  provider: string;
  project: string;
  resourceType: string;
  resourceName: string;
  environment: string;
  owner: "agent" | "user" | string;
  allowedActions: string;
  purpose: string;
  created: string;
  superseded: boolean;
  planned: boolean;
}

export interface BlogPostMetaLite {
  slug: string;
  title: string;
  date: string;
  tags: string[];
}

export interface OpsSnapshot {
  generatedAt: string;
  company: CompanyManifest;
  activeEmployees: EmployeeCard[];
  brainstormEmployees: EmployeeCard[];
  outOfScopeAgents: EmployeeCard[];
  contentCalendar: ContentCalendarRow[];
  partnerships: PartnerRow[];
  basketConcepts: BasketConcept[];
  deployments: DeploymentRow[];
  recentBlogPosts: BlogPostMetaLite[];
}
