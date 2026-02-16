// app/api/charge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getSession } from "@/lib/store";

/**
 * CORS (optional but useful if you ever call /api/charge from demo-store domains)
 */
const ALLOW_ORIGINS = new Set([
  "https://demo-store-staging.edge-lab.uk",
  "https://demo-store.edge-lab.uk",
]);

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOW_ORIGINS.has(origin) ? origin : "";

  const headers: Record<string, string> = {
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "origin",
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

/**
 * NMI returns: key=value&key=value...
 */
function parseNmiResponse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

/**
 * Basic “success” helpers:
 * response=1 = approved
 * response=2 = declined
 * response=3 = error
 */
function normalizeStatus(resp: Record<string, string>) {
  const code = resp.response; // "1" | "2" | "3"
  if (code === "1") return "approved";
  if (code === "2") return "declined";
  return "error";
}

/**
 * Webhook POST (best effort)
 */
async function postReturnUrl(returnUrl: string, payload: any) {
  try {
    await fetch(returnUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore (lab/demo shouldn't die because partner webhook is down)
  }
}

export async function POST(req: NextRequest) {
  const tenant = resolveTenant(req);
  const cfg = loadClientConfig(tenant);

  const body = await req.json().catch(() => ({}));

  const sessionId = String(body.sessionId || "");
  const paymentToken = String(body.paymentToken || "");

  // These may be provided by client (payload-in-url `p` flow),
  // but we’ll prefer stored session values if we have them.
  const clientAmount = Number(body.amount);
  const clientCurrency = String(body.currency || "GBP");
  const clientOrderRef = String(body.orderRef || "");

  if (!sessionId || !paymentToken) {
    return NextResponse.json(
      { error: "Missing sessionId or paymentToken" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  // Try to load server-side session (if in-memory store has it).
  // If not available, fall back to client-provided values (needed for your `p=` flow).
  const session = getSession(sessionId);
  const amount = session?.amount ?? clientAmount;
  const currency = session?.currency ?? clientCurrency;
  const orderRef = session?.orderRef ?? clientOrderRef;
  const returnUrl = session?.returnUrl || "";

  if (!amount || amount <= 0 || !orderRef) {
    return NextResponse.json(
      { error: "Missing amount/orderRef (session not found and not provided in request)" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  // Pull tenant private key from env using clients.ts config
  const privateKeyEnv = cfg.privateKeyEnv;
  const privateKey = process.env[privateKeyEnv] || "";

  if (!privateKey) {
    return NextResponse.json(
      { error: `Missing NMI private key env: ${privateKeyEnv}` },
      { status: 500, headers: corsHeaders(req) }
    );
  }

  /**
   * REAL NMI SALE
   * Docs vary by integration, but the common hosted/token flow is:
   * - payment_token (from NMI Payment Component)
   * - type=sale
   * - amount
   * - currency
   * - orderid
   */
  const form = new URLSearchParams();
  form.set("security_key", privateKey);
  form.set("type", "sale");
  form.set("amount", Number(amount).toFixed(2));
  form.set("currency", currency);
  form.set("payment_token", paymentToken);
  form.set("orderid", orderRef);

  // Helpful metadata
  form.set("merchant_defined_field_1", "edge-lab");
  form.set("merchant_defined_field_2", tenant);
  form.set("merchant_defined_field_3", sessionId);

  // NMI endpoint (same URL; sandbox vs live is determined by the key/account)
  const nmiRes = await fetch("https://secure.nmi.com/api/transact.php", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const text = await nmiRes.text();
  const parsed = parseNmiResponse(text);
  const status = normalizeStatus(parsed);

  // Build a clean response your UI/partners can consume
  const result = {
    ok: status === "approved",
    status, // approved | declined | error
    sessionId,
    orderRef,
    currency,
    amount: Number(Number(amount).toFixed(2)),
    nmi: {
      response: parsed.response, // 1/2/3
      responsetext: parsed.responsetext,
      transactionid: parsed.transactionid,
      authcode: parsed.authcode,
      avsresponse: parsed.avsresponse,
      cvvresponse: parsed.cvvresponse,
    },
  };

  // Best-effort webhook POST (if you store one in session)
  if (returnUrl) {
    await postReturnUrl(returnUrl, result);
  }

  // If NMI returned an “error”, return 402/400-ish is optional.
  // I keep it 200 so your demo flow doesn't break; status tells you what happened.
  return NextResponse.json(result, { headers: corsHeaders(req) });
}