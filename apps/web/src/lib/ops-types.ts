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

export interface BoardMember {
  role: string;
  name: string;
  titles: string[];
}

export interface StrategicPriority {
  id: string;
  name: string;
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
  board: BoardMember[];
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

export interface WriteActionSummary {
  tool: string;
  txHash: string | null;
  justification: string;
  riskOfficer?: RiskOfficerVerdict;
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
