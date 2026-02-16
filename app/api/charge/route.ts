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

export async function POST(req: NextRequest) {
  const tenant = resolveTenant(req);
  const cfg = loadClientConfig(tenant);

  const body = await req.json().catch(() => ({}));

  const sessionId = String(body.sessionId || "");
  const paymentToken = String(body.paymentToken || "");

  // 3DS fields (from NmiThreeDSecure onComplete)  [oai_citation:4‡Payment component 022026.docx](sediment://file_000000007de8720e8aadad2a462fc28c)
  const eci = body.eci ? String(body.eci) : "";
  const cavv = body.cavv ? String(body.cavv) : "";
  const xid = body.xid ? String(body.xid) : "";
  const threeDsVersion = body.threeDsVersion ? String(body.threeDsVersion) : "";
  const directoryServerId = body.directoryServerId ? String(body.directoryServerId) : "";
  const cardHolderAuth = body.cardHolderAuth ? String(body.cardHolderAuth) : "";

  // Fallback values for p= flow only
  const clientAmount = Number(body.amount);
  const clientCurrency = String(body.currency || "GBP");
  const clientOrderRef = String(body.orderRef || "");

  // Customer fallback (prefer session -> else body.customer)
  const clientCustomer = body.customer || {};
  const clientFirstName = String(clientCustomer.firstName || "");
  const clientLastName = String(clientCustomer.lastName || "");
  const clientEmail = String(clientCustomer.email || "");
  const clientPostalCode = String(clientCustomer.postalCode || "");
  const clientAddress1 = String(clientCustomer.address1 || "");
  const clientCity = String(clientCustomer.city || "");
  const clientCountry = String(clientCustomer.country || "");

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
  const returnUrl = session?.returnUrl || "";

  const firstName = String(session?.customer?.firstName || clientFirstName || "");
  const lastName = String(session?.customer?.lastName || clientLastName || "");
  const email = String(session?.customer?.email || clientEmail || "");
  const postalCode = String(session?.customer?.postalCode || clientPostalCode || "");
  const address1 = String(session?.customer?.address1 || clientAddress1 || "");
  const city = String(session?.customer?.city || clientCity || "");
  const country = String(session?.customer?.country || clientCountry || "");

  if (!amount || amount <= 0 || !orderRef) {
    return NextResponse.json(
      { error: "Missing amount/orderRef" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  if (!firstName || !lastName || !email || !postalCode) {
    return NextResponse.json(
      { error: "Missing customer fields (firstName,lastName,email,postalCode)" },
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
   */
  const form = new URLSearchParams();
  form.set("security_key", privateKey);
  form.set("type", "sale");
  form.set("amount", Number(amount).toFixed(2));
  form.set("currency", currency);
  form.set("payment_token", paymentToken);

  // ✅ Make it show in NMI (order + billing identity)
  form.set("orderid", orderRef);
  form.set("first_name", firstName);
  form.set("last_name", lastName);
  form.set("email", email);
  form.set("zip", postalCode);
  if (address1) form.set("address1", address1);
  if (city) form.set("city", city);
  if (country) form.set("country", country);

  // ✅ 3DS bridge — only set if present
  if (eci) form.set("eci", eci);
  if (cavv) form.set("cavv", cavv);
  if (xid) form.set("xid", xid);
  if (threeDsVersion) form.set("three_ds_version", threeDsVersion);
  if (directoryServerId) form.set("directory_server_id", directoryServerId);
  if (cardHolderAuth) form.set("cardholder_auth", cardHolderAuth);

  // Helpful metadata
  form.set("merchant_defined_field_1", "edge-lab");
  form.set("merchant_defined_field_2", tenant);
  form.set("merchant_defined_field_3", sessionId);

  // NMI endpoint
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
    status,

    session_id: sessionId,
    reference: orderRef,
    amount: Number(Number(amount).toFixed(2)),
    currency,

    customer: { firstName, lastName, email, postalCode },

    gateway: {
      transaction_id: parsed.transactionid || "",
      response: parsed.response || "",
      message: parsed.responsetext || "",
      auth_code: parsed.authcode || "",
      avs: parsed.avsresponse || "",
      cvv: parsed.cvvresponse || "",

      // 3DS visibility (what NMI echoes back varies by account/config)
      eci: parsed.eci || eci,
      cavv: parsed.cavv || cavv,
      xid: parsed.xid || xid,
      three_ds_version:
        parsed.threeds_version || parsed.three_ds_version || threeDsVersion,
      directory_server_id: parsed.directory_server_id || directoryServerId,
      cardholder_auth: parsed.cardholder_auth || cardHolderAuth,
    },

    created_at: new Date().toISOString(),
  };

  if (returnUrl) await postReturnUrl(returnUrl, result);

  return NextResponse.json(result, { headers: corsHeaders(req) });
}