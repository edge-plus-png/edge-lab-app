// app/pay/[sessionId]/PayClient.tsx
"use client";

import { useEffect, useState } from "react";

type SessionResponse = {
  sessionId: string;
  amount: number;
  currency: string;
  orderRef: string;
  returnUrl: string;
  tokenizationKey: string;
};

export default function PayClient({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setErr("Missing sessionId");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const res = await fetch(
          `/api/session?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        );
        const json = await res.json();

        if (!res.ok) throw new Error(json?.error || "Failed to load session");
        if (!cancelled) setSession(json);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load session");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) return <div style={{ opacity: 0.7 }}>Loading payment session…</div>;

  if (err) {
    return (
      <div style={{ padding: 12, background: "#fee2e2", borderRadius: 12, border: "1px solid #fecaca" }}>
        <b>Error:</b> {err}
      </div>
    );
  }

  if (!session) return null;

  return (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        Order: {session.orderRef} — {session.currency} {Number(session.amount).toFixed(2)}
      </div>

      <div style={{ opacity: 0.75, fontSize: 13 }}>
        (Payment component mounts here using tokenizationKey)
      </div>
    </div>
  );
}