// app/pay/[sessionId]/PayClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

// ✅ NMI Payment Component
import { NmiPayments /*, NmiThreeDSecure */ } from "@nmipayments/nmi-pay-react";

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
    // base64url -> base64
    let b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "="; // ✅ IMPORTANT padding

    const json = atob(b64);
    const data = safeJsonParse<SessionResponse>(json);
    if (!data?.sessionId || !data?.tokenizationKey) return null;
    return data;
  } catch {
    return null;
  }
}

export default function PayClient({ sessionId }: { sessionId: string }) {
  const search = useSearchParams();
  const p = search.get("p") || "";

  // ✅ If `p` exists, use it (no server fetch required)
  const decoded = useMemo(() => (p ? decodeP(p) : null), [p]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);

  useEffect(() => {
    // Use payload in URL if present (most reliable on Vercel)
    if (decoded) {
      setSession(decoded);
      setErr(null);
      setLoading(false);
      return;
    }

    // Fallback: try API (only works if you have shared storage)
    if (!sessionId) {
      setErr("Missing sessionId in URL");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const res = await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));
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
  }, [sessionId, decoded]);

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

      {/* ✅ Mount NMI Payment Component (tokenizationKey is safe in frontend) */}
      <NmiPayments
        tokenizationKey={session.tokenizationKey}
        layout="multiLine"
        paymentMethods={["card"]}
        onPay={async (event: any) => {
          try {
            // You already have /api/charge expecting sessionId + paymentToken (and optional 3DS fields)
            const resp = await fetch("/api/charge", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sessionId: session.sessionId,
                paymentToken: event.token,
              }),
            });

            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) return data?.error || "Charge failed";

            // /api/charge returns resultId + webhook status; hosted flow then shows result page
            // You can optionally redirect to /result/:sessionId if that’s how your app works.
            return true;
          } catch (e: any) {
            return e?.message || "Charge failed";
          }
        }}
      />

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        Card data is tokenized in the component and your server charges using the token.  [oai_citation:1‡Payment component 022026.docx](sediment://file_00000000b7bc71f5938b4b76b25aacf9)
      </div>
    </div>
  );
}