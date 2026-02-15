// app/api/result-resend/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getResultBySession, getSession } from "@/lib/store";
import { validateReturnUrlOrThrow } from "@/lib/returnUrl";

function modeFromHost(host: string) {
  return host.toLowerCase().includes("staging.") ? "test" : "test";
}

export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  const cfg = loadClientConfig(slug);

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId || "");
  const returnUrl = String(body.returnUrl || "");

  if (!sessionId) return NextResponse.json({ ok: false, error: "Missing sessionId" }, { status: 400 });
  if (!returnUrl) return NextResponse.json({ ok: false, error: "Missing returnUrl" }, { status: 400 });

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
    event: "payment.completed",
    client: slug,
    mode: modeFromHost(host),
    status: result.status,

    session_id: result.sessionId,
    result_id: result.resultId,
    reference: result.orderRef,

    amount: result.amount,
    currency: result.currency,

    gateway: {
      transaction_id: result.gateway?.transactionId,
      response_code: result.gateway?.responseCode,
      message: result.gateway?.message,
      auth_code: result.gateway?.authCode,
      avs: result.gateway?.avs,
      cvv: result.gateway?.cvv,
      eci: result.gateway?.eci,
      cavv: result.gateway?.cavv,
      three_ds_version: result.gateway?.threeDsVersion,
    },

    created_at: new Date(result.createdAt).toISOString(),
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