import type { AgentAction, AgentRunDetail } from "@/hooks/useAgentMetadata";

export type AgentRunGroup = {
  runId: string;
  finishedAtIso: string | null;
  run: AgentRunDetail | null;
  actions: AgentAction[];
};

function actionRunId(action: AgentAction): string {
  return action.runId ?? action.timestamp ?? "__unknown__";
}

function runFinishedAt(run: AgentRunDetail): string | null {
  return run.finishedAt ?? run.startedAt ?? null;
}

function groupActions(actions: AgentAction[]): Map<string, AgentAction[]> {
  const groups = new Map<string, AgentAction[]>();
  for (const action of actions) {
    const id = actionRunId(action);
    const group = groups.get(id) ?? [];
    group.push(action);
    groups.set(id, group);
  }
  return groups;
}

export function buildAgentRunGroups({
  recentRuns = [],
  latestRun = null,
  recentActions = [],
}: {
  recentRuns?: AgentRunDetail[];
  latestRun?: AgentRunDetail | null;
  recentActions?: AgentAction[];
}): AgentRunGroup[] {
  const actionGroups = groupActions(recentActions);
  const out: AgentRunGroup[] = [];
  const seen = new Set<string>();

  const addRun = (run: AgentRunDetail) => {
    if (!run?.runId || seen.has(run.runId)) return;
    seen.add(run.runId);
    out.push({
      runId: run.runId,
      finishedAtIso: runFinishedAt(run),
      run,
      actions: actionGroups.get(run.runId) ?? [],
    });
  };

  for (const run of recentRuns) addRun(run);
  if (recentRuns.length === 0 && latestRun) addRun(latestRun);

  for (const [runId, actions] of actionGroups.entries()) {
    if (seen.has(runId)) continue;
    seen.add(runId);
    out.push({
      runId,
      finishedAtIso: actions[0]?.timestamp ?? null,
      run: null,
      actions,
    });
  }

  return out;
}
