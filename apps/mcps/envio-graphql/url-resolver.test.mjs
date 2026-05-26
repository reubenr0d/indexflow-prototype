import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractEnvioUrlFromMemory,
  resolveEnvioUrl,
} from "./url-resolver.js";

// Fixture mirrors the actual `Envio HyperIndex deployment` row format
// (verbatim shape from AGENT_DEPLOYMENT_MEMORY.md on 2026-05-26 after the
// URL rotation from `822ce13` → `115a80f`).
const FIXTURE_ROW_PRIMARY = `| Envio | Envio Cloud org \`reubenr0d\` | HyperIndex deployment | \`indexflow-prototype-3\` (...) | production | agent | \`read\`, \`deploy\`, \`update-config\` | Single Hasura GraphQL endpoint serving every chain. Auto-deploys on push to \`main\`. **Current URL** \`https://indexer.dev.hyperindex.xyz/115a80f/v1/graphql\` (deployment slug \`115a80f\`, verified live 2026-05-26). Previous URLs (history): \`822ce13\` (rotated 2026-05-26), \`dbe3f66\` (rotated 2026-05-22), \`caee388\` (pre-rename). | 2026-05-26 |`;

test("extractEnvioUrlFromMemory pulls the Current URL out of the HyperIndex row", () => {
  const url = extractEnvioUrlFromMemory(`# memory\n\n${FIXTURE_ROW_PRIMARY}\n`);
  assert.equal(url, "https://indexer.dev.hyperindex.xyz/115a80f/v1/graphql");
});

test("extractEnvioUrlFromMemory does NOT pick up a Previous URL on the same row", () => {
  const fixtureWithPrev = `| Envio | x | HyperIndex deployment | y | production | agent | read | **Current URL** \`https://indexer.dev.hyperindex.xyz/115a80f/v1/graphql\` blah. Previous URL \`https://indexer.dev.hyperindex.xyz/822ce13/v1/graphql\` more | 2026-05-26 |`;
  const url = extractEnvioUrlFromMemory(fixtureWithPrev);
  assert.equal(url, "https://indexer.dev.hyperindex.xyz/115a80f/v1/graphql");
});

test("extractEnvioUrlFromMemory ignores rows missing the HyperIndex marker", () => {
  const subgraphRow =
    "| The Graph Studio | Studio account `867` | Subgraph (deprecated) | `indexflow-prototype` ... | production | user | `read` only | **Current URL** `https://api.studio.thegraph.com/query/foo/v1/graphql` ... | 2026-04-17 |";
  assert.equal(extractEnvioUrlFromMemory(subgraphRow), null);
});

test("extractEnvioUrlFromMemory ignores rows missing the Current URL marker", () => {
  const rowWithoutUrl =
    "| Envio | org | HyperIndex deployment | `indexflow-prototype-3` | production | agent | `read` | Pending re-deploy after URL rotation; the row will pick up the new endpoint shortly. | 2026-05-25 |";
  assert.equal(extractEnvioUrlFromMemory(rowWithoutUrl), null);
});

test("extractEnvioUrlFromMemory returns null on empty / non-string input", () => {
  assert.equal(extractEnvioUrlFromMemory(""), null);
  assert.equal(extractEnvioUrlFromMemory(null), null);
  assert.equal(extractEnvioUrlFromMemory(undefined), null);
});

test("resolveEnvioUrl prefers ENVIO_URL env var over the memory file", () => {
  const result = resolveEnvioUrl({
    env: { ENVIO_URL: "https://override.example/x/v1/graphql" },
    readMemoryFile: () => FIXTURE_ROW_PRIMARY,
  });
  assert.equal(result.url, "https://override.example/x/v1/graphql");
  assert.equal(result.source, "env:ENVIO_URL");
});

test("resolveEnvioUrl falls back to the memory file when ENVIO_URL is empty / missing", () => {
  const result = resolveEnvioUrl({
    env: {},
    readMemoryFile: () => FIXTURE_ROW_PRIMARY,
  });
  assert.equal(result.url, "https://indexer.dev.hyperindex.xyz/115a80f/v1/graphql");
  assert.equal(result.source, "AGENT_DEPLOYMENT_MEMORY.md");
});

test("resolveEnvioUrl returns null when neither source resolves", () => {
  const result = resolveEnvioUrl({
    env: {},
    readMemoryFile: () => "",
  });
  assert.equal(result.url, null);
  assert.equal(result.source, "unresolved");
});

test("resolveEnvioUrl swallows readMemoryFile errors (file missing)", () => {
  const result = resolveEnvioUrl({
    env: {},
    readMemoryFile: () => {
      throw new Error("ENOENT");
    },
  });
  assert.equal(result.url, null);
});
