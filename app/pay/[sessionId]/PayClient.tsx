// app/pay/[sessionId]/PayClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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

function decodeP(p: string): SessionResponse | null {
  try {
    // base64url -> base64
    let b64 = p.replace(/-/g, "+").replace(/_/g, "/");

    // ✅ add padding (THIS is what was missing)
    while (b64.length % 4) {
      b64 += "=";
    }

    const json = atob(b64);
    const data = safeJsonParse<SessionResponse>(json);

    if (!data?.sessionId || !data?.tokenizationKey) return null;

    return data;
  } catch {
    return null;
  }
}

export default function PayClient({ sessionId }: { sessionId: string }) {
  const search = useSearchParams();
  const p = search.get("p") || "";

  const decoded = useMemo(() => (p ? decodeP(p) : null), [p]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);

  useEffect(() => {
    // ✅ If we have payload in `p`, no need to fetch anything (works without shared storage).
    if (decoded) {
      setSession(decoded);
      setErr(null);
      setLoading(false);
      return;
    }

    // Fallback to API
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

      <div style={{ opacity: 0.75, fontSize: 13 }}>
        (Payment component mounts here using tokenizationKey)
      </div>
    </div>
  );
}