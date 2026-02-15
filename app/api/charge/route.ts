// app/api/charge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getSession, saveResult } from "@/lib/store";
import { validateReturnUrlOrThrow } from "@/lib/returnUrl";

function newId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  const cfg = loadClientConfig(slug);

  const body = await req.json().catch(() => ({}));

  const sessionId = String(body.sessionId || "");
  const paymentToken = String(body.paymentToken || "");

  // 3DS fields from NmiThreeDSecure onComplete
  const cardHolderAuth = body.cardHolderAuth ? String(body.cardHolderAuth) : "";
  const cavv = body.cavv ? String(body.cavv) : "";
  const directoryServerId = body.directoryServerId ? String(body.directoryServerId) : "";
  const eci = body.eci ? String(body.eci) : "";
  const threeDsVersion = body.threeDsVersion ? String(body.threeDsVersion) : "";
  const xid = body.xid ? String(body.xid) : "";

  if (!sessionId || !paymentToken) {
    return NextResponse.json({ error: "Missing sessionId/paymentToken" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session || session.slug !== slug) {
    return NextResponse.json({ error: "Unknown sessionId" }, { status: 404 });
  }

  // Load private key from ENV
  const privateKeyEnv = cfg.privateKeyEnv || "";
  const privateKey = privateKeyEnv ? process.env[privateKeyEnv] : "";
  if (!privateKey) {
    return NextResponse.json({ error: `Missing private key ENV: ${privateKeyEnv}` }, { status: 500 });
  }

  // -----------------------------
  // Create NMI Sale Transaction
  // -----------------------------
  const form = new URLSearchParams();
  form.set("security_key", privateKey);
  form.set("type", "sale");
  form.set("processor_id", "ecom"); // your requirement

  form.set("amount", String(session.amount.toFixed(2)));
  form.set("currency", session.currency);
  form.set("orderid", session.orderRef);

  // Token from Payment Component
  form.set("payment_token", paymentToken);

  // Customer data (helps 3DS + AVS)
  form.set("firstname", session.customer.firstName);
  form.set("lastname", session.customer.lastName);
  form.set("email", session.customer.email);
  form.set("zip", session.customer.postalCode);

  // Bridge 3DS -> Gateway (if present)
  if (eci) form.set("eci", eci);
  if (cavv) form.set("cavv", cavv);
  if (xid) form.set("xid", xid);
  if (threeDsVersion) form.set("three_ds_version", threeDsVersion);
  if (directoryServerId) form.set("directory_server_id", directoryServerId);
  if (cardHolderAuth) form.set("cardholder_auth", cardHolderAuth);

  const resp = await fetch("https://secure.networkmerchants.com/api/transact.php", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const text = await resp.text();
  const parsed = Object.fromEntries(new URLSearchParams(text));

  const approved = parsed.response === "1";
  const declined = parsed.response === "2";
  const status = approved ? "approved" : declined ? "declined" : "error";

  // -----------------------------
  // Save Result
  // -----------------------------
  const result = saveResult({
    resultId: newId(),
    sessionId: session.sessionId,
    slug,
    status,
    orderRef: session.orderRef,
    amount: session.amount,
    currency: session.currency,
    gateway: {
      transactionId: parsed.transactionid || "",
      message: parsed.responsetext || "",
      responseCode: parsed.response_code || "",
      authCode: parsed.authcode,
      avs: parsed.avsresponse,
      cvv: parsed.cvvresponse,

      // 3DS fields (prefer gateway echo, fallback to client-provided)
      eci: (parsed.eci as string) || eci,
      cavv: (parsed.cavv as string) || cavv,
      threeDsVersion:
        (parsed.threeds_version as string) ||
        (parsed.three_ds_version as string) ||
        threeDsVersion,
    },
    raw: {
      nmi: parsed,
      threeDS: { eci, cavv, xid, threeDsVersion, directoryServerId, cardHolderAuth },
    },
  });

  // -----------------------------
  // Auto POST to Return URL (if set)
  // Do NOT fail the payment if webhook fails.
  // -----------------------------
  let webhook: { attempted: boolean; ok?: boolean; statusCode?: number; error?: string } = {
    attempted: false,
  };

  const returnUrl = session.returnUrl || "";
  if (returnUrl) {
    webhook.attempted = true;

    try {
      validateReturnUrlOrThrow(returnUrl, cfg.allowedReturnUrlPrefixes);

      const payload = {
        type: "edge_lab_result",
        client: slug,

        status: result.status,
        resultId: result.resultId,
        sessionId: result.sessionId,

        // partner-friendly alias (Artisio)
        reference: result.orderRef,

        orderRef: result.orderRef,
        amount: result.amount,
        currency: result.currency,

        gateway: result.gateway || {},
        ts: new Date().toISOString(),
      };

      // Timeout so a slow partner endpoint doesn't hang the customer flow
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);

      const r = await fetch(returnUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(t);

      webhook.ok = r.ok;
      webhook.statusCode = r.status;
    } catch (e: any) {
      webhook.ok = false;
      webhook.error = e?.name === "AbortError" ? "Return URL timed out" : e?.message || "Failed to POST to returnUrl";
    }
  }

  return NextResponse.json({
    ok: true,
    status,
    resultId: result.resultId,
    webhook,
  });
}