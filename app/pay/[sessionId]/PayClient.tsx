// app/pay/[sessionId]/PayClient.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import {
  NmiPayments,
  NmiThreeDSecure,
  type NmiThreeDSecureRef,
} from "@nmipayments/nmi-pay-react";

type SessionResponse = {
  sessionId: string;
  amount: number;
  currency: string;
  orderRef: string;
  returnUrl: string;
  tokenizationKey: string;
  customer?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    postalCode?: string;
    address1?: string;
    city?: string;
    country?: string;
  };
};

type ThreeDSCompleteEvent = {
  cardHolderAuth: string;
  cavv: string;
  directoryServerId: string;
  eci: string;
  threeDsVersion: string;
  xid: string;
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

  const urlSessionId =
    typeof params?.sessionId === "string" ? params.sessionId : "";
  const p = search.get("p") || "";
  const session = useMemo(() => (p ? decodeP(p) : null), [p]);

  const threeDSRef = useRef<NmiThreeDSecureRef>(null);

  const [err, setErr] = useState<string | null>(null);

  // status banner
  const [status, setStatus] = useState<"approved" | "declined" | "error" | null>(
    null
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [isValid, setIsValid] = useState(false);
  const [paymentToken, setPaymentToken] = useState<string>("");

  const [isBusy, setIsBusy] = useState(false);
  const [isDone, setIsDone] = useState(false);

  if (!session) {
    return (
      <div
        style={{
          padding: 12,
          background: "#fee2e2",
          borderRadius: 12,
          border: "1px solid #fecaca",
        }}
      >
        <b>Error:</b> Missing or invalid payload. (Expected <code>?p=...</code>{" "}
        in URL)
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
          URL sessionId: <b>{urlSessionId || "—"}</b>
        </div>
      </div>
    );
  }

  // capture non-null for TS
  const s = session;

  const customer = s.customer || {};
  const firstName = String(customer.firstName || "");
  const lastName = String(customer.lastName || "");
  const email = String(customer.email || "");
  const postalCode = String(customer.postalCode || "");

  async function submitCharge(threeDS: ThreeDSCompleteEvent) {
    setErr(null);
    setStatus(null);
    setStatusMsg(null);
    setIsBusy(true);

    try {
      const res = await fetch("/api/charge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: s.sessionId,
          orderRef: s.orderRef,
          amount: s.amount,
          currency: s.currency,
          paymentToken,

          customer: {
            firstName,
            lastName,
            email,
            postalCode,
            address1: String(customer.address1 || ""),
            city: String(customer.city || ""),
            country: String(customer.country || ""),
          },

          cardHolderAuth: threeDS.cardHolderAuth,
          cavv: threeDS.cavv,
          directoryServerId: threeDS.directoryServerId,
          eci: threeDS.eci,
          threeDsVersion: threeDS.threeDsVersion,
          xid: threeDS.xid,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(json?.error || "Charge failed");
        return;
      }

      const st: "approved" | "declined" | "error" =
        json?.status === "approved"
          ? "approved"
          : json?.status === "declined"
          ? "declined"
          : "error";

      const tx = json?.gateway?.transaction_id || json?.nmi?.transactionid || "n/a";
      const eciOut = json?.gateway?.eci || "—";

      setStatus(st);
      setStatusMsg(`${st} (tx=${tx}, eci=${eciOut})`);

      // If you only want to hide card fields on APPROVED, change to: if (st === "approved") setIsDone(true)
      setIsDone(true);

      // Clear token after completion (safe)
      setPaymentToken("");
      setIsValid(false);
    } catch (e: any) {
      setErr(e?.message || "Charge failed");
    } finally {
      setIsBusy(false);
    }
  }

  function start3DS() {
    setErr(null);
    setStatus(null);
    setStatusMsg(null);

    if (!isValid || !paymentToken) {
      setErr("Payment details incomplete");
      return;
    }

    // start overlay as soon as 3DS begins
    setIsBusy(true);

    threeDSRef.current?.startThreeDSecure({
      paymentToken,
      currency: s.currency,
      amount: String(Number(s.amount).toFixed(2)),
      firstName: firstName || "Test",
      lastName: lastName || "User",
      email: email || undefined,
      postalCode: postalCode || undefined,
      country: customer.country || undefined,
      address1: customer.address1 || undefined,
      city: customer.city || undefined,
    } as any);
  }

  const showSuccess = status === "approved" && statusMsg;
  const showFailure = (status === "declined" || status === "error") && statusMsg;

  return (
    <div style={{ position: "relative" }}>
      {/* Busy overlay (full-card, blocks interactions) */}
      {isBusy && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.78)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              fontWeight: 800,
              padding: "12px 14px",
              borderRadius: 12,
              background: "#fff",
              border: "1px solid #eee",
              boxShadow: "0 10px 28px rgba(0,0,0,0.10)",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                border: "3px solid #ddd",
                borderTopColor: "#111",
                animation: "spin 0.8s linear infinite",
              }}
            />
            Processing…
          </div>

          <style>{`
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}

      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        Order: {s.orderRef} — {s.currency} {Number(s.amount).toFixed(2)}
      </div>

      {err && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: "#fee2e2",
            borderRadius: 12,
            border: "1px solid #fecaca",
          }}
        >
          <b>Error:</b> {err}
        </div>
      )}

      {showSuccess && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: "#dcfce7",
            borderRadius: 12,
            border: "1px solid #bbf7d0",
          }}
        >
          <b>Success:</b> {statusMsg}
        </div>
      )}

      {showFailure && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: "#fee2e2",
            borderRadius: 12,
            border: "1px solid #fecaca",
          }}
        >
          <b>Error:</b> {statusMsg}
        </div>
      )}

      {/* Hide the card form once done */}
      {!isDone && (
        <>
          <NmiPayments
            tokenizationKey={s.tokenizationKey}
            layout="multiLine"
            paymentMethods={["card"]}
            onChange={(data: any) => {
              setIsValid(!!data?.complete);
              if (data?.complete && data?.token) setPaymentToken(String(data.token));
            }}
          />

          <NmiThreeDSecure
            ref={threeDSRef}
            tokenizationKey={s.tokenizationKey}
            modal={true}
            onFailure={(e: any) => {
              setIsBusy(false);
              setErr(e?.message || "3DS authentication failed");
            }}
            onComplete={(result: any) => {
              // 3DS done; charge next (submitCharge manages busy true/false too)
              submitCharge(result as ThreeDSCompleteEvent);
            }}
          />

          <button
            type="button"
            onClick={start3DS}
            disabled={!isValid || !paymentToken || isBusy}
            style={{
              marginTop: 14,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              cursor: !isValid || !paymentToken || isBusy ? "not-allowed" : "pointer",
              opacity: !isValid || !paymentToken || isBusy ? 0.6 : 1,
            }}
          >
            Pay with 3D Secure
          </button>
        </>
      )}

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        Payment token is created in-browser by the NMI component, 3DS runs, then the token + 3DS fields are posted server-to-server for processing.
      </div>
    </div>
  );
}