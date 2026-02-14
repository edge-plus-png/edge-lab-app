import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { createSession, getSession } from "@/lib/store";
import { validateReturnUrlOrThrow } from "@/lib/returnUrl";

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  const cfg = loadClientConfig(slug);

  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const session = getSession(sessionId);

  if (!session || session.slug !== slug) {
    return NextResponse.json({ error: "Unknown sessionId" }, { status: 404 });
  }

  return NextResponse.json({
    sessionId: session.sessionId ?? sessionId,
    amount: session.amount,
    currency: session.currency,
    orderRef: session.orderRef,
    returnUrl: session.returnUrl || "",
    tokenizationKey: cfg.tokenizationKey,
  });
}

export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  const cfg = loadClientConfig(slug);

  const body = await req.json().catch(() => ({}));

  const amount = Number(body.amount);
  const currency = String(body.currency || cfg.currency);
  const orderRef = String(body.orderRef || "");
  const customer = body.customer || {};
  const returnUrl = body.returnUrl ? String(body.returnUrl) : undefined;

  const max = Number(process.env.EDGE_LAB_MAX_AMOUNT || "50");

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  if (amount > max) {
    return NextResponse.json(
      { error: `Amount exceeds lab limit (£${max}).` },
      { status: 400 }
    );
  }

  if (!orderRef) {
    return NextResponse.json({ error: "Missing orderRef" }, { status: 400 });
  }

  if (
    !customer.firstName ||
    !customer.lastName ||
    !customer.email ||
    !customer.postalCode
  ) {
    return NextResponse.json(
      { error: "Missing required customer fields" },
      { status: 400 }
    );
  }

  if (returnUrl) {
    try {
      validateReturnUrlOrThrow(returnUrl, cfg.allowedReturnUrlPrefixes);
    } catch (e: any) {
      return NextResponse.json(
        { error: e.message || "Invalid returnUrl" },
        { status: 400 }
      );
    }
  }

  const session = createSession({
    slug,
    amount,
    currency,
    orderRef,
    customer: {
      firstName: String(customer.firstName),
      lastName: String(customer.lastName),
      email: String(customer.email),
      postalCode: String(customer.postalCode),
    },
    returnUrl,
  });

  const sessionId = session.sessionId;
  const payUrl = `https://${host}/pay/${sessionId}`;

  return NextResponse.json({ sessionId, payUrl });
}