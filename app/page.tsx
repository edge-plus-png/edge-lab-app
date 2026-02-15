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

  const isDemo = tenant === "demo";

  // Basic styles
  const btnBase: React.CSSProperties = {
    padding: "10px 12px",
    border: "1px solid #d0d0d0",
    borderRadius: 12,
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: "18px",
  };

  const btnDisabled: React.CSSProperties = {
    opacity: 0.55,
    cursor: "not-allowed",
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    background: LAB_RED,
    borderColor: LAB_RED,
    color: "#fff",
    fontWeight: 800,
    padding: "12px 14px",
    minWidth: 280,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    margin: "6px 0 12px",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 14,
    outlineColor: LAB_RED,
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #eee",
    borderRadius: 16,
    padding: 18,
    background: "#fff",
  };

  useEffect(() => {
    const t = window.location.hostname.split(".")[0] || "";
    setTenant(t);
    setOrderRef(`ORDER-${Math.floor(Math.random() * 10000)}`);
  }, []);

  function newOrderRef() {
    setOrderRef(`ORDER-${Math.floor(Math.random() * 10000)}`);
    setInfo("New orderRef generated.");
  }

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

      setInfo(`Return URL test sent (${data.statusCode || data.status || "OK"})`);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: "34px auto", fontFamily: "system-ui", padding: "0 18px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Put your logo in /public/edge-lab-logo.png */}
          <img src="/edge-lab-logo.png" alt="edge lab" style={{ height: 34 }} />
          <div>
            {/* Don’t repeat “edge lab” here — logo already covers it */}
            <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>Payment & 3DS Testing Environment</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Create a session, complete 3DS, and optionally POST results to your Return URL.</div>
          </div>

          {isDemo && (
            <span
              style={{
                marginLeft: 8,
                padding: "4px 10px",
                borderRadius: 999,
                background: "#fee2e2",
                color: "#991b1b",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              DEMO
            </span>
          )}
        </div>

        <div style={{ fontSize: 13, opacity: 0.85 }}>
          Tenant: <b>{tenant || "…"}</b>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ padding: 12, background: "#fee2e2", borderRadius: 12, marginBottom: 12, border: "1px solid #fecaca" }}>
          <b>Error:</b> {error}
        </div>
      )}
      {info && (
        <div style={{ padding: 12, background: "#ecfdf5", borderRadius: 12, marginBottom: 12, border: "1px solid #bbf7d0" }}>
          {info}
        </div>
      )}

      <div style={cardStyle}>
        {/* Quick actions (restored) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button type="button" onClick={() => setAmount("10.00")} disabled={busy} style={busy ? { ...btnBase, ...btnDisabled } : btnBase}>
            Approve (10.00)
          </button>

          <button type="button" onClick={() => setAmount("10.01")} disabled={busy} style={busy ? { ...btnBase, ...btnDisabled } : btnBase}>
            Decline (10.01)
          </button>

          <button type="button" onClick={() => setAmount("0.00")} disabled={busy} style={busy ? { ...btnBase, ...btnDisabled } : btnBase}>
            Error (0.00)
          </button>

          <button type="button" onClick={newOrderRef} disabled={busy} style={busy ? { ...btnBase, ...btnDisabled } : btnBase}>
            New Order Ref
          </button>
        </div>

        <hr style={{ margin: "14px 0", border: 0, borderTop: "1px solid #eee" }} />

        {/* Form */}
        <h3 style={{ margin: "0 0 8px" }}>Order</h3>
        <label>Amount (GBP)</label>
        <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />

        <label>Order Ref</label>
        <input style={inputStyle} value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />

        <h3 style={{ margin: "14px 0 8px" }}>Customer</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input style={{ ...inputStyle, margin: 0 }} placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input style={{ ...inputStyle, margin: 0 }} placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>

        <input style={inputStyle} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={inputStyle} placeholder="Postcode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />

        <h3 style={{ margin: "14px 0 8px" }}>Return URL (optional)</h3>
        <input style={inputStyle} placeholder="https://your-site/return" value={returnUrl} onChange={(e) => setReturnUrl(e.target.value)} />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <button
            style={busy ? { ...btnPrimary, ...btnDisabled } : btnPrimary}
            onClick={create}
            disabled={busy}
            title="Creates a session and opens the hosted payment page"
          >
            {busy ? "Working..." : "Create session & go to payment"}
          </button>

          <button
            style={busy || !returnUrl ? { ...btnBase, ...btnDisabled } : btnBase}
            type="button"
            onClick={testReturnUrl}
            disabled={busy || !returnUrl}
            title="Send a sample payload to your Return URL"
          >
            Test Return URL
          </button>
        </div>

        <p style={{ fontSize: 12.5, opacity: 0.7, marginTop: 10 }}>
          Local tip: <code>demo.localhost:3000</code> is for local development only. For real 3DS + gateway testing, use staging.
        </p>
      </div>
    </main>
  );
}