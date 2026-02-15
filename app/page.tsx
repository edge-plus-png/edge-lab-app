"use client";

import { useEffect, useState } from "react";

export default function HomePage() {
  const [tenant, setTenant] = useState<string>("");
  const isDemo = tenant === "demo";

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

  const RED = "#DC2626";

  const btnBase: React.CSSProperties = {
    padding: "10px 12px",
    border: "1px solid #cfcfcf",
    borderRadius: 10,
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
  };

  const btnPrimary: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 10,
    border: `1px solid ${RED}`,
    background: RED,
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  const btnDisabled: React.CSSProperties = {
    opacity: 0.55,
    cursor: "not-allowed",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    margin: "6px 0 12px",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    fontSize: 14,
  };

  useEffect(() => {
    const t = window.location.hostname.split(".")[0] || "";
    setTenant(t);
    setOrderRef(`ORDER-${Math.floor(Math.random() * 10000)}`);
  }, []);

  async function create() {
    setError(null);
    setInfo(null);
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

  async function testReturnUrl() {
    setError(null);
    setInfo(null);

    if (!returnUrl) {
      setError("Enter a Return URL first.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/return-url-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          returnUrl,
          sampleResult: {
            status: "approved",
            resultId: "test-123",
            orderRef,
            amount: Number(amount),
            currency: "GBP",
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Return URL test failed");
        return;
      }

      setInfo(`Return URL test sent successfully`);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "40px auto",
        fontFamily: "system-ui",
        padding: "0 16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/edge-lab-logo.png" alt="edge lab" style={{ height: 36 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              edge<span style={{ color: RED }}> lab</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              Payment & 3DS Testing Environment
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13, opacity: 0.7 }}>
          Tenant: <b>{tenant || "…"}</b>
          {isDemo && (
            <span
              style={{
                marginLeft: 10,
                padding: "2px 8px",
                borderRadius: 8,
                background: "#fee",
                color: RED,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              DEMO
            </span>
          )}
        </div>
      </div>

      <p style={{ marginBottom: 20, opacity: 0.8 }}>
        Create a payment session, complete a real 3DS authentication, and send the result to your Return URL.
      </p>

      {error && (
        <div
          style={{
            padding: 12,
            background: "#fee",
            borderRadius: 10,
            border: `1px solid ${RED}`,
            marginBottom: 16,
          }}
        >
          <b>Error:</b> {error}
        </div>
      )}

      {info && (
        <div
          style={{
            padding: 12,
            background: "#eef7ee",
            borderRadius: 10,
            border: "1px solid #bfe3bf",
            marginBottom: 16,
          }}
        >
          {info}
        </div>
      )}

      {/* Order */}
      <h3>Order</h3>
      <label>Amount (GBP)</label>
      <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />

      <label>Order Ref</label>
      <input style={inputStyle} value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />

      {/* Customer */}
      <h3 style={{ marginTop: 20 }}>Customer</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input
          style={{ ...inputStyle, margin: 0 }}
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <input
          style={{ ...inputStyle, margin: 0 }}
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>

      <input
        style={{ ...inputStyle, marginTop: 8 }}
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        style={{ ...inputStyle, marginTop: 8 }}
        placeholder="Postcode"
        value={postalCode}
        onChange={(e) => setPostalCode(e.target.value)}
      />

      {/* Return URL */}
      <h3 style={{ marginTop: 20 }}>Return URL (optional)</h3>
      <input
        style={inputStyle}
        placeholder="https://your-site/return"
        value={returnUrl}
        onChange={(e) => setReturnUrl(e.target.value)}
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          style={busy ? { ...btnPrimary, ...btnDisabled } : btnPrimary}
          onClick={create}
          disabled={busy}
        >
          {busy ? "Working..." : "Create session & go to payment"}
        </button>

        <button
          style={busy || !returnUrl ? { ...btnBase, ...btnDisabled } : btnBase}
          onClick={testReturnUrl}
          disabled={busy || !returnUrl}
        >
          Test Return URL
        </button>
      </div>

      <p style={{ fontSize: 13, opacity: 0.6, marginTop: 18 }}>
        Tip: Use <code>demo.localhost:3000</code> as your generic demo tenant.
      </p>
    </main>
  );
}