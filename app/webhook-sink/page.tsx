// app/webhook-sink/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

const LAB_RED = "#DC2626";

type Item = {
  id: string;
  receivedAt: number;
  headers: Record<string, string>;
  body: any;
};

export default function WebhookSinkPage() {
  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") || "";
  }, []);

  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/webhook-sink?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load");
      setItems(json.items || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/webhook-sink?token=${encodeURIComponent(token)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to clear");
      setItems([]);
    } catch (e: any) {
      setErr(e?.message || "Failed to clear");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main style={{ maxWidth: 980, margin: "34px auto", fontFamily: "system-ui", padding: "0 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Webhook Sink</h1>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          This page is for testing only. Token required.
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 12, padding: 12, background: "#fee2e2", borderRadius: 12, border: "1px solid #fecaca" }}>
          <b>Error:</b> {err}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={load}
          disabled={busy}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Refresh
        </button>

        <button
          onClick={clearAll}
          disabled={busy}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Clear
        </button>

        <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75 }}>
          Receiver URL:{" "}
          <span style={{ background: "#111", color: "#fff", padding: "2px 6px", borderRadius: 6 }}>
            /api/webhook-sink?token=…
          </span>
        </div>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 16, background: "#fff", overflow: "hidden" }}>
        <div style={{ height: 5, background: LAB_RED }} />
        <div style={{ padding: 14 }}>
          {items.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No payloads received yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {items.map((it) => (
                <div key={it.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800 }}>#{it.id.slice(0, 8)}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{new Date(it.receivedAt).toLocaleString()}</div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(it.body, null, 2))}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Copy body JSON
                    </button>

                    <button
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(it.headers, null, 2))}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Copy headers
                    </button>
                  </div>

                  <pre style={{ marginTop: 10, padding: 12, background: "#0b0b0b", color: "#fff", borderRadius: 12, overflowX: "auto" }}>
                    {JSON.stringify(it.body, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}