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
};

export type AgentRun = {
  runId: string;
  finishedAt: string;
  summary: string;
};

export type AgentSignalSource = "atlas-ml" | null;

export type AgentMetadata = {
  isAiManaged: boolean;
  agentName: string;
  agentDescription: string;
  signalSource?: AgentSignalSource;
  entryMode?: string | null;
  thesis: string | null;
  lastRunAt: string;
  latestRun?: AgentRun;
  recentActions: AgentAction[];
};

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
        return null;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}
