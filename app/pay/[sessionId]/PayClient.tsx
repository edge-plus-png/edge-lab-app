"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NmiPayments,
  NmiThreeDSecure,
  type NmiThreeDSecureRef,
} from "@nmipayments/nmi-pay-react";

const LAB_RED = "#DC2626";

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

  async function chargeWith3DS(result: any) {
    if (!paymentToken) {
      setError("Card details not complete yet.");
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

          // 3DS fields from NmiThreeDSecure onComplete
          cardHolderAuth: result?.cardHolderAuth,
          cavv: result?.cavv,
          directoryServerId: result?.directoryServerId,
          eci: result?.eci,
          threeDsVersion: result?.threeDsVersion,
          xid: result?.xid,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");

      router.push(`/result/${sessionId}`);
    } catch (e: any) {
      setError(e?.message || "Payment processing failed");
      setBusy(false);
    }
  }

  function start3DS() {
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
      firstName: "John",
      lastName: "Doe",
    });
  }

  if (error) {
    return (
      <div style={{ padding: 12, background: "#fee2e2", borderRadius: 12, border: "1px solid #fecaca" }}>
        <b>Error:</b> {error}
      </div>
    );
  }

  if (!session) return <p>Loading payment…</p>;

  return (
    <div style={{ position: "relative" }}>
      {/* Overlay while processing */}
      {busy && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            zIndex: 10,
          }}
        >
          <div className="spinner" />
          <p style={{ marginTop: 12, fontWeight: 700 }}>
            Processing secure payment…
          </p>
        </div>
      )}

      <div style={{ opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}>
        <p style={{ marginTop: 0 }}>
          <b>Order:</b> {session.orderRef} — <b>{session.currency}</b> {session.amount}
        </p>

        <NmiPayments
          tokenizationKey={session.tokenizationKey}
          layout="multiLine"
          paymentMethods={["card"]}
          onChange={(data: any) => {
            if (data?.complete && data?.token) setPaymentToken(data.token);
          }}
        />

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

        <button
          onClick={start3DS}
          disabled={!paymentToken || busy}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "14px",
            borderRadius: 12,
            border: "none",
            background: LAB_RED,
            color: "#fff",
            fontWeight: 800,
            fontSize: 16,
            cursor: !paymentToken || busy ? "not-allowed" : "pointer",
            opacity: !paymentToken || busy ? 0.6 : 1,
            transition: "all 0.15s ease",
            boxShadow: !paymentToken || busy ? "none" : "0 10px 22px rgba(220,38,38,0.18)",
          }}
          onMouseEnter={(e) => {
            if (!paymentToken || busy) return;
            e.currentTarget.style.boxShadow =
              "0 12px 28px rgba(220,38,38,0.35), 0 0 0 4px rgba(220,38,38,0.15)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow =
              "0 10px 22px rgba(220,38,38,0.18)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          {busy ? "Processing…" : "Authenticate (3DS) & Pay"}
        </button>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, textAlign: "center" }}>
          Secured by <span style={{ fontWeight: 800 }}>edge+</span>
        </div>

        <p style={{ fontSize: 13, opacity: 0.65, marginTop: 12 }}>
          3D Secure authentication is required before charging.
        </p>
      </div>

      <style jsx>{`
        .spinner {
          width: 36px;
          height: 36px;
          border: 4px solid #eee;
          border-top: 4px solid ${LAB_RED};
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}