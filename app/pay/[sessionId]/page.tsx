import PayClient from "./PayClient";

export default async function PayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const RED = "#DC2626";

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "40px auto",
        fontFamily: "system-ui",
        padding: "0 16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/edge-lab-logo.png"
            alt="edge lab"
            style={{ height: 36 }}
          />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              edge<span style={{ color: RED }}> lab</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              Secure Payment Authentication
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Session: <b>{sessionId}</b>
        </div>
      </div>

      {/* Card container */}
      <div
        style={{
          border: "1px solid #e6e6e6",
          borderRadius: 16,
          padding: 20,
          background: "#fff",
          boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
        }}
      >
        <PayClient sessionId={sessionId} />
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 28,
          textAlign: "center",
          fontSize: 12,
          opacity: 0.6,
        }}
      >
        Powered by <span style={{ fontWeight: 600 }}>edge+</span>
      </div>
    </main>
  );
}