"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type SessionResponse = {
  sessionId: string;
  amount: number;
  currency: string;
  orderRef: string;
  returnUrl: string;
  tokenizationKey: string;
};

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/**
 * Decodes base64url `p` payload into SessionResponse.
 * IMPORTANT: base64 must be padded to multiple of 4, or atob() can fail.
 */
function decodeP(p: string): SessionResponse | null {
  try {
    let b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "="; // ✅ REQUIRED padding

    const json = atob(b64);
    const data = safeJsonParse<SessionResponse>(json);

    if (!data?.sessionId || !data?.tokenizationKey) return null;
    return data;
  } catch {
    return null;
  }
}

export default function PayClient() {
  const params = useParams<{ sessionId?: string }>();
  const search = useSearchParams();

  // sessionId from route /pay/[sessionId]
  const sessionId = typeof params?.sessionId === "string" ? params.sessionId : "";

  // p payload from URL ?p=...
  const p = search.get("p") || "";
  const decoded = useMemo(() => (p ? decodeP(p) : null), [p]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);

  useEffect(() => {
    // ✅ Best path: if `p` exists and decodes, we don't need shared storage at all.
    if (decoded) {
      setSession(decoded);
      setErr(null);
      setLoading(false);
      return;
    }

    // Fallback path: fetch session from API (only works if storage is shared)
    if (!sessionId) {
      setErr("Missing sessionId in URL");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const res = await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load session");

        if (!cancelled) setSession(json);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load session");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, decoded]);

  if (loading) return <div style={{ opacity: 0.7 }}>Loading payment session…</div>;

  if (err) {
    return (
      <div style={{ padding: 12, background: "#fee2e2", borderRadius: 12, border: "1px solid #fecaca" }}>
        <b>Error:</b> {err}
      </div>
    );
  }

  if (!session) return null;

  return (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        Order: {session.orderRef} — {session.currency} {Number(session.amount).toFixed(2)}
      </div>

      {/* Replace this with your real NMI component mount */}
      <div style={{ opacity: 0.75, fontSize: 13 }}>
        (Payment component mounts here using tokenizationKey)
      </div>

      {/* Optional: show whether we came from payload or API */}
      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
        Source: {decoded ? "URL payload (p)" : "API lookup"}
      </div>
    </div>
  );
}