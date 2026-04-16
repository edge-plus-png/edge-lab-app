"use client";

import { useEffect, useState } from "react";
import { ARTISIO_STAGING_CALLBACK_URL } from "@/lib/artisio";

const LAB_RED = "#DC2626";
const TEST_CARDS: Array<{ name: string; number?: string }> = [
  { name: "Successful Frictionless", number: "4000000000002701" },
  { name: "Failed Frictionless", number: "4000000000002925" },
  { name: "Attempted Frictionless", number: "4000000000002719" },
  { name: "Unavailable Authentication", number: "4000000000002313" },
  { name: "Rejected Authentication", number: "4000000000002537" },
  { name: "Unknown Error", number: "4000000000002990" },
  { name: "Timeout Error", number: "4000000000002354" },
  { name: "Successful Step Up", number: "4000000000002503" },
  { name: "Failed Step Up" },
  { name: "Unavailable Step Up", number: "4000000000002420" },
  { name: "Error on Authentication", number: "4000000000002644" },
];

export default function HomePage() {
  const [tenant, setTenant] = useState<string>("");
  const [intent, setIntent] = useState<"payment" | "card_verification">("payment");
  const [amount, setAmount] = useState("10.00");
  const [orderRef, setOrderRef] = useState("ORDER-0000");
  const [returnUrl, setReturnUrl] = useState("");
  const [successUrl, setSuccessUrl] = useState("");
  const [failUrl, setFailUrl] = useState("");
  const [cancelUrl, setCancelUrl] = useState("");
  const [firstName, setFirstName] = useState("John");
  const [lastName, setLastName] = useState("Doe");
  const [email, setEmail] = useState("john@example.com");
  const [postalCode, setPostalCode] = useState("SW1A 1AA");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.location.hostname.split(".")[0] || "";
    setTenant(t);
    setOrderRef(`ORDER-${Math.floor(Math.random() * 10000)}`);
    setReturnUrl(t === "artisio" ? ARTISIO_STAGING_CALLBACK_URL : "");
  }, []);

  useEffect(() => {
    if (intent === "card_verification") {
      setAmount("1.00");
    }
  }, [intent]);

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

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unexpected error";
  }

  async function create() {
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent,
          amount: Number(amount),
          currency: "GBP",
          orderRef,
          returnUrl: returnUrl || undefined,
          successUrl: successUrl || undefined,
          failUrl: failUrl || undefined,
          cancelUrl: cancelUrl || undefined,
          customer: { firstName, lastName, email, postalCode },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create session");
        return;
      }

      window.location.href = data.payUrl;
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const isArtisio = tenant === "artisio";
  const isVerification = intent === "card_verification";

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
            Customer completes <b>3DS + {isVerification ? "verification" : "payment"}</b>.
          </li>
          <li>
            If a Return URL was provided, edge-lab automatically <b>POSTs the final result</b> to it.
            {isVerification ? " Approved verification sessions are reversed automatically." : ""}
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

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 16,
          background: "#fff",
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div style={{ height: 4, background: LAB_RED }} />
        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>NMI 3DS Test Cards</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
            Use valid future expiry and 3-digit CVC. For latest scenarios, use the official NMI testing docs.
          </div>
          <a
            href="https://docs.nmi.com/docs/testing"
            target="_blank"
            rel="noreferrer"
            style={{ color: LAB_RED, fontWeight: 700, textDecoration: "none", fontSize: 13 }}
          >
            Open NMI test documentation →
          </a>
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {TEST_CARDS.map((card) => (
              <div
                key={card.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "#fafafa",
                  border: "1px solid #f1f1f1",
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 600 }}>{card.name}</span>
                <code style={{ fontSize: 12 }}>{card.number || "See NMI docs"}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <h3>Flow</h3>
      <label>Intent</label>
      <select
        style={inputStyle}
        value={intent}
        onChange={(e) => setIntent(e.target.value as "payment" | "card_verification")}
      >
        <option value="payment">Standard payment</option>
        <option value="card_verification">Card verification (£1 and reverse)</option>
      </select>

      <h3>Order</h3>
      <label>Amount (GBP)</label>
      <input
        style={{ ...inputStyle, background: isVerification ? "#f8fafc" : "#fff" }}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        readOnly={isVerification}
      />

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
      {isArtisio && (
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: -4, marginBottom: 12 }}>
          Artisio lab defaults to the staging callback URL first. The live callback URL is allow-listed separately.
        </div>
      )}

      <h3>Partner Redirects (optional)</h3>
      <input
        style={inputStyle}
        placeholder="https://your-site/success"
        value={successUrl}
        onChange={(e) => setSuccessUrl(e.target.value)}
      />
      <input
        style={inputStyle}
        placeholder="https://your-site/fail"
        value={failUrl}
        onChange={(e) => setFailUrl(e.target.value)}
      />
      <input
        style={inputStyle}
        placeholder="https://your-site/cancel"
        value={cancelUrl}
        onChange={(e) => setCancelUrl(e.target.value)}
      />

      <button onClick={create} style={btnPrimary} disabled={busy}>
        {busy
          ? "Creating session…"
          : isVerification
          ? "Create verification session & go to hosted check"
          : "Create session & go to payment"}
      </button>

      {error && (
        <div style={{ marginTop: 12, color: "red" }}>
          {error}
        </div>
      )}
    </main>
  );
}
