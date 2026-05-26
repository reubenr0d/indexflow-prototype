#!/usr/bin/env node

// MCP server over the IndexFlow Envio HyperIndex Hasura GraphQL endpoint.
// Read-only by design: mutations are syntactically refused at the tool
// boundary, not just by Hasura's RBAC. Endpoint URL resolved at runtime
// from `AGENT_DEPLOYMENT_MEMORY.md` (per `agents/skills/envio-graphql.md`)
// with `ENVIO_URL` env var as fallback.
//
// Tools exposed:
//   - query_graphql({ query, variables?, operationName? })
//       Raw pass-through. Validates `mutation` and `subscription` are
//       NOT present, caps body size, and 60s-caches identical (query +
//       variables) signatures per the skill's rate-limit rule.
//   - recent_basket_created({ chainId?, limit?, sinceTimestamp? })
//       Convenience wrapper for `BasketFactory_BasketCreated` —
//       broadcast-bot's input and basket-ideator's dedupe pass.
//       Returns the canonical shape (vault, name, curator, assetCount,
//       blockTimestamp, txHash, chainId) so callers don't have to
//       re-author the query string.
//   - count_baskets_by_theme({ themeSlug, similarityFloor? })
//       Token-overlap dedupe for basket-ideator — counts existing
//       baskets whose name shares ≥ N tokens with the candidate theme
//       slug. Pulls the full inventory once per tick (cached 60s) so a
//       Monday weekly sweep doesn't hammer the indexer.
//   - discover_schema()
//       Hasura introspection (cached for the lifetime of the server
//       process). The skill says "do NOT spam introspection across
//       turns" so we keep the result resident.
//
// Smoke mode: `node index.js --smoke` makes a single live
// `recent_basket_created` call and exits 0/1. Use to verify the
// endpoint + URL resolver before scheduling the agent.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveEnvioUrl } from "./url-resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(
  process.env.PROJECT_ROOT || resolve(__dirname, "..", "..", ".."),
);
const MEMORY_PATH = resolve(PROJECT_ROOT, "AGENT_DEPLOYMENT_MEMORY.md");

const CACHE_TTL_MS = 60_000;
const MAX_QUERY_CHARS = 8_000;
const MAX_RESPONSE_CHARS = 64 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BASKET_LIMIT = 100;

// ---------------------------------------------------------------------------
// Response helpers (mirror yfinance + repo-editor style for tool consistency)
// ---------------------------------------------------------------------------

function toolText(payload) {
  const text = JSON.stringify(payload, null, 2);
  // Hard cap on response size — Hasura can return many MB on unbounded
  // queries; the LLM context window can't take that and the agent
  // runner truncates anyway. Surface the truncation explicitly so the
  // caller knows to narrow its query.
  if (text.length > MAX_RESPONSE_CHARS) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error_code: "RESPONSE_TOO_LARGE",
              message: `Response is ${text.length} chars; cap is ${MAX_RESPONSE_CHARS}. Narrow your query (add a limit, restrict to one chainId, or drop fields).`,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
  return { content: [{ type: "text", text }] };
}

