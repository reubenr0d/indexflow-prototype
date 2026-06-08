import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_HUB_CHAIN_ID } from "@/lib/galxe/curator-quests";
import { evaluateGalxeCredential, parseGalxeCredentialRequest } from "@/lib/galxe/credentials";

function resolveEnvioUrl(): string | null {
  return (
    process.env.ENVIO_URL?.trim() ||
    process.env.NEXT_PUBLIC_ENVIO_URL?.trim() ||
    null
  );
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function verifyGalxeSecret(request: NextRequest): boolean {
  const configured = process.env.GALXE_CREDENTIAL_SECRET?.trim();
  if (!configured) return true;
  const provided =
    request.headers.get("x-galxe-secret") ??
    request.nextUrl.searchParams.get("secret") ??
    "";
  return provided === configured;
}

async function handleCredential(request: NextRequest): Promise<NextResponse> {
  if (!verifyGalxeSecret(request)) {
    return unauthorized();
  }

  const parsed = parseGalxeCredentialRequest(request.nextUrl.searchParams);
  if (!parsed) {
    return NextResponse.json({ error: "Missing or invalid cred_id/address" }, { status: 400 });
  }

  const envioUrl = resolveEnvioUrl();
  if (!envioUrl) {
    return NextResponse.json({ error: "Envio URL is not configured" }, { status: 503 });
  }

  const hubChainId = Number(process.env.CURATOR_HUB_CHAIN_ID ?? DEFAULT_HUB_CHAIN_ID);

  try {
    const eligible = await evaluateGalxeCredential(parsed.credId, parsed.address, {
      envioUrl,
      hubChainId,
    });
    return new NextResponse(String(eligible ? 1 : 0), {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Credential evaluation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return handleCredential(request);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const url = new URL(request.url);
    if (typeof body.credId === "string") url.searchParams.set("credId", body.credId);
    if (typeof body.cred_id === "string") url.searchParams.set("cred_id", body.cred_id);
    if (typeof body.address === "string") url.searchParams.set("address", body.address);
    return handleCredential(new NextRequest(url, { headers: request.headers }));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
