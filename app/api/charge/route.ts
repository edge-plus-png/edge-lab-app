// app/api/charge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getSession, saveResult, type PaymentStatus, type SessionIntent } from "@/lib/store";
import { sendCallback } from "@/lib/callbackDelivery";
import { validateAllowlistedUrlOrThrow, validateReturnUrlOrThrow } from "@/lib/returnUrl";
import { buildResultPayload } from "@/lib/resultPayload";

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

    // ✅ split only on the FIRST "="
    const i = part.indexOf("=");
    const k = i >= 0 ? part.slice(0, i) : part;
    const v = i >= 0 ? part.slice(i + 1) : "";

    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }

  return out;
}

/**
 * response=1 = approved
 * response=2 = declined
 * response=3 = error
 */
function normalizeStatus(resp: Record<string, string>): PaymentStatus {
  const code = resp.response;
  if (code === "1") return "approved";
  if (code === "2") return "declined";
  return "error";
}

function resolveIntent(value: unknown): SessionIntent {
  return value === "card_verification" ? "card_verification" : "payment";
}

function isApprovedResponse(resp: Record<string, string>) {
  return resp.response === "1";
}

async function postGatewayRequest(form: URLSearchParams) {
  const nmiRes = await fetch("https://secure.networkmerchants.com/api/transact.php", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const text = await nmiRes.text();
  return parseNmiResponse(text);
}

async function runLinkedGatewayAction(
  privateKey: string,
  type: "void" | "refund",
  transactionId: string,
  amount?: number
) {
  const form = new URLSearchParams();
  form.set("security_key", privateKey);
  form.set("type", type);
  form.set("transactionid", transactionId);
  if (typeof amount === "number") {
    form.set("amount", Number(amount).toFixed(2));
  }

  return postGatewayRequest(form);
}

async function reverseVerificationCharge(
  privateKey: string,
  transactionId: string,
  amount: number
) {
  const voidResult = await runLinkedGatewayAction(privateKey, "void", transactionId);
  if (isApprovedResponse(voidResult)) {
    return {
      reversed: true,
      reverseType: "void" as const,
      reverseStatus: normalizeStatus(voidResult),
      reverseTransactionId: voidResult.transactionid || transactionId,
      reverseMessage: voidResult.responsetext || "",
      reverseResponseCode: voidResult.response_code || voidResult.response || "",
      reverseRaw: voidResult,
    };
  }

  const refundResult = await runLinkedGatewayAction(privateKey, "refund", transactionId, amount);
  return {
    reversed: isApprovedResponse(refundResult),
    reverseType: "refund" as const,
    reverseStatus: normalizeStatus(refundResult),
    reverseTransactionId: refundResult.transactionid || transactionId,
    reverseMessage:
      refundResult.responsetext || voidResult.responsetext || "Automatic reversal failed",
    reverseResponseCode: refundResult.response_code || refundResult.response || "",
    reverseRaw: refundResult,
  };
}

function newId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Invalid returnUrl";
}

