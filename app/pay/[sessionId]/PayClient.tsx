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

  const urlSessionId = typeof params?.sessionId === "string" ? params.sessionId : "";
  const p = search.get("p") || "";
  const session = useMemo(() => (p ? decodeP(p) : null), [p]);

  const threeDSRef = useRef<NmiThreeDSecureRef>(null);

  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [isValid, setIsValid] = useState(false);
  const [paymentToken, setPaymentToken] = useState<string>("");

  const [isBusy, setIsBusy] = useState(false);

  if (!session) {
    return (
      <div style={{ padding: 12, background: "#fee2e2", borderRadius: 12, border: "1px solid #fecaca" }}>
        <b>Error:</b> Missing or invalid payload. (Expected <code>?p=...</code> in URL)
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
          URL sessionId: <b>{urlSessionId || "—"}</b>
        </div>
      </div>
    );
  }

  // ✅ IMPORTANT: capture non-null session for TS (and use s everywhere below)
  const s = session;

  const customer = s.customer || {};
  const firstName = String(customer.firstName || "");
  const lastName = String(customer.lastName || "");
  const email = String(customer.email || "");
  const postalCode = String(customer.postalCode || "");

  async function submitCharge(threeDS: ThreeDSCompleteEvent) {
    setErr(null);
    setOkMsg(null);
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
            address1: customer.address1 || "",
            city: customer.city || "",
            country: customer.country || "",
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

      setOkMsg(
        `${json.status || "approved"} (tx=${json?.gateway?.transaction_id || "n/a"}, eci=${json?.gateway?.eci || "—"})`
      );
    } catch (e: any) {
      setErr(e?.message || "Charge failed");
    } finally {
      setIsBusy(false);
    }
  }

  function start3DS() {
    setErr(null);
    setOkMsg(null);

    if (!isValid || !paymentToken) {
      setErr("Payment details incomplete");
      return;
    }

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

  return (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        Order: {s.orderRef} — {s.currency} {Number(s.amount).toFixed(2)}
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
          setErr(e?.message || "3DS authentication failed");
        }}
        onComplete={(result: any) => {
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
        {isBusy ? "Processing…" : "Pay with 3D Secure"}
      </button>
    </div>
  );
}