// app/api/charge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getSession, saveResult } from "@/lib/store";

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

  // Create NMI Sale Transaction
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

  /**
   * IMPORTANT:
   * These names are the bridge between “3DS auth result” and “gateway transaction”.
   * Your 3DS component returns these fields.  [oai_citation:2‡Payment component 022026.docx](sediment://file_000000007de8720e8aadad2a462fc28c)
   *
   * Gateways vary on exact param names. If your gateway expects different ones,
   * we’ll align them to what you see in NMI’s transaction API logs.
   */
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

      // These should start showing once 3DS is actually being used
      eci: parsed.eci || eci,
      cavv: parsed.cavv || cavv,
      threeDsVersion: parsed.threeds_version || parsed.three_ds_version || threeDsVersion,
    },
    raw: {
      nmi: parsed,
      threeDS: { eci, cavv, xid, threeDsVersion, directoryServerId, cardHolderAuth },
    },
  });

  return NextResponse.json({ ok: true, status, resultId: result.resultId });
}