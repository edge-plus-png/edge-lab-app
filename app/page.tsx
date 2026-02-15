"use client";

import { useEffect, useState } from "react";

const LAB_RED = "#DC2626";

export default function HomePage() {
  const [tenant, setTenant] = useState<string>("");
  const [amount, setAmount] = useState("10.00");
  const [orderRef, setOrderRef] = useState("ORDER-0000");
  const [returnUrl, setReturnUrl] = useState("");
  const [firstName, setFirstName] = useState("John");
  const [lastName, setLastName] = useState("Doe");
  const [email, setEmail] = useState("john@example.com");
  const [postalCode, setPostalCode] = useState("SW1A 1AA");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.location.hostname.split(".")[0] || "";
    setTenant(t);
    setOrderRef(`ORDER-${Math.floor(Math.random() * 10000)}`);
  }, []);

  const btnPrimary: React.CSSProperties = {
    background: LAB_RED,
    border: "1px solid " + LAB_RED,
    color: "#fff",
    fontWeight: 800,
    padding: "12px 16px",
    borderRadius: 12,
    cursor: "pointer",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    margin: "6px 0 12px",
    padding: "12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 14,
  };

  async function create() {
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          currency: "GBP",
          orderRef,
          returnUrl: returnUrl || undefined,
          customer: { firstName, lastName, email, postalCode },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create session");
        return;
      }

      window.location.href = data.payUrl;
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  const isArtisio = tenant === "artisio";

  return (
    <main style={{ maxWidth: 980, margin: "40px auto", fontFamily: "system-ui", padding: "0 18px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <img src="/edge-lab-logo.png" alt="edge lab" style={{ height: 56 }} />
          <div>
            <div style={{ fontWeight: 800 }}>Payment & 3DS Testing Environment</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              Hosted checkout + inline component testing
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          Tenant: <b>{tenant}</b>
        </div>
      </div>

      {/* How it works */}
      <div style={{
        padding: 16,
        borderRadius: 16,
        background: "#fafafa",
        border: "1px solid #eee",
        marginBottom: 20
      }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          How hosted checkout works
        </div>

        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: "22px" }}>
          <li>
            Your server <b>POSTs</b> order data to <b>/api/session</b>
            (amount, currency{isArtisio ? ", reference" : ", orderRef"}).
          </li>
          <li>
            edge-lab returns a <b>payUrl</b> — redirect the customer to it.
          </li>
          <li>
            Customer completes <b>3DS + payment</b>.
          </li>
          <li>
            If a Return URL was provided, edge-lab automatically <b>POSTs the final result</b> to it.
          </li>
        </ol>

        {isArtisio && (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
            Artisio mapping: <b>reference</b> = <b>orderRef</b>
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
          Inline option: you can also embed the NMI Payment Component directly in your checkout instead of redirecting.
        </div>
      </div>

      {/* Form */}
      <h3>Order</h3>
      <label>Amount (GBP)</label>
      <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />

      <label>{isArtisio ? "Reference" : "Order Ref"}</label>
      <input style={inputStyle} value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />

      <h3>Customer</h3>
      <input style={inputStyle} placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      <input style={inputStyle} placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      <input style={inputStyle} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input style={inputStyle} placeholder="Postcode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />

      <h3>Return URL (optional)</h3>
      <input
        style={inputStyle}
        placeholder="https://your-site/return"
        value={returnUrl}
        onChange={(e) => setReturnUrl(e.target.value)}
      />

      <button onClick={create} style={btnPrimary} disabled={busy}>
        {busy ? "Creating session…" : "Create session & go to payment"}
      </button>

      {error && (
        <div style={{ marginTop: 12, color: "red" }}>
          {error}
        </div>
      )}
    </main>
  );
}