function toolError(error_code, message, extra = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { success: false, error_code, message, ...extra },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// URL resolution (one-shot at startup; rotation needs a process restart)
// ---------------------------------------------------------------------------

function readMemoryFile() {
  return readFileSync(MEMORY_PATH, "utf8");
}

let resolved;
function getEndpoint() {
  if (!resolved) {
    resolved = resolveEnvioUrl({ readMemoryFile });
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// GraphQL fetch + 60s cache + read-only validation
// ---------------------------------------------------------------------------

const cache = new Map(); // signature -> { value, ts }

function cacheKey(query, variables) {
  return `${query}::${JSON.stringify(variables || {})}`;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value) {
  cache.set(key, { value, ts: Date.now() });
}

// Belt-and-braces read-only enforcement. The Hasura role for the
// public dev-tier indexer is read-only too, but failing closed at the
// tool boundary keeps the audit story clean: if a `mutation` ever
// shows up in `run-log.<network>.jsonl`, it's an agent bug, not a
// successful write.
function assertReadOnly(query) {
  const normalised = String(query || "")
    .replace(/#[^\n]*/g, " ") // strip GraphQL line comments
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalised) {
    throw new Error("query is empty");
  }
  if (/(^|\s|\{)mutation\b/.test(normalised)) {
    throw new Error("mutations are refused — this MCP is read-only");
  }
  if (/(^|\s|\{)subscription\b/.test(normalised)) {
    throw new Error("subscriptions are refused — this MCP is read-only");
  }
}

async function callGraphql({ query, variables, operationName }) {
  const ep = getEndpoint();
  if (!ep.url) {
    throw new Error(
      "Envio URL unresolved — set ENVIO_URL or add the HyperIndex deployment row to AGENT_DEPLOYMENT_MEMORY.md",
    );
  }
  if (typeof query !== "string" || query.length === 0) {
    throw new Error("query must be a non-empty string");
  }
  if (query.length > MAX_QUERY_CHARS) {
    throw new Error(
      `query is ${query.length} chars; cap is ${MAX_QUERY_CHARS}`,
    );
  }
  assertReadOnly(query);

  const key = cacheKey(query, variables);
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true, endpoint: ep.url, source: ep.source };

  const body = JSON.stringify({ query, variables, operationName });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(ep.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }

  const status = resp.status;
  const text = await resp.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `non-JSON response from ${ep.url} (HTTP ${status}): ${text.slice(0, 200)}`,
    );
  }

  // Hasura returns 200 even on GraphQL errors; surface them so the
  // caller doesn't silently treat an error envelope as data.
  if (parsed.errors && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(
      `GraphQL error: ${first.message || JSON.stringify(first)}`,
    );
  }
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status} from ${ep.url}: ${text.slice(0, 200)}`);
  }

  const value = { data: parsed.data ?? null };
  writeCache(key, value);
  return { ...value, cached: false, endpoint: ep.url, source: ep.source };
}

// ---------------------------------------------------------------------------
// MCP server + tools
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "envio-graphql",
  version: "1.0.0",
});

server.registerTool(
  "query_graphql",
  {
    title: "Execute a read-only GraphQL query against Envio HyperIndex",
    description: `Pass-through to the IndexFlow Envio HyperIndex Hasura endpoint. READ-ONLY: any "mutation" or "subscription" operation is refused at the tool boundary. Identical (query + variables) signatures are cached for 60s. Use this for ad-hoc shapes; prefer "recent_basket_created" and "count_baskets_by_theme" for the common cases. Endpoint URL is resolved at runtime from AGENT_DEPLOYMENT_MEMORY.md (fall-back: env ENVIO_URL).`,
    inputSchema: {
      query: z.string().describe(`GraphQL query string (<= ${MAX_QUERY_CHARS} chars). Must NOT contain a "mutation" or "subscription" operation.`),
      variables: z
        .record(z.any())
        .optional()
        .describe("Optional GraphQL variables object (JSON-serialisable)."),
      operationName: z
        .string()
        .optional()
        .describe("Optional operation name (only useful for multi-op documents)."),
    },
  },
  async ({ query, variables, operationName }) => {
    try {
      const result = await callGraphql({ query, variables, operationName });
      return toolText({ success: true, ...result });
    } catch (err) {
      return toolError("QUERY_FAILED", err.message);
    }
  },
);

server.registerTool(
  "recent_basket_created",
  {
    title: "Recent Basket rows (broadcast-bot input, ideator dedupe)",
    description:
      "Convenience wrapper for the canonical Basket query (verified against the live schema 2026-05-26). Returns the most recent baskets with the fields broadcast-bot and basket-ideator both need (id, name, creator, assetCount, createdAt, vault, chainId). Defaults to last 20 across both chains; pass chainId=11155111 (Sepolia hub) or chainId=43113 (Fuji spoke) to narrow. createdAt is a stringified Unix-seconds value (Hasura numeric).",
    inputSchema: {
      limit: z
        .number()
        .int()
        .positive()
        .max(MAX_BASKET_LIMIT)
        .optional()
        .describe(`Max baskets to return (1..${MAX_BASKET_LIMIT}, default 20).`),
      chainId: z
        .number()
        .int()
        .optional()
        .describe("Optional chainId filter (11155111 = Sepolia, 43113 = Fuji)."),
      sinceTimestamp: z
        .number()
        .int()
        .optional()
        .describe("Optional Unix-seconds floor on createdAt."),
    },
  },
  async ({ limit, chainId, sinceTimestamp }) => {
    const where = [];
    const variables = {};
    if (typeof chainId === "number") {
      where.push("chainId: { _eq: $chainId }");
      variables.chainId = chainId;
    }
    if (typeof sinceTimestamp === "number") {
      where.push("createdAt: { _gte: $sinceTimestamp }");
      variables.sinceTimestamp = sinceTimestamp;
    }
    const whereClause = where.length ? `where: { ${where.join(", ")} }, ` : "";
    variables.first = Math.min(MAX_BASKET_LIMIT, Math.max(1, limit || 20));
    const argDecls = [
      "$first: Int!",
      typeof chainId === "number" ? "$chainId: Int!" : null,
      typeof sinceTimestamp === "number" ? "$sinceTimestamp: numeric!" : null,
    ]
      .filter(Boolean)
      .join(", ");
    const query = `
      query RecentBaskets(${argDecls}) {
        Basket(
          ${whereClause}order_by: { createdAt: desc }
          limit: $first
        ) {
          id
          name
          creator
          chainId
          createdAt
          assetCount
          vault
        }
      }
    `;
    try {
      const result = await callGraphql({ query, variables });
      const rows = result.data?.Basket ?? [];
      return toolText({
        success: true,
        endpoint: result.endpoint,
        source: result.source,
        cached: result.cached,
        chainId: chainId ?? null,
        count: rows.length,
        baskets: rows,
      });
    } catch (err) {
      return toolError("RECENT_BASKETS_FAILED", err.message);
    }
  },
);

server.registerTool(
  "count_baskets_by_theme",
  {
    title: "Dedupe check: count existing baskets whose name overlaps with a theme",
    description:
      "For basket-ideator: given a candidate theme slug (e.g. 'ai-infrastructure'), count and list existing baskets whose name shares >= similarityFloor tokens with the slug. Pulls the full BasketCreated inventory once (cached 60s) and applies the token-overlap check client-side. similarityFloor defaults to 2 (matches the skill file's '>= 2 shared tokens -> likely duplicate' heuristic).",
    inputSchema: {
      themeSlug: z
        .string()
        .min(1)
        .describe(`Slug to dedupe against (e.g. "ai-infrastructure"). Hyphens and slashes split into tokens.`),
      similarityFloor: z
        .number()
        .int()
        .positive()
        .max(8)
        .optional()
        .describe("Minimum number of shared tokens to count as a match (1..8, default 2)."),
    },
  },
  async ({ themeSlug, similarityFloor }) => {
    const floor = similarityFloor || 2;
    const slugTokens = tokenise(themeSlug);
    if (slugTokens.size === 0) {
      return toolError(
        "EMPTY_SLUG",
        `themeSlug "${themeSlug}" produced no tokens after normalisation`,
      );
    }
    try {
      const result = await callGraphql({
        query: `
          query AllBasketsForDedupe {
            Basket(order_by: { createdAt: asc }) {
              id
              vault
              name
              chainId
              createdAt
            }
          }
        `,
      });
      const rows = result.data?.Basket ?? [];
      const matches = [];
      for (const r of rows) {
        const tokens = tokenise(r.name);
        let shared = 0;
        for (const t of tokens) {
          if (slugTokens.has(t)) shared += 1;
        }
        if (shared >= floor) {
          matches.push({ ...r, sharedTokens: shared });
        }
      }
      return toolText({
        success: true,
        themeSlug,
        floor,
        endpoint: result.endpoint,
        source: result.source,
        cached: result.cached,
        totalBaskets: rows.length,
        matchCount: matches.length,
        matches,
      });
    } catch (err) {
      return toolError("DEDUPE_FAILED", err.message);
    }
  },
);

server.registerTool(
  "discover_schema",
  {
    title: "Hasura introspection (cached for the server lifetime)",
    description:
      "Returns the Hasura __schema query result so callers can confirm a field name before authoring a query_graphql call. Cached for the lifetime of the MCP server process (not just 60s) per the skill's 'do NOT spam introspection across turns' rule. Useful when a tool call fails with `field not found`.",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await callGraphql({
        query: `
          query DiscoverSchema {
            __schema {
              queryType { name }
              types { name kind }
            }
          }
        `,
      });
      return toolText({
        success: true,
        endpoint: result.endpoint,
        source: result.source,
        cached: result.cached,
        types:
          (result.data?.__schema?.types ?? [])
            .filter((t) => t.name && !t.name.startsWith("__"))
            .map((t) => `${t.kind}:${t.name}`),
      });
    } catch (err) {
      return toolError("INTROSPECTION_FAILED", err.message);
    }
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenise(input) {
  return new Set(
    String(input || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

// ---------------------------------------------------------------------------
// Entry point: stdio transport OR `--smoke` mode
// ---------------------------------------------------------------------------

async function smoke() {
  const ep = getEndpoint();
  process.stderr.write(`[envio-graphql] endpoint=${ep.url || "(unresolved)"} source=${ep.source}\n`);
  if (!ep.url) {
    process.stderr.write(
      "[envio-graphql] FAIL: no URL — set ENVIO_URL or add the HyperIndex row to AGENT_DEPLOYMENT_MEMORY.md\n",
    );
    process.exit(1);
  }
  try {
    const result = await callGraphql({
      query: `
        query SmokeRecentBaskets {
          Basket(order_by: { createdAt: desc }, limit: 1) {
            id
            name
            chainId
            createdAt
          }
        }
      `,
    });
    const rows = result.data?.Basket ?? [];
    process.stderr.write(
      `[envio-graphql] OK — endpoint reachable, ${rows.length} basket returned\n`,
    );
    process.stdout.write(JSON.stringify({ ok: true, sample: rows[0] || null, endpoint: ep.url }, null, 2) + "\n");
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[envio-graphql] FAIL: ${err.message}\n`);
    process.exit(1);
  }
}

if (process.argv.includes("--smoke")) {
  smoke();
} else {
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    process.stderr.write(`[envio-graphql] transport failed: ${err.message}\n`);
    process.exit(1);
  });
}
