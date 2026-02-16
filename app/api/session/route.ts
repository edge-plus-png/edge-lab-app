import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { createSession, getSession } from "@/lib/store";
import { validateReturnUrlOrThrow } from "@/lib/returnUrl";

/**
 * CORS: only needed for browser calls from demo-store domains.
 * Real partners should call server-to-server (Origin typically blank).
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
    "x-edge-origin": origin,
  };

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
  const json = JSON.stringify(obj);
  // Node runtime -> Buffer exists
  const b64 = Buffer.from(json).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET(req: NextRequest) {
  const slug = resolveTenant(req);
  const cfg = loadClientConfig(slug);

  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400, headers: corsHeaders(req) });
  }

  const session = getSession(sessionId);
  if (!session || session.slug !== slug) {
    return NextResponse.json({ error: "Unknown sessionId" }, { status: 404, headers: corsHeaders(req) });
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

  const max = Number(process.env.EDGE_LAB_MAX_AMOUNT || "50");

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400, headers: corsHeaders(req) });
  }

  if (amount > max) {
    return NextResponse.json({ error: `Amount exceeds lab limit (£${max}).` }, { status: 400, headers: corsHeaders(req) });
  }

  if (!orderRef) {
    return NextResponse.json({ error: "Missing orderRef/reference" }, { status: 400, headers: corsHeaders(req) });
  }

  if (!customer.firstName || !customer.lastName || !customer.email || !customer.postalCode) {
    return NextResponse.json({ error: "Missing required customer fields" }, { status: 400, headers: corsHeaders(req) });
  }

  /**
   * ✅ Return URL logic:
   * 1) Partner can send it (optional)
   * 2) Otherwise, we use the onboarding default for that tenant
   */
  const requestedReturnUrl = body.returnUrl ? String(body.returnUrl) : "";
  const effectiveReturnUrl = requestedReturnUrl || cfg.defaultReturnUrl || "";

  // If we have a return URL, validate it (whether partner-supplied or default)
  if (effectiveReturnUrl) {
    try {
      validateReturnUrlOrThrow(effectiveReturnUrl, cfg.allowedReturnUrlPrefixes);
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
    returnUrl: effectiveReturnUrl || undefined,
  });

  const sessionId = session.sessionId;

  // Payload for /pay so the pay page works even without shared storage
  const payload = {
    sessionId,
    amount,
    currency,
    orderRef,
    returnUrl: effectiveReturnUrl || "",
    tokenizationKey: cfg.tokenizationKey,
  };

  const p = base64urlEncode(payload);
  const payUrl = `${reqBaseUrl(req)}/pay/${sessionId}?p=${encodeURIComponent(p)}`;

  return NextResponse.json({ sessionId, payUrl }, { headers: corsHeaders(req) });
}