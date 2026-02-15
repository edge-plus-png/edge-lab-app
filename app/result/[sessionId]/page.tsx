import ResultClient from "./ResultClient";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      {/* Branding header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Put your logo at /public/edge-lab-logo.png */}
          {/* If you haven’t added it yet, this will just show broken image until you do */}
          <img src="/edge-lab-logo.png" alt="edge-lab" style={{ height: 34 }} />
          <div>
            <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>edge-lab</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Payment Result</div>
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Session: <b>{sessionId}</b>
        </div>
      </div>

      <ResultClient sessionId={sessionId} />
    </main>
  );
}