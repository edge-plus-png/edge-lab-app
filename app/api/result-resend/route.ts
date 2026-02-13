import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { validateReturnUrlOrThrow } from "@/lib/returnUrl";

export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  const cfg = loadClientConfig(slug);

  const body = await req.json().catch(() => ({}));
  const returnUrl = String(body.returnUrl || "");
  const sampleResult = body.sampleResult || null;

  if (!returnUrl) {
    return NextResponse.json({ ok: false, error: "Missing returnUrl" }, { status: 400 });
  }

  try {
    validateReturnUrlOrThrow(returnUrl, cfg.allowedReturnUrlPrefixes);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message || "Invalid returnUrl" },
      { status: 400 }
    );
  }

  // Default sample payload if none provided
  const payload =
    sampleResult && typeof sampleResult === "object"
      ? sampleResult
      : {
          type: "edge_lab_result_test",
          client: slug,
          status: "approved",
          resultId: "test-123",
          orderRef: "ORDER-TEST",
          amount: 10.0,
          currency: cfg.currency,
        };

  try {
    const r = await fetch(returnUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    return NextResponse.json({ ok: r.ok, status: r.status });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message || "Failed to POST to returnUrl" },
      { status: 500 }
    );
  }
}