import { test } from "node:test";
import { strict as assert } from "node:assert";

import { __agentRunnerInternals } from "./agent-runner.mjs";

test("isWriteAllowedOnNetwork allows writes on hub network", () => {
  assert.equal(
    __agentRunnerInternals.isWriteAllowedOnNetwork("sepolia", "sepolia"),
    true,
  );
});

test("isWriteAllowedOnNetwork blocks writes on spoke network", () => {
  assert.equal(
    __agentRunnerInternals.isWriteAllowedOnNetwork("mantle-sepolia", "sepolia"),
    false,
  );
});

