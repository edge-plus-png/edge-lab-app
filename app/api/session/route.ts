import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { createSession, getSession } from "@/lib/store";
import { validateReturnUrlOrThrow } from "@/lib/returnUrl";

/**
 * Extract API key from request headers.
 * Accepts:
 *  - Authorization: Bearer <key>
 *  - x-api-key: <key>
 */
function getApiKeyFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  const xKey = req.headers.get("x-api-key") || "";
  if (xKey) return xKey.trim();

  return "";
}

/**
 * Allow localhost anonymous usage in dev only.
 */
function isLocalDev(host: string) {
  return (
    process.env.NODE_ENV !== "production" &&
    (host.includes("localhost") || host.includes("127.0.0.1"))
  );
}

/**
 * GET /api/session?sessionId=xxx
 * Used by hosted pay page to retrieve session details.
 */
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
    sessionId: session.sessionId,
    amount: session.amount,
    currency: session.currency,
    orderRef: session.orderRef,
    returnUrl: session.returnUrl || "",
    tokenizationKey: cfg.tokenizationKey,
  });
}

/**
 * POST /api/session
 * Partner creates a hosted payment session.
 */
export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  const cfg = loadClientConfig(slug);

  const providedKey = getApiKeyFromRequest(req);

  // Production: always require API key
  if (process.env.NODE_ENV === "production") {
    if (!providedKey || providedKey !== cfg.apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // Dev mode:
    // Allow localhost without key (for demo UI)
    if (!providedKey && !isLocalDev(host)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // If key provided, validate it
    if (providedKey && providedKey !== cfg.apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
      country: customer.country
        ? String(customer.country).toUpperCase()
        : undefined,
    },
    returnUrl,
  });

  const payUrl = `https://${host}/pay/${session.sessionId}`;

  return NextResponse.json({
    sessionId: session.sessionId,
    payUrl,
  });
}