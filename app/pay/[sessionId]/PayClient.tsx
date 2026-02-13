"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NmiPayments } from "@nmipayments/nmi-pay-react";

type SessionInfo = {
  sessionId: string;
  amount: number;
  currency: string;
  orderRef: string;
  tokenizationKey: string;
};

export default function PayClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load session");
        setSession(data);
      } catch (e: any) {
        setError(e?.message || "Failed to load session");
      }
    })();
  }, [sessionId]);

  async function processToken(token: string) {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, paymentToken: token }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment processing failed");

      router.push(`/result/${sessionId}`);
    } catch (e: any) {
      setError(e?.message || "Payment processing failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div style={{ padding: 12, border: "1px solid #f4bcbc", borderRadius: 10, background: "#fee" }}>
        <b>Error:</b> {error}
      </div>
    );
  }

  if (!session) return <p>Loading hosted payment…</p>;

  return (
    <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
      <p style={{ marginTop: 0 }}>
        <b>Order:</b> {session.orderRef} — <b>{session.currency}</b> {session.amount}
      </p>

      <div style={{ opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}>
        <NmiPayments
          tokenizationKey={session.tokenizationKey}
          layout="multiLine"
          paymentMethods={["card"]}
          onPay={async (event: { token: string }) => {
            await processToken(event.token);
            return true;
          }}
        />
      </div>

      {busy && <p style={{ marginTop: 10 }}>Processing (sandbox)…</p>}

      <p style={{ fontSize: 13, opacity: 0.75, marginTop: 10 }}>
        Test mode: cards may authenticate with 3D Secure, but no funds are captured.
      </p>
    </div>
  );
}