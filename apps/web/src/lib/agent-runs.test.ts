import { describe, expect, it } from "vitest";
import { buildAgentRunGroups } from "./agent-runs";
import type { AgentAction, AgentRunDetail } from "@/hooks/useAgentMetadata";

const RUN_A: AgentRunDetail = {
  runId: "2026-06-01T10:00:00.000Z",
  startedAt: "2026-06-01T09:59:00.000Z",
  finishedAt: "2026-06-01T10:00:00.000Z",
  summary: "No changes required.",
  turns: 2,
  toolCalls: ["get_vault_state"],
  actionCount: 0,
  reasoningSummaries: ["No eligible action found."],
};

const RUN_B: AgentRunDetail = {
  runId: "2026-06-01T09:00:00.000Z",
  finishedAt: "2026-06-01T09:00:00.000Z",
  summary: "Opened one position.",
};

const ACTION_B: AgentAction = {
  tool: "open_position",
  justification: "Top pick.",
  timestamp: RUN_B.finishedAt,
  txHash: "0xabc",
  runId: RUN_B.runId,
};

describe("buildAgentRunGroups", () => {
  it("keeps recentRuns even when a run has no actions", () => {
    const groups = buildAgentRunGroups({
      recentRuns: [RUN_A, RUN_B],
      recentActions: [ACTION_B],
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].runId).toBe(RUN_A.runId);
    expect(groups[0].actions).toHaveLength(0);
    expect(groups[0].run?.reasoningSummaries).toEqual([
      "No eligible action found.",
    ]);
    expect(groups[1].runId).toBe(RUN_B.runId);
    expect(groups[1].actions).toEqual([ACTION_B]);
  });

  it("falls back to latestRun plus legacy recentActions when recentRuns is absent", () => {
    const groups = buildAgentRunGroups({
      latestRun: RUN_A,
      recentActions: [ACTION_B],
    });

    expect(groups.map((group) => group.runId)).toEqual([RUN_A.runId, RUN_B.runId]);
    expect(groups[0].actions).toHaveLength(0);
    expect(groups[1].actions).toEqual([ACTION_B]);
  });
});
