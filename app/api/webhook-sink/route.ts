// app/api/webhook-sink/route.ts
import { NextRequest, NextResponse } from "next/server";
import { addSinkItem, clearSinkItems, listSinkItems } from "@/lib/webhookSink";

function requireToken(req: NextRequest, allowHeaderToken = false) {
  const queryToken = req.nextUrl.searchParams.get("token") || "";
  const headerToken = req.headers.get("x-edge-lab-sink-token") || "";
  const required = process.env.EDGE_LAB_SINK_TOKEN || "";
  if (!required) return { ok: false, error: "Server misconfigured: EDGE_LAB_SINK_TOKEN missing" as const };
  const viaQuery = queryToken && queryToken === required;
  const viaHeader = allowHeaderToken && headerToken && headerToken === required;
  if (!viaQuery && !viaHeader) return { ok: false, error: "Unauthorized" as const };
  return { ok: true as const };
}

function newId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function POST(req: NextRequest) {
  const auth = requireToken(req, true);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = { _raw: "Non-JSON body" };
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  addSinkItem({
    id: newId(),
    receivedAt: Date.now(),
    headers,
    body,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const auth = requireToken(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  return NextResponse.json({ ok: true, items: listSinkItems() });
}

export async function DELETE(req: NextRequest) {
  const auth = requireToken(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  clearSinkItems();
  return NextResponse.json({ ok: true });
}
