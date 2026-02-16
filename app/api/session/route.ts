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
 *
 * IMPORTANT:
 * - For real partners (e.g. anytime.edge-lab.uk) they should call server-to-server,
 *   so Origin is typically blank and CORS doesn't apply.
 */
const ALLOW_ORIGINS = new Set([
  "https://demo-store-staging.edge-lab.uk",
  "https://demo-store.edge-lab.uk",
]);

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOW_ORIGINS.has(origin) ? origin : "";

  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "origin",
    // Debug helper so you can see what Origin the server received
    "x-edge-origin": origin,
  };

  // Only set allow-origin when it's on the allowlist
  if (allowOrigin) headers["access-control-allow-origin"] = allowOrigin;

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

function base64urlEncode(obj: unknown) {
  // Node 18+ supports base64url; fallback included just in case.
  const json = JSON.stringify(obj);
  // @ts-ignore
  if (typeof Buffer !== "undefined") {
    try {
      return Buffer.from(json).toString("base64url");
    } catch {
      // fallback below
    }
    return Buffer.from(json)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  throw new Error("Buffer not available for base64 encoding");
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

  // Accept partner naming too (reference / currency_code)
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

  if (
    !customer.firstName ||
    !customer.lastName ||
    !customer.email ||
    !customer.postalCode
  ) {
    return NextResponse.json(
      { error: "Missing required customer fields" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  // Optional: only validate if provided (partners usually provide once during onboarding)
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

  // Create a server-side session (still useful for internal flow),
  // but we ALSO pass payload to /pay via ?p=... so the pay page
  // doesn't depend on in-memory session storage.
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

  // Payload for the hosted pay page (so it can render without a GET roundtrip)
  const payload = {
    sessionId,
    amount,
    currency,
    orderRef,
    returnUrl: returnUrl || "",
    tokenizationKey: cfg.tokenizationKey,
  };

  const p = base64urlEncode(payload);

  // Hosted payUrl lives on the same host that received /api/session
  const payUrl = `${reqBaseUrl(req)}/pay/${sessionId}?p=${encodeURIComponent(p)}`;

  return NextResponse.json(
    { sessionId, payUrl },
    { headers: corsHeaders(req) }
  );
}