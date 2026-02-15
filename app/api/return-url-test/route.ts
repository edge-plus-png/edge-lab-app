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

  if (!returnUrl) {
    return NextResponse.json({ ok: false, error: "Missing returnUrl" }, { status: 400 });
  }

  try {
    validateReturnUrlOrThrow(returnUrl, cfg.allowedReturnUrlPrefixes);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Invalid returnUrl" }, { status: 400 });
  }

  try {
    const r = await fetch(returnUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "edge_lab_test",
        client: slug,
        ts: new Date().toISOString(),
      }),
    });

    return NextResponse.json({ ok: r.ok, statusCode: r.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Failed to POST to returnUrl" }, { status: 500 });
  }
}