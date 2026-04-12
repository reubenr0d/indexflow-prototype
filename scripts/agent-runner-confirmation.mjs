export function parseToolCallArgs(rawArguments) {
  try {
    return JSON.parse(rawArguments ?? "{}");
  } catch {
    return {};
  }
}

export function getOriginalToolName(toolName) {
  return toolName.includes("/") ? toolName.split("/").slice(1).join("/") : toolName;
}

export function classifyToolCalls(toolCalls, writeTools) {
  const calls = (toolCalls || []).map((toolCall) => {
    const toolName = toolCall.function.name;
    const originalName = getOriginalToolName(toolName);
    const args = parseToolCallArgs(toolCall.function.arguments);
    const isWrite = writeTools.has(originalName);
    return { toolCall, toolName, originalName, args, isWrite };
  });

  return {
    calls,
    writeCalls: calls.filter((c) => c.isWrite),
    readCalls: calls.filter((c) => !c.isWrite),
    hasWriteCalls: calls.some((c) => c.isWrite),
  };
}

export function isInteractiveTty(stdin = process.stdin, stdout = process.stdout) {
  return Boolean(stdin?.isTTY && stdout?.isTTY);
}

export function shouldBypassWriteConfirmation({
  confirmWritesEnabled,
  dryRun,
  hasWriteCalls,
  interactiveTty,
}) {
  return (
    confirmWritesEnabled &&
    !dryRun &&
    hasWriteCalls &&
    !interactiveTty
  );
}
