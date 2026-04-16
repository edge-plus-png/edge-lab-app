// app/api/return-url-test/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { validateReturnUrlOrThrow } from "@/lib/returnUrl";
import { sendCallback } from "@/lib/callbackDelivery";

function modeFromHost(host: string) {
  return host.toLowerCase().includes("staging.") ? "test" : "test";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to POST to returnUrl";
}

export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  const cfg = loadClientConfig(slug);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const returnUrl = String(body.returnUrl || "");
  const sampleResult =
    typeof body.sampleResult === "object" && body.sampleResult !== null
      ? (body.sampleResult as Record<string, unknown>)
      : null;
  const sessionId = sampleResult?.sessionId ? String(sampleResult.sessionId) : undefined;

  if (!returnUrl) {
    return NextResponse.json({ ok: false, error: "Missing returnUrl" }, { status: 400 });
  }

  try {
    validateReturnUrlOrThrow(returnUrl, cfg.allowedReturnUrlPrefixes);
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }

  const payload = {
    event: "edge_lab.ping",
    client: slug,
    mode: modeFromHost(host),
    created_at: new Date().toISOString(),
  };

  try {
    const r = await sendCallback({
      slug,
      source: "return-url-test",
      sessionId,
      returnUrl,
      payload,
    });

    return NextResponse.json({ ok: r.ok, statusCode: r.status, responseBody: r.body });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}
