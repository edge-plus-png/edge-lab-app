import ResultClient from "./ResultClient";

const LAB_RED = "#DC2626";

export default function ResultPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        fontFamily: "system-ui",
        padding: "34px 16px",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src="/edge-lab-logo.png" alt="edge lab" style={{ height: 64 }} />

            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                Payment Result
              </div>
              <div style={{ fontSize: 12, opacity: 0.65 }}>
                Webhook + JSON available below
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.7, textAlign: "right" }}>
            Session: <b>{sessionId}</b>
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            borderRadius: 18,
            background: "#fff",
            border: "1px solid #eee",
            boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          <div style={{ height: 5, background: LAB_RED }} />
          <div style={{ padding: 22 }}>
            <ResultClient sessionId={sessionId} />
          </div>
        </div>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, opacity: 0.6 }}>
          Powered by <span style={{ fontWeight: 700 }}>edge+</span>
        </div>
      </div>
    </main>
  );
}