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

  if (!sessionId || !paymentToken) {
    return NextResponse.json(
      { error: "Missing sessionId/paymentToken" },
      { status: 400 }
    );
  }

  const session = getSession(sessionId);
  if (!session || session.slug !== slug) {
    return NextResponse.json(
      { error: "Unknown sessionId" },
      { status: 404 }
    );
  }

  // Load private key from ENV
  const privateKeyEnv = cfg.privateKeyEnv || "";
  const privateKey = privateKeyEnv ? process.env[privateKeyEnv] : "";

  if (!privateKey) {
    return NextResponse.json(
      { error: `Missing private key ENV: ${privateKeyEnv}` },
      { status: 500 }
    );
  }

  // ------------------------------------
  // Create NMI Sale Transaction
  // ------------------------------------

  const form = new URLSearchParams();
  form.set("security_key", privateKey);
  form.set("type", "sale");
  form.set("amount", session.amount.toFixed(2));
  form.set("currency", session.currency);
  form.set("orderid", session.orderRef);

  // Token from Payment Component
  form.set("payment_token", paymentToken);

  // Optional customer data
  form.set("firstname", session.customer.firstName);
  form.set("lastname", session.customer.lastName);
  form.set("email", session.customer.email);
  form.set("zip", session.customer.postalCode);

  const resp = await fetch(
    "https://secure.networkmerchants.com/api/transact.php",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }
  );

  const text = await resp.text();

  // NMI returns querystring-style response
  const parsed = Object.fromEntries(new URLSearchParams(text));

  const approved = parsed.response === "1";
  const declined = parsed.response === "2";

  const status = approved ? "approved" : declined ? "declined" : "error";

  // ------------------------------------
  // Save Result (NOW WITH resultId)
  // ------------------------------------

  const result = saveResult({
    resultId: newId(), // ✅ REQUIRED
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
      eci: parsed.eci,
      cavv: parsed.cavv,
      threeDsVersion: parsed.threeds_version,
    },
    raw: parsed,
  });

  return NextResponse.json({
    ok: true,
    status,
    resultId: result.resultId,
  });
}