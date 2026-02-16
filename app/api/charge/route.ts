// app/api/charge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getSession } from "@/lib/store";

/**
 * CORS (optional; useful if demo-store domains call /api/charge from browser)
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
 * response=1 = approved
 * response=2 = declined
 * response=3 = error
 */
function normalizeStatus(resp: Record<string, string>) {
  const code = resp.response;
  if (code === "1") return "approved";
  if (code === "2") return "declined";
  return "error";
}

/**
 * Best-effort webhook POST (never fails the payment)
 */
async function postReturnUrl(returnUrl: string, payload: any) {
  try {
    await fetch(returnUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore
  }
}

type ChargeBody = {
  sessionId?: string;
  paymentToken?: string;

  amount?: number;
  currency?: string;
  orderRef?: string;
  returnUrl?: string;

  customer?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    postalCode?: string;
  };

  // 3DS (optional)
  eci?: string;
  cavv?: string;
  xid?: string;
  threeDsVersion?: string;
  directoryServerId?: string;
  cardHolderAuth?: string;
};

export async function POST(req: NextRequest) {
  const tenant = resolveTenant(req);
  const cfg = loadClientConfig(tenant);

  const body = (await req.json().catch(() => ({}))) as ChargeBody;

  const sessionId = String(body.sessionId || "");
  const paymentToken = String(body.paymentToken || "");

  // Optional 3DS fields (only used if present)
  const eci = body.eci ? String(body.eci) : "";
  const cavv = body.cavv ? String(body.cavv) : "";
  const xid = body.xid ? String(body.xid) : "";
  const threeDsVersion = body.threeDsVersion ? String(body.threeDsVersion) : "";
  const directoryServerId = body.directoryServerId ? String(body.directoryServerId) : "";
  const cardHolderAuth = body.cardHolderAuth ? String(body.cardHolderAuth) : "";

  // Fallback values for demo p= flow only
  const clientAmount = Number(body.amount);
  const clientCurrency = String(body.currency || "GBP");
  const clientOrderRef = String(body.orderRef || "");
  const clientReturnUrl = String(body.returnUrl || "");

  if (!sessionId || !paymentToken) {
    return NextResponse.json(
      { error: "Missing sessionId or paymentToken" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  // Prefer server-side session (if available)
  const session: any = getSession(sessionId);
  const amount = session?.amount ?? clientAmount;
  const currency = session?.currency ?? clientCurrency;
  const orderRef = session?.orderRef ?? clientOrderRef;

  // Return URL: prefer session, else allow client (demo p= flow)
  const returnUrl = String(session?.returnUrl || clientReturnUrl || "");

  // Customer: prefer session, else allow client (demo p= flow)
  const customer = {
    firstName: String(session?.customer?.firstName || body.customer?.firstName || ""),
    lastName: String(session?.customer?.lastName || body.customer?.lastName || ""),
    email: String(session?.customer?.email || body.customer?.email || ""),
    postalCode: String(session?.customer?.postalCode || body.customer?.postalCode || ""),
  };

  if (!amount || amount <= 0 || !orderRef) {
    return NextResponse.json(
      { error: "Missing amount/orderRef (session not found and not provided in request)" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  // We want these visible in NMI (name + postcode). Require them for v1.
  if (!customer.firstName || !customer.lastName || !customer.postalCode) {
    return NextResponse.json(
      { error: "Missing customer firstName/lastName/postalCode" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  // Pull tenant private key from env
  const privateKeyEnv = String(cfg.privateKeyEnv || "");
  if (!privateKeyEnv) {
    return NextResponse.json(
      { error: "Client config missing privateKeyEnv" },
      { status: 500, headers: corsHeaders(req) }
    );
  }

  const privateKey = process.env[privateKeyEnv] ?? "";
  if (!privateKey) {
    return NextResponse.json(
      { error: `Missing NMI private key env: ${privateKeyEnv}` },
      { status: 500, headers: corsHeaders(req) }
    );
  }

  /**
   * REAL NMI SALE
   * - payment_token from NMI Payment Component
   * - type=sale
   * - amount/currency
   * - orderid
   * - customer fields (so they appear in the gateway UI)
   */
  const form = new URLSearchParams();
  form.set("security_key", privateKey);
  form.set("type", "sale");
  form.set("amount", Number(amount).toFixed(2));
  form.set("currency", currency);
  form.set("payment_token", paymentToken);

  // ✅ Shows in NMI
  form.set("orderid", orderRef);
  form.set("firstname", customer.firstName);
  form.set("lastname", customer.lastName);
  form.set("zip", customer.postalCode);
  if (customer.email) form.set("email", customer.email);

  /**
   * ✅ 3DS bridge (best-effort)
   * Note: exact field names can be processor/account dependent.
   * We send common ones (eci/cavv/xid) AND also mirror into MDD fields for visibility.
   */
  if (eci) form.set("eci", eci);
  if (cavv) form.set("cavv", cavv);
  if (xid) form.set("xid", xid);

  // Some accounts expect different names; we include these as well (harmless if ignored).
  if (threeDsVersion) form.set("three_ds_version", threeDsVersion);
  if (directoryServerId) form.set("directory_server_id", directoryServerId);
  if (cardHolderAuth) form.set("cardholder_auth", cardHolderAuth);

  // Helpful metadata (always visible in NMI)
  form.set("merchant_defined_field_1", "edge-lab");
  form.set("merchant_defined_field_2", tenant);
  form.set("merchant_defined_field_3", sessionId);

  // Mirror 3DS into visible fields too (so you can prove it even if processor doesn’t surface it)
  if (eci) form.set("merchant_defined_field_4", `eci:${eci}`);
  if (cavv) form.set("merchant_defined_field_5", `cavv:${cavv}`);
  if (xid) form.set("merchant_defined_field_6", `xid:${xid}`);
  if (threeDsVersion) form.set("merchant_defined_field_7", `3ds:${threeDsVersion}`);

  // NMI endpoint (your key/account decides sandbox vs live)
  const nmiRes = await fetch("https://secure.networkmerchants.com/api/transact.php", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const text = await nmiRes.text();
  const parsed = parseNmiResponse(text);
  const status = normalizeStatus(parsed);

  const result = {
    event: "payment.completed",
    client: tenant,
    status, // approved | declined | error

    session_id: sessionId,
    reference: orderRef,
    amount: Number(Number(amount).toFixed(2)),
    currency,

    customer: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      postalCode: customer.postalCode,
    },

    gateway: {
      transaction_id: parsed.transactionid || "",
      response: parsed.response || "",
      response_code: parsed.response_code || "",
      message: parsed.responsetext || "",
      auth_code: parsed.authcode || "",
      avs: parsed.avsresponse || "",
      cvv: parsed.cvvresponse || "",

      // echo back what we know (parsed wins, else our input)
      eci: parsed.eci || eci,
      cavv: parsed.cavv || cavv,
      xid: parsed.xid || xid,
      three_ds_version: parsed.threeds_version || parsed.three_ds_version || threeDsVersion,
    },

    created_at: new Date().toISOString(),
  };

  // Best-effort webhook (if present)
  if (returnUrl) await postReturnUrl(returnUrl, result);

  // Keep 200 so demo flows don’t “hard fail” — status tells the story
  return NextResponse.json(result, { headers: corsHeaders(req) });
}