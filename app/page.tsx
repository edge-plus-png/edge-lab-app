"use client";

import { useEffect, useState } from "react";

export default function HomePage() {
  const [tenant, setTenant] = useState<string>(""); // empty on first render (SSR safe)
  const isDemo = tenant === "demo";

  const [amount, setAmount] = useState("10.00");
  const [orderRef, setOrderRef] = useState("ORDER-0000"); // stable SSR value
  const [returnUrl, setReturnUrl] = useState("");
  const [firstName, setFirstName] = useState("John");
  const [lastName, setLastName] = useState("Doe");
  const [email, setEmail] = useState("john@example.com");
  const [postalCode, setPostalCode] = useState("SW1A 1AA");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Button styling (so it’s obvious they’re clickable)
  const btnBase: React.CSSProperties = {
    padding: "10px 12px",
    border: "1px solid #cfcfcf",
    borderRadius: 10,
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: "18px",
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    borderColor: "#111",
    fontWeight: 600,
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

  // Runs only on client after hydration
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

      setInfo(`Return URL test sent successfully (${data.status || "OK"})`);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>
          edge-lab{" "}
          {isDemo && (
            <span
              style={{
                marginLeft: 10,
                padding: "2px 8px",
                borderRadius: 8,
                background: "#fee",
                color: "#900",
                fontSize: 14,
              }}
            >
              DEMO MODE
            </span>
          )}
        </h1>

        <div style={{ fontSize: 13, opacity: 0.8 }}>
          <b>Tenant:</b> {tenant || "…"}
        </div>
      </div>

      <p style={{ marginTop: 10 }}>
        Generic sandbox flow. Create a session, take payment, and send the result to your Return URL.
      </p>

      {error && (
        <div style={{ padding: 10, background: "#fee", borderRadius: 10, marginTop: 12, border: "1px solid #f4bcbc" }}>
          {error}
        </div>
      )}

      {info && (
        <div style={{ padding: 10, background: "#eef7ee", borderRadius: 10, marginTop: 12, border: "1px solid #bfe3bf" }}>
          {info}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button
          type="button"
          onClick={() => setAmount("10.00")}
          disabled={busy}
          style={busy ? { ...btnBase, ...btnDisabled } : btnBase}
          title="Sets a typical amount (often used for an approval path)"
        >
          Set: Approve (10.00)
        </button>

        <button
          type="button"
          onClick={() => setAmount("10.01")}
          disabled={busy}
          style={busy ? { ...btnBase, ...btnDisabled } : btnBase}
          title="Sets a slightly different amount (often used for a decline path)"
        >
          Set: Decline (10.01)
        </button>

        <button
          type="button"
          onClick={() => setAmount("0.00")}
          disabled={busy}
          style={busy ? { ...btnBase, ...btnDisabled } : btnBase}
          title="Sets an invalid amount (often used to simulate an error path)"
        >
          Set: Error (0.00)
        </button>

        <button
          type="button"
          onClick={() => {
            setOrderRef(`ORDER-${Math.floor(Math.random() * 10000)}`);
            setInfo("New orderRef generated.");
          }}
          disabled={busy}
          style={busy ? { ...btnBase, ...btnDisabled } : btnBase}
          title="Generate a new order reference"
        >
          New Order Ref
        </button>
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h3 style={{ marginTop: 0 }}>Order</h3>
      <label>Amount (GBP)</label>
      <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />

      <label>Order Ref</label>
      <input style={inputStyle} value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />

      <h3 style={{ marginTop: 18 }}>Customer (recommended)</h3>
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

      <h3 style={{ marginTop: 18 }}>Return URL</h3>
      <input
        style={inputStyle}
        placeholder="https://your-staging-site/return"
        value={returnUrl}
        onChange={(e) => setReturnUrl(e.target.value)}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          style={busy ? { ...btnPrimary, ...btnDisabled, minWidth: 240 } : { ...btnPrimary, minWidth: 240 }}
          onClick={create}
          disabled={busy}
          title="Creates a payment session and opens the hosted payment page"
        >
          {busy ? "Working..." : "Create session & go to payment"}
        </button>

        <button
          style={busy || !returnUrl ? { ...btnBase, ...btnDisabled } : btnBase}
          type="button"
          onClick={testReturnUrl}
          disabled={busy || !returnUrl}
          title="Sends a sample payload to your Return URL to confirm it can receive results"
        >
          Test Return URL
        </button>
      </div>

      <p style={{ fontSize: 13, opacity: 0.75, marginTop: 12 }}>
        Tip: Use <code>demo.localhost:3000</code> as your generic demo tenant.
      </p>
    </main>
  );
}