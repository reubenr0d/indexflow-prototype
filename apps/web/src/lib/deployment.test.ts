import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPLOYMENT_TARGET,
  chainIdForDeploymentTarget,
  isSubgraphEnabledForTarget,
  parseDeploymentTarget,
} from "./deployment";

describe("deployment target helpers", () => {
  it("defaults to sepolia", () => {
    expect(DEFAULT_DEPLOYMENT_TARGET).toBe("sepolia");
  });

  it("parses supported targets", () => {
    expect(parseDeploymentTarget("sepolia")).toBe("sepolia");
    expect(parseDeploymentTarget("anvil")).toBe("anvil");
    expect(parseDeploymentTarget("mainnet")).toBeNull();
  });

  it("returns expected chain ids", () => {
    expect(chainIdForDeploymentTarget("sepolia")).toBe(11155111);
    expect(chainIdForDeploymentTarget("anvil")).toBe(31337);
  });

  it("disables subgraph for anvil", () => {
    expect(isSubgraphEnabledForTarget("anvil", "https://example.com/subgraph")).toBe(false);
    expect(isSubgraphEnabledForTarget("sepolia", "https://example.com/subgraph")).toBe(true);
    expect(isSubgraphEnabledForTarget("sepolia", "   ")).toBe(false);
  });
});
