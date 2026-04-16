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
  const { sessionId, paymentToken } = body;

  if (!sessionId || !paymentToken) {
    return NextResponse.json({ error: "Missing sessionId or paymentToken" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session || session.slug !== slug) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }

  const privateKey = process.env[cfg.privateKeyEnv || ""];
  if (!privateKey) {
    return NextResponse.json({ error: "Gateway private key missing" }, { status: 500 });
  }

  // -------------------------
  // REAL NMI AUTHORISATION
  // -------------------------

  const params = new URLSearchParams();
  params.append("security_key", privateKey);
  params.append("type", "sale");
  params.append("amount", session.amount.toFixed(2));
  params.append("payment_token", paymentToken);
  params.append("orderid", session.orderRef);
  params.append("currency", session.currency);

  params.append("first_name", session.customer.firstName);
  params.append("last_name", session.customer.lastName);
  params.append("email", session.customer.email);
  params.append("zip", session.customer.postalCode);

  const gatewayRes = await fetch("https://secure.nmi.com/api/transact.php", {
    method: "POST",
    body: params,
  });

  const text = await gatewayRes.text();

  const parsed = Object.fromEntries(new URLSearchParams(text));

  const approved = parsed.response === "1";

  const result = saveResult({
    resultId: newId(),
    sessionId,
    slug,
    intent: session.intent,
    status: approved ? "approved" : "declined",
    orderRef: session.orderRef,
    amount: session.amount,
    currency: session.currency,
    customer: session.customer,
    gateway: {
      transactionId: parsed.transactionid,
      message: parsed.responsetext,
      responseCode: parsed.response_code,
      authCode: parsed.authcode,
      avs: parsed.avsresponse,
      cvv: parsed.cvvresponse,
      eci: parsed.eci,
      cavv: parsed.cavv,
      xid: parsed.xid,
      threeDsVersion: parsed.threeds_version,
      directoryServerId: parsed.directory_server_id,
      cardholderAuth: parsed.cardholder_auth,
    },
    raw: parsed,
  });

  return NextResponse.json({
    status: result.status,
    resultId: result.resultId,
  });
}
