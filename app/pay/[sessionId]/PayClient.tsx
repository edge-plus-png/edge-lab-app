"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type SessionResponse = {
  sessionId: string;
  amount: number;
  currency: string;
  orderRef: string;
  returnUrl: string;
  tokenizationKey: string;
};

type ThreeDSFields = {
  cardHolderAuth?: string;
  cavv?: string;
  directoryServerId?: string;
  eci?: string;
  threeDsVersion?: string;
  xid?: string;
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
    while (b64.length % 4) b64 += "="; // ✅ padding is required

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
  const decoded = useMemo(() => (p ? decodeP(p) : null), [p]);

  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);

  const [busy, setBusy] = useState(false);

  // This is where the payment component can mount into the DOM.
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (decoded) {
      setSession(decoded);
      setErr(null);
      return;
    }

    // Optional fallback (only if you still want it)
    // If your sessions are NOT shared across instances, this may fail randomly.
    if (!sessionId) {
      setErr("Missing sessionId in URL");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load session");
        if (!cancelled) setSession(json);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load session");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [decoded, sessionId]);

  /**
   * ✅ This function is the ONLY thing your payment component must do:
   * return a paymentToken (and optionally 3DS fields).
   *
   * Replace the body with your existing “working” payment component code.
   */
  async function collectPaymentToken(): Promise<{ paymentToken: string; threeDS?: ThreeDSFields }> {
    if (!session) throw new Error("Session not loaded");
    if (!mountRef.current) throw new Error("Payment UI mount not ready");

    // ------------------------------------------------------------------
    // 🔧 PASTE YOUR EXISTING PAYMENT COMPONENT MOUNT + TOKEN COLLECTION HERE
    //
    // You need to end up with:
    //    paymentToken: string
    // optionally also:
    //    threeDS fields: { eci, cavv, xid, threeDsVersion, directoryServerId, cardHolderAuth }
    //
    // Example shape returned:
    // return { paymentToken, threeDS: { eci, cavv, ... } };
    // ------------------------------------------------------------------

    throw new Error(
      "Payment component not mounted yet. Paste the existing tokenisation code into collectPaymentToken()."
    );
  }

  async function payNow() {
    setErr(null);
    setBusy(true);

    try {
      if (!session) throw new Error("Session not loaded");

      // 1) tokenise card via payment component
      const { paymentToken, threeDS } = await collectPaymentToken();

      // 2) charge via your edge-lab API
      const res = await fetch("/api/charge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          paymentToken,

          // 3DS (optional)
          cardHolderAuth: threeDS?.cardHolderAuth || "",
          cavv: threeDS?.cavv || "",
          directoryServerId: threeDS?.directoryServerId || "",
          eci: threeDS?.eci || "",
          threeDsVersion: threeDS?.threeDsVersion || "",
          xid: threeDS?.xid || "",
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Charge failed");

      // 3) redirect to result page
      window.location.href = `/result/${encodeURIComponent(session.sessionId)}`;
    } catch (e: any) {
      setErr(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div style={{ padding: 12, background: "#fee2e2", borderRadius: 12, border: "1px solid #fecaca" }}>
        <b>Error:</b> {err}
      </div>
    );
  }

  if (!session) return <div style={{ opacity: 0.7 }}>Loading payment session…</div>;

  return (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        Order: {session.orderRef} — {session.currency} {Number(session.amount).toFixed(2)}
      </div>

      {/* Payment component mounts here */}
      <div
        ref={mountRef}
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 12,
          background: "#fafafa",
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Payment component will mount here using tokenizationKey:
          <div style={{ marginTop: 6, fontFamily: "ui-monospace", fontSize: 12 }}>
            {session.tokenizationKey}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={payNow}
        disabled={busy}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "14px",
          borderRadius: 12,
          border: "none",
          background: "#DC2626",
          color: "#fff",
          fontWeight: 900,
          fontSize: 16,
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Processing…" : "Pay now →"}
      </button>
    </div>
  );
}