// app/api/result/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getSession, getResultBySession } from "@/lib/store";

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);

  // ensure tenant is valid / env ok
  loadClientConfig(slug);

  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session || session.slug !== slug) {
    return NextResponse.json({ error: "Unknown sessionId" }, { status: 404 });
  }

  const result = getResultBySession(sessionId);

  return NextResponse.json({
    session: {
      sessionId: session.sessionId,
      orderRef: session.orderRef,
      amount: session.amount,
      currency: session.currency,
      returnUrl: session.returnUrl || "",
      customer: session.customer,
      createdAt: session.createdAt,
    },
    result: result
      ? {
          resultId: result.resultId,
          status: result.status,
          createdAt: result.createdAt,
          gateway: result.gateway || {},
          raw: result.raw ?? null,
        }
      : null,
  });
}