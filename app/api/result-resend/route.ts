// app/api/result-resend/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getResultBySession, getSession } from "@/lib/store";
import { validateReturnUrlOrThrow } from "@/lib/returnUrl";
import { sendCallback } from "@/lib/callbackDelivery";
import { buildResultPayload } from "@/lib/resultPayload";

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
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }

  const payload = {
    ...buildResultPayload({
      client: slug,
      sessionId: result.sessionId,
      resultId: result.resultId,
      intent: result.intent,
      status: result.status,
      orderRef: result.orderRef,
      amount: result.amount,
      currency: result.currency,
      customer: result.customer || session.customer,
      gateway: {
        transaction_id: result.gateway?.transactionId,
        response_code: result.gateway?.responseCode,
        message: result.gateway?.message,
        auth_code: result.gateway?.authCode,
        avs: result.gateway?.avs,
        cvv: result.gateway?.cvv,
        eci: result.gateway?.eci,
        cavv: result.gateway?.cavv,
        xid: result.gateway?.xid,
        three_ds_version: result.gateway?.threeDsVersion,
        directory_server_id: result.gateway?.directoryServerId,
        cardholder_auth: result.gateway?.cardholderAuth,
      },
      verification: result.verification,
      createdAt: result.createdAt,
    }),
    mode: modeFromHost(host),
  };

  try {
    const r = await sendCallback({
      slug,
      source: "result-resend",
      sessionId,
      returnUrl,
      payload,
    });

    return NextResponse.json({ ok: r.ok, statusCode: r.status, responseBody: r.body });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}
