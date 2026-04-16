// app/api/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { createSession, getSession } from "@/lib/store";
import { validateAllowlistedUrlOrThrow, validateReturnUrlOrThrow } from "@/lib/returnUrl";
import type { SessionIntent } from "@/lib/store";

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

  // Node runtime (Vercel) has Buffer
  return Buffer.from(json)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Invalid returnUrl";
}

function resolveIntent(value: unknown): SessionIntent {
  return value === "card_verification" ? "card_verification" : "payment";
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
      intent: session.intent,
      amount: session.amount,
      currency: session.currency,
      orderRef: session.orderRef,
      returnUrl: session.returnUrl || "",
      successUrl: session.successUrl || "",
      failUrl: session.failUrl || "",
      cancelUrl: session.cancelUrl || "",
      tokenizationKey: cfg.tokenizationKey,
      customer: session.customer || null,
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
  const intent = resolveIntent(body.intent);
  const customer = body.customer || {};
  const postalCode = String(customer.postalCode || customer.postcode || "");
  const requestedReturnUrl = body.returnUrl ? String(body.returnUrl) : "";
  const returnUrl = requestedReturnUrl || String(cfg.defaultReturnUrl || "");
  const successUrl = body.successUrl ? String(body.successUrl) : "";
  const failUrl = body.failUrl ? String(body.failUrl) : "";
  const cancelUrl = body.cancelUrl ? String(body.cancelUrl) : "";

  const max = Number(process.env.EDGE_LAB_MAX_AMOUNT || "50");

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400, headers: corsHeaders(req) });
  }

  if (amount > max) {
    return NextResponse.json({ error: `Amount exceeds lab limit (£${max}).` }, { status: 400, headers: corsHeaders(req) });
  }

  if (intent === "card_verification" && Number(amount.toFixed(2)) !== 1) {
    return NextResponse.json(
      { error: "Card verification sessions must use an amount of 1.00." },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  if (!orderRef) {
    return NextResponse.json({ error: "Missing orderRef/reference" }, { status: 400, headers: corsHeaders(req) });
  }

  if (!customer.firstName || !customer.lastName || !customer.email || !postalCode) {
    return NextResponse.json({ error: "Missing required customer fields" }, { status: 400, headers: corsHeaders(req) });
  }

  // Validate explicit or default return URL (if configured)
  if (returnUrl) {
    try {
      validateReturnUrlOrThrow(returnUrl, cfg.allowedReturnUrlPrefixes);
    } catch (error: unknown) {
      return NextResponse.json({ error: errorMessage(error) }, { status: 400, headers: corsHeaders(req) });
    }
  }

  for (const [label, value] of [
    ["successUrl", successUrl],
    ["failUrl", failUrl],
    ["cancelUrl", cancelUrl],
  ] as const) {
    if (!value) continue;
    try {
      validateAllowlistedUrlOrThrow(value, cfg.allowedReturnUrlPrefixes, label);
    } catch (error: unknown) {
      return NextResponse.json({ error: errorMessage(error) }, { status: 400, headers: corsHeaders(req) });
    }
  }

  // Store server-side session (may not be reliable across regions)
  const session = createSession({
    slug,
    intent,
    amount,
    currency,
    orderRef,
    customer: {
      firstName: String(customer.firstName),
      lastName: String(customer.lastName),
      email: String(customer.email),
      postalCode,
      address1: customer.address1 ? String(customer.address1) : undefined,
      city: customer.city ? String(customer.city) : undefined,
      country: customer.country ? String(customer.country) : undefined,
    },
    returnUrl: returnUrl || undefined,
    successUrl: successUrl || undefined,
    failUrl: failUrl || undefined,
    cancelUrl: cancelUrl || undefined,
  });

  const sessionId = session.sessionId;

  // ✅ Encode everything Pay page needs (no dependency on GET/session storage)
  const payload = {
    sessionId,
    intent,
    amount,
    currency,
    orderRef,
    returnUrl: returnUrl || "",
    successUrl,
    failUrl,
    cancelUrl,
    tokenizationKey: cfg.tokenizationKey,
    customer: {
      firstName: String(customer.firstName),
      lastName: String(customer.lastName),
      email: String(customer.email),
      postalCode,
      address1: customer.address1 ? String(customer.address1) : undefined,
      city: customer.city ? String(customer.city) : undefined,
      country: customer.country ? String(customer.country) : undefined,
    },
  };

  const p = base64urlEncode(payload);
  const payUrl = `${reqBaseUrl(req)}/pay/${sessionId}?p=${encodeURIComponent(p)}`;

  return NextResponse.json({ sessionId, payUrl }, { headers: corsHeaders(req) });
}
