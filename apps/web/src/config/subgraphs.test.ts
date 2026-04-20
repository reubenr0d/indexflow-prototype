import { describe, expect, it } from "vitest";
import {
  SUBGRAPH_URL_BY_TARGET,
  getConfiguredSubgraphUrlForTarget,
} from "./subgraphs";

describe("subgraph config helpers", () => {
  it("exposes configured URLs for known targets", () => {
    expect(getConfiguredSubgraphUrlForTarget("sepolia")).toBe(
      SUBGRAPH_URL_BY_TARGET.sepolia
    );
  });

  it("returns null for blank configured URLs", () => {
    expect(SUBGRAPH_URL_BY_TARGET.fuji).toBe("");
    expect(getConfiguredSubgraphUrlForTarget("fuji")).toBeNull();
  });

  it("returns null for missing targets", () => {
    expect(getConfiguredSubgraphUrlForTarget("arbitrum-sepolia")).toBeNull();
  });
});
