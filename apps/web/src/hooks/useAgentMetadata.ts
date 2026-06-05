import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

export type AgentActionParams =
  | { kind: "wire_asset"; symbol: string; seedPriceUsd?: number }
  | {
      kind: "create_vault";
      name: string;
      depositFeeBps: number;
      redeemFeeBps: number;
      deployToSpokes?: boolean;
    }
  | { kind: "set_vault_assets"; assetIds: string[]; count: number }
  | {
      kind: "allocate_to_perp" | "withdraw_from_perp";
      amountUsdc: string;
    }
  | {
      kind: "open_position";
      assetId: string;
      isLong: boolean;
      size: string;
      collateral: string;
    }
  | {
      kind: "close_position";
      assetId: string;
      isLong: boolean;
      sizeDelta: string;
      collateralDelta: string;
    };

export type AgentAction = {
  tool: string;
  justification: string;
  timestamp: string;
  txHash?: string | null;
  agentName?: string;
  runId?: string;
  params?: AgentActionParams;
  riskOfficer?: Record<string, unknown>;
};

export type AgentRun = {
  runId: string;
  finishedAt: string;
  summary: string;
  startedAt?: string | null;
  agentName?: string;
  model?: string | null;
  modelSource?: string | null;
  network?: string | null;
  dryRun?: boolean;
  confirmWrites?: boolean;
  turns?: number;
  toolCalls?: string[];
  actionCount?: number;
  onChainActionCount?: number;
  offChainActionCount?: number;
  reasoningSummaries?: string[];
  errors?: Record<string, unknown>[];
  softFailures?: Record<string, unknown>[];
  riskOfficerVerdicts?: Record<string, unknown>[];
  confirmationBatches?: Record<string, unknown>[];
};

export type AgentRunDetail = AgentRun;

export type AgentSignalSource = "atlas-ml" | "atlas-quality" | null;

export type AgentMetadata = {
  isAiManaged: boolean;
  agentName: string;
  agentDescription: string;
  signalSource?: AgentSignalSource;
  entryMode?: string | null;
  thesis: string | null;
  lastRunAt: string;
  latestRun?: AgentRun;
  recentRuns?: AgentRunDetail[];
  recentActions: AgentAction[];
};

// Walks `text` from the first `{` and returns the substring covering the
// first balanced top-level JSON object, respecting strings/escapes. Returns
// `null` if no balanced object can be located. Used to recover from agent
// metadata files that have a valid object followed by trailing garbage —
// see the 2026-05-22 vault-agent[bot] regression that appended a partial
// duplicate tail after the closing `}` and silently dropped the AI flag.
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function useAgentMetadata(vault: Address) {
  return useQuery<AgentMetadata | null>({
    queryKey: ["agent-metadata", vault],
    queryFn: async () => {
      const res = await fetch(`/agent-metadata/${vault.toLowerCase()}.json`);
      if (!res.ok) return null;
      const text = await res.text();
      if (!text || text === "null") return null;
      try {
        return JSON.parse(text) as AgentMetadata;
      } catch {
        const recovered = extractFirstJsonObject(text);
        if (!recovered) return null;
        try {
          return JSON.parse(recovered) as AgentMetadata;
        } catch {
          return null;
        }
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}
