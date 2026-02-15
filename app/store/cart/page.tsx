// app/store/cart/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { cartTotal, clearCart, loadCart, removeFromCart, updateQty, type CartItem } from "../_cart";

const LAB_RED = "#DC2626";

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(loadCart());
  }, []);

  const total = useMemo(() => cartTotal(items), [items]);

  return (
    <main style={{ maxWidth: 980, margin: "34px auto", fontFamily: "system-ui", padding: "0 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/edge-lab-logo.png" alt="edge lab" style={{ height: 64 }} />
          <div>
            <div style={{ fontWeight: 900 }}>Cart</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Review items before checkout.</div>
          </div>
        </div>

        <a href="/store" style={{ fontSize: 13, opacity: 0.8 }}>
          ← Back to store
        </a>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 16, background: "#fff", overflow: "hidden" }}>
        <div style={{ height: 5, background: LAB_RED }} />
        <div style={{ padding: 18 }}>
          {items.length === 0 ? (
            <div style={{ opacity: 0.75 }}>
              No items yet. <a href="/store">Go add a product</a>.
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gap: 12 }}>
                {items.map((it) => (
                  <div key={it.productId} style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{it.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>£{it.price.toFixed(2)} each</div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input
                          type="number"
                          min={1}
                          value={it.qty}
                          onChange={(e) => {
                            const v = Math.max(1, Number(e.target.value || 1));
                            setItems(updateQty(it.productId, v));
                          }}
                          style={{
                            width: 90,
                            padding: "10px 10px",
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            fontSize: 14,
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => setItems(removeFromCart(it.productId))}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, fontWeight: 900 }}>
                      Line total: £{(it.price * it.qty).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid #eee" }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Total: £{total.toFixed(2)}</div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setItems(clearCart())}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    Clear cart
                  </button>

                  <a
                    href="/store/checkout"
                    style={{
                      textDecoration: "none",
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: LAB_RED,
                      color: "#fff",
                      fontWeight: 900,
                    }}
                  >
                    Checkout →
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}