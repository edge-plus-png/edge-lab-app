"use client";

import { useEffect, useMemo, useState } from "react";

type ApiResult = {
  session: {
    sessionId: string;
    orderRef: string;
    amount: number;
    currency: string;
    returnUrl: string;
    createdAt: number;
  };
  result: null | {
    resultId: string;
    status: "approved" | "declined" | "error";
    createdAt: number;
    gateway: {
      transactionId?: string;
      message?: string;
      responseCode?: string;
      authCode?: string;
      avs?: string;
      cvv?: string;
      eci?: string;
      cavv?: string;
      threeDsVersion?: string;
    };
    raw?: unknown;
  };
  callbackLogs: Array<{
    id: string;
    createdAt: number;
    source: "charge" | "return-url-test" | "result-resend";
    returnUrl: string;
    request: {
      headers: Record<string, string>;
      body: unknown;
    };
    response?: {
      ok: boolean;
      status: number;
      headers: Record<string, string>;
      body: string;
    };
    error?: string;
  }>;
};

export default function ResultClient({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<ApiResult | null>(null);
  const [returnUrl, setReturnUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const statusStyle = useMemo(() => {
    const s = data?.result?.status;
    if (s === "approved") return { bg: "#eef7ee", border: "#bfe3bf" };
    if (s === "declined") return { bg: "#fff6e6", border: "#ffd08a" };
    if (s === "error") return { bg: "#fee", border: "#f4bcbc" };
    return { bg: "#f6f6f6", border: "#e2e2e2" };
  }, [data?.result?.status]);

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
    fontWeight: 700,
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

  function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }

  async function load() {
    setError(null);
    try {
      const res = await fetch(`/api/result?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load result");
      setData(json);

      // prefill returnUrl if stored on the session
      if (json?.session?.returnUrl && !returnUrl) setReturnUrl(json.session.returnUrl);
    } catch (error: unknown) {
      setError(errorMessage(error, "Failed to load result"));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
            status: data?.result?.status || "approved",
            resultId: data?.result?.resultId || "test-123",
            sessionId,
            orderRef: data?.session?.orderRef || "ORDER-TEST",
            amount: data?.session?.amount || 10,
            currency: data?.session?.currency || "GBP",
            gateway: data?.result?.gateway || {},
          },
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Return URL test failed");

      setInfo(`Return URL test sent (${json.statusCode || json.status || "OK"})`);
    } catch (error: unknown) {
      setError(errorMessage(error, "Return URL test failed"));
    } finally {
      setBusy(false);
    }
  }

  async function resendResult() {
    setError(null);
    setInfo(null);

    if (!returnUrl) {
      setError("Enter a Return URL first.");
      return;
    }
    if (!data?.result?.resultId) {
      setError("No result yet. Complete a payment first.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/result-resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          returnUrl,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Resend failed");

      setInfo(`Result sent (${json.statusCode || "OK"})`);
    } catch (error: unknown) {
      setError(errorMessage(error, "Resend failed"));
    } finally {
      setBusy(false);
    }
  }

  const result = data?.result;
  const gw = result?.gateway || {};
  const callbackLogs = data?.callbackLogs || [];

  return (
    <div>
      {error && (
        <div style={{ padding: 12, background: "#fee", borderRadius: 10, border: "1px solid #f4bcbc", marginBottom: 12 }}>
          <b>Error:</b> {error}
        </div>
      )}

      {info && (
        <div style={{ padding: 12, background: "#eef7ee", borderRadius: 10, border: "1px solid #bfe3bf", marginBottom: 12 }}>
          {info}
        </div>
      )}

      <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${statusStyle.border}`, background: statusStyle.bg }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Result</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {result ? result.status.toUpperCase() : "PENDING"}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Order</div>
            <div style={{ fontWeight: 700 }}>
              {data?.session?.orderRef} — {data?.session?.currency} {data?.session?.amount}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <KV label="Transaction ID" value={gw.transactionId} />
            <KV label="Response" value={gw.message || gw.responseCode} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <KV label="ECI" value={gw.eci} />
            <KV label="CAVV" value={gw.cavv} />
            <KV label="3DS Version" value={gw.threeDsVersion} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <KV label="Auth Code" value={gw.authCode} />
            <KV label="AVS" value={gw.avs} />
            <KV label="CVV" value={gw.cvv} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={load} disabled={busy} style={busy ? { ...btnBase, ...btnDisabled } : btnBase}>
              Refresh
            </button>

            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
              disabled={!data || busy}
              style={!data || busy ? { ...btnBase, ...btnDisabled } : btnBase}
              title="Copy the full result JSON (session + gateway fields)"
            >
              Copy JSON
            </button>
          </div>
        </div>
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h3 style={{ margin: "0 0 6px" }}>Return URL (optional)</h3>
      <input
        style={inputStyle}
        placeholder="https://your-staging-site/return"
        value={returnUrl}
        onChange={(e) => setReturnUrl(e.target.value)}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={testReturnUrl}
          disabled={busy || !returnUrl}
          style={busy || !returnUrl ? { ...btnBase, ...btnDisabled } : btnBase}
        >
          Test Return URL
        </button>

        <button
          type="button"
          onClick={resendResult}
          disabled={busy || !returnUrl || !result}
          style={busy || !returnUrl || !result ? { ...btnPrimary, ...btnDisabled } : btnPrimary}
          title={!result ? "Complete a payment first" : "Send the real stored result to the Return URL"}
        >
          Send / Resend Result
        </button>
      </div>

      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 10 }}>
        “Test Return URL” sends a sample payload. “Send/Resend Result” sends the real stored gateway result (ECI/CAVV/3DS version included).
      </p>

      <hr style={{ margin: "18px 0" }} />

      <h3 style={{ margin: "0 0 10px" }}>Callback Delivery Log</h3>
      {callbackLogs.length === 0 ? (
        <div style={{ padding: 12, borderRadius: 10, border: "1px solid #e6e6e6", background: "#fafafa", fontSize: 13, opacity: 0.75 }}>
          No callback deliveries logged for this session yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {callbackLogs.map((item) => (
            <div key={item.id} style={{ border: "1px solid #e6e6e6", borderRadius: 12, background: "#fff", padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>
                  {item.source} to {item.returnUrl}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {new Date(item.createdAt).toLocaleString()}
                </div>
              </div>

              <div style={{ fontSize: 13, marginBottom: 8 }}>
                {item.error ? (
                  <span style={{ color: "#b91c1c", fontWeight: 700 }}>Delivery failed: {item.error}</span>
                ) : (
                  <span style={{ fontWeight: 700 }}>
                    Response: {item.response?.status} {item.response?.ok ? "OK" : "Not OK"}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Request body</div>
                  <pre style={preStyle}>{JSON.stringify(item.request.body, null, 2)}</pre>
                </div>

                {!item.error && (
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Response body</div>
                    <pre style={preStyle}>{item.response?.body || "Empty response body"}</pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ padding: 10, border: "1px solid #e6e6e6", borderRadius: 10, background: "#fff" }}>
      <div style={{ fontSize: 12, opacity: 0.65 }}>{label}</div>
      <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{value || "—"}</div>
    </div>
  );
}

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ececec",
  background: "#fafafa",
  fontSize: 12,
  lineHeight: "18px",
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};
