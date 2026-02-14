// app/api/charge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "@/lib/tenant";
import { loadClientConfig } from "@/lib/clients";
import { getSession, saveResult } from "@/lib/store";

export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);
  const cfg = loadClientConfig(slug);

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId || "");
  const paymentToken = String(body.paymentToken || ""); // token/nonce from component

  if (!sessionId || !paymentToken) {
    return NextResponse.json({ error: "Missing sessionId/paymentToken" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session || session.slug !== slug) {
    return NextResponse.json({ error: "Unknown sessionId" }, { status: 404 });
  }

  // Get private key from ENV (server-side only)
  const privateKeyEnv = cfg.privateKeyEnv || "";
  const privateKey = privateKeyEnv ? process.env[privateKeyEnv] : "";
  if (!privateKey) {
    return NextResponse.json({ error: `Missing private key ENV: ${privateKeyEnv}` }, { status: 500 });
  }

  /**
   * NMI charge step:
   * This is the step that creates the transaction in the gateway.
   *
   * NOTE: The exact field name for the token depends on how your component returns it.
   * We'll wire that once you paste the component callback payload.
   */
  const form = new URLSearchParams();
  form.set("security_key", privateKey);
  form.set("type", "sale");
  form.set("amount", String(session.amount.toFixed(2)));
  form.set("currency", session.currency);
  form.set("orderid", session.orderRef);

  // Common token field used in NMI token flows:
  form.set("payment_token", paymentToken);

  // Optional customer data
  form.set("firstname", session.customer.firstName);
  form.set("lastname", session.customer.lastName);
  form.set("email", session.customer.email);
  form.set("zip", session.customer.postalCode);

  const resp = await fetch("https://secure.networkmerchants.com/api/transact.php", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const text = await resp.text();

  // NMI returns a querystring-style response by default
  const parsed = Object.fromEntries(new URLSearchParams(text));

  const approved = parsed.response === "1";
  const declined = parsed.response === "2";

  const status = approved ? "approved" : declined ? "declined" : "error";

  const result = saveResult({
    sessionId: session.sessionId,
    slug,
    status,
    orderRef: session.orderRef,
    amount: session.amount,
    currency: session.currency,
    gateway: {
      transactionId: parsed.transactionid,
      message: parsed.responsetext,
      responseCode: parsed.response_code,
      authCode: parsed.authcode,
      avs: parsed.avsresponse,
      cvv: parsed.cvvresponse,
      eci: parsed.eci,
      cavv: parsed.cavv,
      threeDsVersion: parsed.threeds_version,
    },
    raw: parsed,
  });

  return NextResponse.json({ ok: true, status, resultId: result.resultId });
}