"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NmiPayments,
  NmiThreeDSecure,
  type NmiThreeDSecureRef,
} from "@nmipayments/nmi-pay-react";

type SessionInfo = {
  sessionId: string;
  amount: number;
  currency: string;
  orderRef: string;
  tokenizationKey: string;
};

export default function PayClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const threeDSRef = useRef<NmiThreeDSecureRef>(null);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [paymentToken, setPaymentToken] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -----------------------------
  // Load session from server
  // -----------------------------
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/session?sessionId=${encodeURIComponent(sessionId)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load session");
        setSession(data);
      } catch (e: any) {
        setError(e?.message || "Failed to load session");
      }
    })();
  }, [sessionId]);

  // -----------------------------
  // Step 2: Charge AFTER 3DS
  // -----------------------------
  async function chargeWith3DS(result: any) {
    if (!paymentToken) {
      setError("Missing payment token");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/charge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          paymentToken,

          // 3DS fields from component
          cardHolderAuth: result?.cardHolderAuth,
          cavv: result?.cavv,
          directoryServerId: result?.directoryServerId,
          eci: result?.eci,
          threeDsVersion: result?.threeDsVersion,
          xid: result?.xid,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Charge failed");

      router.push(`/result/${sessionId}`);
    } catch (e: any) {
      setError(e?.message || "Charge failed");
      setBusy(false);
    }
  }

  // -----------------------------
  // Step 1: Start 3DS
  // -----------------------------
  function startThreeDS() {
    if (!session) return;

    if (!paymentToken) {
      setError("Enter card details first.");
      return;
    }

    setError(null);
    setBusy(true);

    threeDSRef.current?.startThreeDSecure({
      paymentToken,
      currency: session.currency,
      amount: String(session.amount.toFixed(2)),

      // Minimal required cardholder info
      firstName: "John",
      lastName: "Doe",
    });
  }

  // -----------------------------
  // UI
  // -----------------------------
  if (error) {
    return (
      <div
        style={{
          padding: 12,
          border: "1px solid #f4bcbc",
          borderRadius: 10,
          background: "#fee",
        }}
      >
        <b>Error:</b> {error}
      </div>
    );
  }

  if (!session) {
    return <p>Loading hosted payment…</p>;
  }

  return (
    <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
      <p style={{ marginTop: 0 }}>
        <b>Order:</b> {session.orderRef} —{" "}
        <b>{session.currency}</b> {session.amount}
      </p>

      {/* -------------------------
           Payment Component
         ------------------------- */}
      <div
        style={{
          opacity: busy ? 0.6 : 1,
          pointerEvents: busy ? "none" : "auto",
        }}
      >
        <NmiPayments
          tokenizationKey={session.tokenizationKey}
          layout="multiLine"
          paymentMethods={["card"]}
          onChange={(data: any) => {
            // Token becomes available when form complete
            if (data?.complete && data?.token) {
              setPaymentToken(data.token);
            }
          }}
        />
      </div>

      {/* -------------------------
           3DS Component (modal)
         ------------------------- */}
      <NmiThreeDSecure
        ref={threeDSRef}
        tokenizationKey={session.tokenizationKey}
        modal={true}
        onComplete={async (result: any) => {
          await chargeWith3DS(result);
        }}
        onFailure={(e: any) => {
          setBusy(false);
          setError(e?.message || "3DS failed");
        }}
      />

      {/* -------------------------
           Pay Button
         ------------------------- */}
      <button
        onClick={startThreeDS}
        disabled={busy || !paymentToken}
        style={{
          marginTop: 16,
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid #111",
          background: "#fff",
          fontWeight: 600,
          cursor: busy || !paymentToken ? "not-allowed" : "pointer",
          opacity: busy || !paymentToken ? 0.6 : 1,
        }}
      >
        {busy ? "Processing…" : "Authenticate (3DS) & Pay"}
      </button>

      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 12 }}>
        This flow forces 3D Secure before charging. Issuer decides whether
        authentication is frictionless or challenge.
      </p>
    </div>
  );
}