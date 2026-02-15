// app/store/page.tsx
"use client";

import { useEffect, useState } from "react";
import { PRODUCTS } from "../_data";
import { addToCart, loadCart } from "../_cart";

const LAB_RED = "#DC2626";

export default function StorePage() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(loadCart().reduce((s, i) => s + i.qty, 0));
  }, []);

  return (
    <main style={{ maxWidth: 980, margin: "34px auto", fontFamily: "system-ui", padding: "0 18px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/edge-lab-logo.png" alt="edge lab" style={{ height: 64 }} />
          <div>
            <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Demo Store</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Add a product → checkout → hosted payment → webhook result.</div>
          </div>
        </div>

        <a
          href="/store/cart"
          style={{
            textDecoration: "none",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            fontWeight: 800,
          }}
        >
          Cart ({count})
        </a>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 16, background: "#fff", overflow: "hidden" }}>
        <div style={{ height: 5, background: LAB_RED }} />
        <div style={{ padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {PRODUCTS.map((p) => (
              <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
                <div style={{ fontWeight: 900 }}>{p.name}</div>
                <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>{p.description}</div>
                <div style={{ marginTop: 10, fontWeight: 800 }}>£{p.price.toFixed(2)}</div>

                <button
                  type="button"
                  onClick={() => {
                    const items = addToCart(p);
                    setCount(items.reduce((s, i) => s + i.qty, 0));
                  }}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    padding: "12px",
                    borderRadius: 12,
                    border: "none",
                    background: LAB_RED,
                    color: "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Add to cart
                </button>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12.5, opacity: 0.7, marginTop: 14 }}>
            Tip: This store simulates what a partner website does before redirecting into hosted checkout.
          </p>
        </div>
      </div>
    </main>
  );
}