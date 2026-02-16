// app/pay/[sessionId]/PayClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { NmiPayments } from "@nmipayments/nmi-pay-react";

type SessionResponse = {
  sessionId: string;
  amount: number;
  currency: string;
  orderRef: string;
  returnUrl: string;
  tokenizationKey: string;
};

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function decodeP(p: string): SessionResponse | null {
  try {
    // base64url -> base64 (+ padding)
    let b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";

    const json = atob(b64);
    const data = safeJsonParse<SessionResponse>(json);
    if (!data?.sessionId || !data?.tokenizationKey) return null;
    return data;
  } catch {
    return null;
  }
}

export default function PayClient() {
  const params = useParams<{ sessionId?: string }>();
  const search = useSearchParams();

  const urlSessionId = typeof params?.sessionId === "string" ? params.sessionId : "";
  const p = search.get("p") || "";
  const decoded = useMemo(() => (p ? decodeP(p) : null), [p]);

  // For Demo 2: payload is the source of truth.
  const session = decoded;

  const [err, setErr] = useState<string | null>(null);

  if (!session) {
    return (
      <div style={{ padding: 12, background: "#fee2e2", borderRadius: 12, border: "1px solid #fecaca" }}>
        <b>Error:</b> Missing or invalid payload. (Expected ?p=... in URL)
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
          URL sessionId: <b>{urlSessionId || "—"}</b>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        Order: {session.orderRef} — {session.currency} {Number(session.amount).toFixed(2)}
      </div>

      {err && (
        <div style={{ padding: 12, marginBottom: 12, background: "#fee2e2", borderRadius: 12, border: "1px solid #fecaca" }}>
          <b>Error:</b> {err}
        </div>
      )}

      <NmiPayments
        tokenizationKey={session.tokenizationKey}
        layout="multiLine"
        paymentMethods={["card"]}
        onPay={async (event: { token: string }) => {
          setErr(null);

          try {
            const res = await fetch("/api/charge", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                // Don’t rely on stored sessions in Demo 2
                sessionId: session.sessionId,
                orderRef: session.orderRef,
                amount: session.amount,
                currency: session.currency,
                paymentToken: event.token,
                returnUrl: session.returnUrl || "",
              }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) return json?.error || "Charge failed";

            // Returning true tells the component “success”
            return true;
          } catch (e: any) {
            return e?.message || "Charge failed";
          }
        }}
      />

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        Token is created in-browser by the Payment Component, then posted server-to-server for processing.  [oai_citation:3‡Payment component 022026.docx](sediment://file_000000007de8720e8aadad2a462fc28c)
      </div>
    </div>
  );
}