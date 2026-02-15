import ResultClient from "./ResultClient";

const LAB_RED = "#DC2626";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      {/* Branding header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/edge-lab-logo.png" alt="edge-lab" style={{ height: 56 }} />

          {/* Don’t repeat “edge-lab” (logo already does it) */}
          <div>
            <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>Payment Result</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>View outcome, then optionally POST to your Return URL.</div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Session: <b>{sessionId}</b>
          </div>

          {/* Start another test */}
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${LAB_RED}`,
              background: "#fff",
              color: LAB_RED,
              fontSize: 13,
              fontWeight: 800,
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 10px 22px rgba(220,38,38,0.18)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
            title="Back to the main page to create a new session"
          >
            ← Start another test
          </a>
        </div>
      </div>

      <ResultClient sessionId={sessionId} />
    </main>
  );
}