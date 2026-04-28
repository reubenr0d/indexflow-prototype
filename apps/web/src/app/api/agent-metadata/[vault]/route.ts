import { NextResponse } from "next/server";
import { KvClient } from "@0gfoundation/0g-ts-sdk";

export const runtime = "nodejs";
export const revalidate = 60;

// In dev / preview, default to the agentio public hackathon node so local
// runs "just work" without env config. In production we require ZG_KV_CLIENT_URL
// and ZG_STREAM_ID to be set explicitly on the Vercel project so a missing
// env surfaces as a clear 500 here (instead of a silent fallback that
// nobody notices when the agentio courtesy node disappears).
const DEFAULT_KV_URL = "http://178.238.236.119:6789";
const DEFAULT_STREAM_ID =
  "0x000000000000000000000000000000000000000000000000000000000000f2bd";

const IS_PROD = process.env.NODE_ENV === "production";
const ZG_KV_CLIENT_URL =
  process.env.ZG_KV_CLIENT_URL ?? (IS_PROD ? "" : DEFAULT_KV_URL);
const ZG_STREAM_ID =
  process.env.ZG_STREAM_ID ?? (IS_PROD ? "" : DEFAULT_STREAM_ID);

let _kv: KvClient | null = null;
function getKvClient(): KvClient {
  if (!_kv) _kv = new KvClient(ZG_KV_CLIENT_URL);
  return _kv;
}

function vaultMetadataKey(vault: string): string {
  return Buffer.from(`vault:${vault.toLowerCase()}:metadata`, "utf-8").toString("base64");
}

// The 0G KV node returns `{ data: <base64>, size, version }` (or null).
// Decode the base64 payload to a UTF-8 string.
//
// The agentio public KV node returns `{ version: 0, data: "", size: 0 }`
// for missing keys *and* for keys whose write tx landed on chain but
// hasn't replicated to the KV node yet. Treat both as "not present"
// (size 0 → null) — we never publish empty metadata blobs.
function decodeKvValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "data" in value) {
    const obj = value as { data?: unknown; size?: unknown };
    if (typeof obj.size === "number" && obj.size === 0) return null;
    const data = obj.data;
    if (typeof data !== "string" || data === "") return null;
    try {
      return Buffer.from(data, "base64").toString("utf-8");
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ vault: string }> }
) {
  if (!ZG_KV_CLIENT_URL || !ZG_STREAM_ID) {
    return NextResponse.json(
      {
        error: "0G KV not configured",
        hint: "Set ZG_KV_CLIENT_URL and ZG_STREAM_ID on this Vercel project (Production scope at minimum). See docs/AGENTS_FRAMEWORK.md.",
        missing: {
          ZG_KV_CLIENT_URL: !ZG_KV_CLIENT_URL,
          ZG_STREAM_ID: !ZG_STREAM_ID,
        },
      },
      { status: 500 }
    );
  }

  const { vault } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(vault)) {
    return NextResponse.json({ error: "invalid vault address" }, { status: 400 });
  }

  try {
    const kv = getKvClient();
    // KvClient typings expect ArrayLike<number> but the underlying RPC
    // layer accepts a base64 string (which is what the MCP also sends).
    const value = await kv.getValue(
      ZG_STREAM_ID,
      vaultMetadataKey(vault) as unknown as Uint8Array
    );
    const text = decodeKvValue(value);

    if (!text) {
      return new NextResponse("null", {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "s-maxage=15",
        },
      });
    }

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      {
        error: "failed to read agent metadata from 0G KV",
        message,
        kv_url: ZG_KV_CLIENT_URL,
        hint: "Run `node scripts/probe-0g-kv.mjs` to verify the KV node is reachable; swap ZG_KV_CLIENT_URL to a working node if not.",
      },
      { status: 502 }
    );
  }
}
