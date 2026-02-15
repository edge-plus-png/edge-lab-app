// app/store/checkout/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { CartItem } from "../_cart";
import { cartTotal, loadCart } from "../_cart";

const LAB_RED = "#DC2626";
const SINK_BASE = "https://demo.edge-lab.uk/api/webhook-sink";

export default function CheckoutPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [reference, setReference] = useState("INV-10001");
  const [returnUrl, setReturnUrl] = useState("");
  const [sinkViewerUrl, setSinkViewerUrl] = useState("");

  const [firstName, setFirstName] = useState("John");
  const [lastName, setLastName] = useState("Smith");
  const [email, setEmail] = useState("john@example.com");
  const [postalCode, setPostalCode] = useState("SW1A 1AA");

  useEffect(() => {
    setItems(loadCart());

    // Pull token from URL (used for webhook sink demo)
    const token =
      new URLSearchParams(window.location.search).get("token") || "";

    if (token) {
      const apiUrl = `${SINK_BASE}?token=${encodeURIComponent(token)}`;
      const viewerUrl = `https://demo.edge-lab.uk/webhook-sink?token=${encodeURIComponent(token)}`;

      setReturnUrl(apiUrl);
      setSinkViewerUrl(viewerUrl);
    }
  }, []);

  const total = useMemo(() => cartTotal(items), [items]);

  async function startHostedCheckout() {
    setErr(null);
    setBusy(true);

    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: Number(total.toFixed(2)),
          currency_code: "GBP",
          reference,
          returnUrl: returnUrl || undefined,
          customer: { firstName, lastName, email, postalCode },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create session");

      // Redirect to hosted payment page (payUrl)
      window.location.href = data.payUrl;
    } catch (e: any) {
      setErr(e?.message || "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "34px auto",
        fontFamily: "system-ui",
        padding: "0 18px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/edge-lab-logo.png"
            alt="edge lab"
            style={{ height: 64 }}
          />
          <div>
            <div style={{ fontWeight: 900 }}>Checkout</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Partner flow: POST invoice → redirect to hosted payUrl →
              webhook result.
            </div>
          </div>
        </div>

        <a href="/store/cart" style={{ fontSize: 13, opacity: 0.8 }}>
          ← Back to cart
        </a>
      </div>

      {err && (
        <div
          style={{
            padding: 12,
            background: "#fee2e2",
            borderRadius: 12,
            border: "1px solid #fecaca",
            marginBottom: 12,
          }}
        >
          <b>Error:</b> {err}
        </div>
      )}

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 16,
          background: "#fff",
          overflow: "hidden",
        }}
      >
        <div style={{ height: 5, background: LAB_RED }} />

        <div
          style={{
            padding: 18,
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 18,
          }}
        >
          {/* LEFT SIDE */}
          <div>
            <h3 style={{ marginTop: 0 }}>Invoice / Order</h3>

            <label style={{ fontSize: 13, opacity: 0.8 }}>
              Reference
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              style={inputStyle()}
            />

            <div style={{ fontSize: 12, opacity: 0.75, marginTop: -4 }}>
              edge-lab maps <b>reference</b> → <b>orderRef</b>.
            </div>

            <h3 style={{ marginTop: 18 }}>Customer</h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <input
                style={inputStyle()}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
              <input
                style={inputStyle()}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>

            <input
              style={inputStyle()}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
            <input
              style={inputStyle()}
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="Postcode"
            />

            <h3 style={{ marginTop: 18 }}>
              Return URL (webhook receiver)
            </h3>

            <div
              style={{
                fontSize: 12,
                opacity: 0.75,
                marginBottom: 8,
              }}
            >
              This URL is supplied during onboarding and allow-listed
              for security. After payment, edge-lab will POST the final
              result here automatically.
            </div>

            <input
              style={{
                ...inputStyle(),
                background: "#f6f6f6",
              }}
              value={returnUrl}
              readOnly
            />

            {sinkViewerUrl && (
              <div style={{ marginTop: 6 }}>
                <a
                  href={sinkViewerUrl}
                  target="_blank"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: LAB_RED,
                    textDecoration: "none",
                  }}
                >
                  View received webhook →
                </a>
              </div>
            )}

            <button
              type="button"
              onClick={startHostedCheckout}
              disabled={busy || items.length === 0}
              style={{
                marginTop: 18,
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: LAB_RED,
                color: "#fff",
                fontWeight: 900,
                fontSize: 16,
                cursor:
                  busy || items.length === 0
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  busy || items.length === 0 ? 0.6 : 1,
              }}
            >
              {busy
                ? "Creating session…"
                : "Pay via hosted checkout →"}
            </button>

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                opacity: 0.75,
                textAlign: "center",
              }}
            >
              Secured by{" "}
              <span style={{ fontWeight: 900 }}>edge+</span>
            </div>
          </div>

          {/* RIGHT SIDE */}
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 14,
              padding: 14,
              background: "#fafafa",
            }}
          >
            <div style={{ fontWeight: 900 }}>
              Order summary
            </div>

            <div
              style={{
                marginTop: 10,
                display: "grid",
                gap: 8,
              }}
            >
              {items.length === 0 ? (
                <div style={{ opacity: 0.7 }}>
                  No items in cart.
                </div>
              ) : (
                items.map((it) => (
                  <div
                    key={it.productId}
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      {it.name}{" "}
                      <span
                        style={{ opacity: 0.7 }}
                      >
                        × {it.qty}
                      </span>
                    </div>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      £
                      {(it.price * it.qty).toFixed(
                        2
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <hr
              style={{
                margin: "12px 0",
                border: 0,
                borderTop:
                  "1px solid #eaeaea",
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
              }}
            >
              <div style={{ fontWeight: 900 }}>
                Total
              </div>
              <div style={{ fontWeight: 900 }}>
                £{total.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    margin: "6px 0 12px",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 14,
  };
}