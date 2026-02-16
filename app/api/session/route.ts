// app/api/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { createSession, getSession } from "@/lib/store";
import { validateReturnUrlOrThrow } from "@/lib/returnUrl";

/**
 * CORS
 * Demo partner sites live on demo-store(-staging).edge-lab.uk
 * and call demo.edge-lab.uk from the browser.
 */
const ALLOW_ORIGINS = new Set([
  "https://demo-store-staging.edge-lab.uk",
  "https://demo-store.edge-lab.uk",
]);

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") || "";

  // If origin is one of our demo stores, echo it back (best practice).
  // If origin is missing (server-to-server / some tools), allow it.
  const allowOrigin = ALLOW_ORIGINS.has(origin) ? origin : "";

  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "origin",
    // Debug helper so you can see what Origin the server received
    "x-edge-origin": origin,
  };

  if (allowOrigin) {
    headers["access-control-allow-origin"] = allowOrigin;
  }

  return headers;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

function resolveTenant(req: NextRequest) {
  const hdr = req.headers.get("x-edge-lab-tenant");
  if (hdr) return hdr;

  const host = req.headers.get("host") || "";
  return getSlugFromHost(host);
}

function reqBaseUrl(req: NextRequest) {
  const host = req.headers.get("host") || "";
  return `https://${host}`;
}

export async function GET(req: NextRequest) {
  const slug = resolveTenant(req);
  const cfg = loadClientConfig(slug);

  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing sessionId" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  const session = getSession(sessionId);
  if (!session || session.slug !== slug) {
    return NextResponse.json(
      { error: "Unknown sessionId" },
      { status: 404, headers: corsHeaders(req) }
    );
  }

  return NextResponse.json(
    {
      sessionId: session.sessionId ?? sessionId,
      amount: session.amount,
      currency: session.currency,
      orderRef: session.orderRef,
      returnUrl: session.returnUrl || "",
      tokenizationKey: cfg.tokenizationKey,
    },
    { headers: corsHeaders(req) }
  );
}

export async function POST(req: NextRequest) {
  const slug = resolveTenant(req);
  const cfg = loadClientConfig(slug);

  const body = await req.json().catch(() => ({}));

  const amount = Number(body.amount);
  const currency = String(body.currency || body.currency_code || cfg.currency);
  const orderRef = String(body.orderRef || body.reference || "");
  const customer = body.customer || {};
  const returnUrl = body.returnUrl ? String(body.returnUrl) : undefined;

  const max = Number(process.env.EDGE_LAB_MAX_AMOUNT || "50");

  if (!amount || amount <= 0) {
    return NextResponse.json(
      { error: "Invalid amount" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  if (amount > max) {
    return NextResponse.json(
      { error: `Amount exceeds lab limit (£${max}).` },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  if (!orderRef) {
    return NextResponse.json(
      { error: "Missing orderRef/reference" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  if (!customer.firstName || !customer.lastName || !customer.email || !customer.postalCode) {
    return NextResponse.json(
      { error: "Missing required customer fields" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  if (returnUrl) {
    try {
      validateReturnUrlOrThrow(returnUrl, cfg.allowedReturnUrlPrefixes);
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Invalid returnUrl" },
        { status: 400, headers: corsHeaders(req) }
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

  // Keep payUrl on the SAME host that created the session
  const payUrl = `${reqBaseUrl(req)}/pay/${sessionId}`;

  return NextResponse.json(
    { sessionId, payUrl },
    { headers: corsHeaders(req) }
  );
}