export async function POST(req: NextRequest) {
  const tenant = resolveTenant(req);
  const requestHost = req.headers.get("host") || "";
  const cfg = loadClientConfig(tenant);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

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
  const clientIntent = resolveIntent(body.intent);
  const clientReturnUrl = String(body.returnUrl || "");
  const clientSuccessUrl = String(body.successUrl || "");
  const clientFailUrl = String(body.failUrl || "");
  const clientCancelUrl = String(body.cancelUrl || "");

  // Customer fallback (prefer session -> else body.customer)
  const clientCustomer =
    typeof body.customer === "object" && body.customer !== null
      ? (body.customer as Record<string, unknown>)
      : {};
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
  const session = getSession(sessionId);

  const amount = session?.amount ?? clientAmount;
  const currency = session?.currency ?? clientCurrency;
  const intent = session?.intent ?? clientIntent;
  const orderRef = session?.orderRef ?? clientOrderRef;
  const returnUrl = session?.returnUrl || clientReturnUrl;
  const successUrl = session?.successUrl || clientSuccessUrl;
  const failUrl = session?.failUrl || clientFailUrl;
  const cancelUrl = session?.cancelUrl || clientCancelUrl;

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

  if (intent === "card_verification" && Number(Number(amount).toFixed(2)) !== 1) {
    return NextResponse.json(
      { error: "Card verification sessions must use an amount of 1.00." },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  if (!firstName || !lastName || !email || !postalCode) {
    return NextResponse.json(
      { error: "Missing customer fields (firstName,lastName,email,postalCode)" },
      { status: 400, headers: corsHeaders(req) }
    );
  }

  if (returnUrl) {
    try {
      validateReturnUrlOrThrow(returnUrl, cfg.allowedReturnUrlPrefixes);
    } catch (error: unknown) {
      return NextResponse.json(
        { error: errorMessage(error) },
        { status: 400, headers: corsHeaders(req) }
      );
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
      return NextResponse.json(
        { error: errorMessage(error) },
        { status: 400, headers: corsHeaders(req) }
      );
    }
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

  const parsed = await postGatewayRequest(form);
  const status = normalizeStatus(parsed);
  const approved = status === "approved";
  const gateway = {
    transaction_id: parsed.transactionid || "",
    response: parsed.response || "",
    response_code: parsed.response_code || "",
    message: parsed.responsetext || "",
    auth_code: parsed.authcode || "",
    avs: parsed.avsresponse || "",
    cvv: parsed.cvvresponse || "",
    eci: parsed.eci || eci,
    cavv: parsed.cavv || cavv,
    xid: parsed.xid || xid,
    three_ds_version:
      parsed.threeds_version || parsed.three_ds_version || threeDsVersion,
    directory_server_id: parsed.directory_server_id || directoryServerId,
    cardholder_auth: parsed.cardholder_auth || cardHolderAuth,
  };

  let verification;
  if (intent === "card_verification" && approved && gateway.transaction_id) {
    verification = await reverseVerificationCharge(
      privateKey,
      gateway.transaction_id,
      Number(Number(amount).toFixed(2))
    );
  } else if (intent === "card_verification") {
    verification = {
      reversed: false,
      reverseStatus: "error" as PaymentStatus,
      reverseMessage: approved ? "Missing transaction ID for reversal" : "Charge not approved",
      reverseResponseCode: approved ? "" : parsed.response || "",
    };
  }

  const createdAt = Date.now();
  const roundedAmount = Number(Number(amount).toFixed(2));
  const customer = { firstName, lastName, email, postalCode, address1, city, country };
  const result = buildResultPayload({
    client: tenant,
    sessionId,
    intent,
    status,
    orderRef,
    amount: roundedAmount,
    currency,
    customer,
    gateway,
    verification,
    createdAt,
  });

  saveResult({
    resultId: newId(),
    sessionId,
    slug: tenant,
    intent,
    status,
    orderRef,
    amount: roundedAmount,
    currency,
    customer,
    gateway: {
      transactionId: gateway.transaction_id,
      responseCode: gateway.response_code || gateway.response,
      message: gateway.message,
      authCode: gateway.auth_code,
      avs: gateway.avs,
      cvv: gateway.cvv,
      eci: gateway.eci,
      cavv: gateway.cavv,
      xid: gateway.xid,
      threeDsVersion: gateway.three_ds_version,
      directoryServerId: gateway.directory_server_id,
      cardholderAuth: gateway.cardholder_auth,
    },
    verification: verification
      ? {
          reversed: verification.reversed,
          reverseType: verification.reverseType,
          reverseStatus: verification.reverseStatus,
          reverseTransactionId: verification.reverseTransactionId,
          reverseMessage: verification.reverseMessage,
          reverseResponseCode: verification.reverseResponseCode,
        }
      : undefined,
    raw: {
      charge: parsed,
      verificationReverse: verification?.reverseRaw,
      redirects: { successUrl, failUrl, cancelUrl },
    },
  });

  if (returnUrl) {
    try {
      await sendCallback({
        slug: tenant,
        source: "charge",
        sessionId,
        returnUrl,
        payload: result,
        requestHost,
      });
    } catch {
      // ignore callback errors so the payment response still succeeds
    }
  }

  return NextResponse.json(result, { headers: corsHeaders(req) });
}
