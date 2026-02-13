import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getSession, saveResult } from "@/lib/store";

function newId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  loadClientConfig(slug);

  const body = await req.json().catch(() => ({}));
  const { sessionId, paymentToken } = body;

  if (!sessionId || !paymentToken) {
    return NextResponse.json({ error: "Missing sessionId or paymentToken" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session || session.slug !== slug) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }

  // -----------------------------------------
  // TEMP: MOCK GATEWAY RESPONSE
  // Replace this block with real NMI request
  // -----------------------------------------

  const approved = session.amount < 30;

  const result = saveResult({
    resultId: newId(),
    sessionId,
    slug,
    status: approved ? "approved" : "declined",
    orderRef: session.orderRef,
    amount: session.amount,
    currency: session.currency,
    gateway: {
      transactionId: `mock_${sessionId.slice(-6)}`,
      message: approved ? "Approved (mock)" : "Declined (mock)",
      responseCode: approved ? "00" : "05",
    },
  });

  return NextResponse.json({
    status: result.status,
    resultId: result.resultId,
  });
}

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  loadClientConfig(slug);

  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  const session = getSession(sessionId);

  if (!session || session.slug !== slug) {
    return NextResponse.json({ error: "Unknown sessionId" }, { status: 404 });
  }

  return NextResponse.json(session);
}