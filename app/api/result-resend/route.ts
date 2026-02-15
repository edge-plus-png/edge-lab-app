import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getResultBySession, getSession } from "@/lib/store";
import { validateReturnUrlOrThrow } from "@/lib/returnUrl";

export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  const cfg = loadClientConfig(slug);

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId || "");
  const returnUrl = String(body.returnUrl || "");

  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing sessionId" }, { status: 400 });
  }
  if (!returnUrl) {
    return NextResponse.json({ ok: false, error: "Missing returnUrl" }, { status: 400 });
  }

  // Ensure session belongs to tenant (basic safety)
  const session = getSession(sessionId);
  if (!session || session.slug !== slug) {
    return NextResponse.json({ ok: false, error: "Unknown sessionId" }, { status: 404 });
  }

  const result = getResultBySession(sessionId);
  if (!result || result.slug !== slug) {
    return NextResponse.json({ ok: false, error: "No result for sessionId" }, { status: 404 });
  }

  try {
    validateReturnUrlOrThrow(returnUrl, cfg.allowedReturnUrlPrefixes);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Invalid returnUrl" }, { status: 400 });
  }

  const payload = {
    type: "edge_lab_result",
    client: slug,

    status: result.status,
    resultId: result.resultId,
    sessionId: result.sessionId,

    orderRef: result.orderRef,
    amount: result.amount,
    currency: result.currency,

    gateway: result.gateway || {},
    ts: new Date().toISOString(),
  };

  try {
    const r = await fetch(returnUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    return NextResponse.json({ ok: r.ok, statusCode: r.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Failed to POST to returnUrl" }, { status: 500 });
  }
}