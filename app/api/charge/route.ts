// app/api/charge/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const sessionId = String(body.sessionId || "");
  const orderRef = String(body.orderRef || "");
  const currency = String(body.currency || "GBP");
  const amount = Number(body.amount);
  const paymentToken = String(body.paymentToken || "");

  if (!sessionId || !orderRef || !paymentToken || !amount || amount <= 0) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ✅ LAB RULES (same idea as your demo totals)
  // 10.00 approve, 10.01 decline, 0 error etc — customise as you like
  let status: "approved" | "declined" = "approved";
  if (Number(amount.toFixed(2)) === 10.01) status = "declined";

  // In production, this is where you'd call NMI with:
  // - paymentToken
  // - amount/currency
  // - 3DS fields (if you add NmiThreeDSecure)
  // and return the gateway response.

  return NextResponse.json({
    ok: true,
    status,
    currency,
    amount: Number(amount.toFixed(2)),
    orderRef,
    transactionId: `lab_${sessionId.slice(0, 8)}`,
  });
}