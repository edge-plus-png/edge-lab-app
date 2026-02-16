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

  // Demo 2: payload is the source of truth (no shared storage needed)
  const session = decoded;

  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

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

      {okMsg && (
        <div style={{ padding: 12, marginBottom: 12, background: "#dcfce7", borderRadius: 12, border: "1px solid #bbf7d0" }}>
          <b>Success:</b> {okMsg}
        </div>
      )}

      <NmiPayments
        tokenizationKey={session.tokenizationKey}
        layout="multiLine"
        paymentMethods={["card"]}
        onPay={async (event: { token: string }) => {
          setErr(null);
          setOkMsg(null);

          try {
            const res = await fetch("/api/charge", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sessionId: session.sessionId,
                orderRef: session.orderRef,
                amount: session.amount,
                currency: session.currency,
                paymentToken: event.token,
              }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) return json?.error || "Charge failed";

            // show something useful on screen
            setOkMsg(`${json.status || "approved"} (tx=${json?.gateway?.transaction_id || json?.nmi?.transactionid || "n/a"})`);

            // Returning true tells the component “success”
            return true;
          } catch (e: any) {
            return e?.message || "Charge failed";
          }
        }}
      />

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        Payment token is created in-browser by the NMI component, then posted server-to-server for processing.
      </div>
    </div>
  );
}