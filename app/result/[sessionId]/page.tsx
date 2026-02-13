"use client";

import { useEffect, useState } from "react";

export default function ResultPage({ params }: { params: { sessionId: string } }) {
  const [data, setData] = useState<any>(null);
  const [returnUrl, setReturnUrl] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/pay?sessionId=${encodeURIComponent(params.sessionId)}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setReturnUrl(d.returnUrl || "");
      });
  }, [params.sessionId]);

  async function testUrl() {
    setMsg("");
    const res = await fetch("/api/return-url-test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnUrl }),
    });
    const d = await res.json();
    setMsg(res.ok ? `Test: ${d.ok ? "OK" : "Failed"} (HTTP ${d.statusCode || "?"})` : `Test error: ${d.error}`);
  }

  async function resend() {
    if (!data?.resultId) return;
    setMsg("");
    const res = await fetch("/api/result-resend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resultId: data.resultId, returnUrl }),
    });
    const d = await res.json();
    setMsg(res.ok ? `Resend: ${d.ok ? "OK" : "Failed"} (HTTP ${d.statusCode || "?"})` : `Resend error: ${d.error}`);
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Result</h1>

      {!data && <p>Loading…</p>}

      {data && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <div><b>Status:</b> {data.status}</div>
          <div><b>OrderRef:</b> {data.orderRef}</div>
          <div><b>Amount:</b> {data.amount} {data.currency}</div>
          <div><b>ResultId:</b> {data.resultId}</div>
          {data.gateway?.transactionId && <div><b>Txn:</b> {data.gateway.transactionId}</div>}
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>{data.note}</div>
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Return URL (optional)</h3>
      <input style={{ width: "100%", marginBottom: 12 }} value={returnUrl} onChange={(e) => setReturnUrl(e.target.value)} />

      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ flex: 1, padding: 10 }} onClick={testUrl}>Test Return URL</button>
        <button style={{ flex: 1, padding: 10 }} onClick={resend} disabled={!data?.resultId}>Send / Resend Result</button>
      </div>

      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </main>
  );
}