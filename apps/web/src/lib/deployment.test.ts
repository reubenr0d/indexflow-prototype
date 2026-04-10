import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPLOYMENT_TARGET,
  chainIdForDeploymentTarget,
  getSubgraphUrlForTarget,
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

  it("returns local subgraph URL for anvil", () => {
    const url = getSubgraphUrlForTarget("anvil");
    expect(url).toBe("http://localhost:8000/subgraphs/name/indexflow-prototype");
  });

  it("returns env subgraph URL for sepolia when set", () => {
    const originalEnv = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
    process.env.NEXT_PUBLIC_SUBGRAPH_URL = "https://example.com/subgraph";
    expect(getSubgraphUrlForTarget("sepolia")).toBe("https://example.com/subgraph");
    process.env.NEXT_PUBLIC_SUBGRAPH_URL = originalEnv;
  });

  it("returns null for sepolia when env is empty", () => {
    const originalEnv = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
    process.env.NEXT_PUBLIC_SUBGRAPH_URL = "   ";
    expect(getSubgraphUrlForTarget("sepolia")).toBeNull();
    process.env.NEXT_PUBLIC_SUBGRAPH_URL = originalEnv;
  });
});
