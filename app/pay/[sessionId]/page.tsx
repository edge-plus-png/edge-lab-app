import PayClient from "./PayClient";

export default async function PayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <h1>Hosted payment</h1>
      <p>
        <b>Session:</b> {sessionId}
      </p>

      <PayClient sessionId={sessionId} />
    </main>
  );
}