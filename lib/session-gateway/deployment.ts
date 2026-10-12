// Deployment boundary, never inferred from a tenant name or request header.
// Unset retains the existing production release. Phase 2 installs canonical explicitly.
export function canonicalDeployment() {
  const mode = process.env.PAY_LAB_DEPLOYMENT_MODE;
  if (mode && mode !== "canonical" && mode !== "legacy") throw Error("Invalid Lab deployment mode");
  return mode === "canonical";
}
export function canonicalBoundary(host: string, path: string, method: string): Response | null {
  try {
    if (!canonicalDeployment()) return null;
    if (process.env.PAY_LAB_ENVIRONMENT !== "staging" || process.env.VERCEL_ENV === "production")
      throw Error("Canonical acceptance is staging-only");
    // This route is private to Vercel's queue infrastructure in the canonical
    // deployment profile. Its SDK consumer authenticates the platform delivery.
    if (path === "/api/queues/lab-results" && process.env.PAY_LAB_QUEUE_ENABLED === "true")
      return method === "POST" ? null : denied(405, "POST required.");
    const hosts: unknown = JSON.parse(process.env.PAY_LAB_CANONICAL_HOSTS || "[]");
    if (!Array.isArray(hosts) || !hosts.length || hosts.some(h => typeof h !== "string" || !h || h !== h.toLowerCase()))
      throw Error("Configure canonical hosts");
    if (!hosts.includes(host.toLowerCase())) return denied(421, "Unregistered Lab host.");
    if (["/developer", "/developer/guide", "/developer-guide.md", "/developer-client.mjs", "/hosted-ecom-example.mjs", "/hosted-moto-example.mjs", "/hosted-moto-guide.md", "/payment-link-example.mjs", "/payment-link-guide.md", "/developer/payment-links", "/developer/moto", "/api/developer"].includes(path)) return method === "GET" ? null : denied(405, "GET required.");
    if (["/api/developer/ecom","/api/developer/moto","/api/developer/payment-links"].includes(path)) return ["GET", "POST"].includes(method) ? null : denied(405, "GET or POST required.");
    if (path === "/api/developer/callback") return method === "POST" ? null : denied(405, "POST required.");
    if (path === "/developer/login") return method === "GET" ? null : denied(405,"GET required.");
    if (path === "/api/developer/login") return method === "POST" ? null : denied(405,"POST required.");
    const allowed = new Set(["/api/session", "/api/session/status", "/api/session/callback", "/api/session/worker", "/api/session/delivery"]);
    if (allowed.has(path)) return method === "POST" ? null : denied(405, "POST required.");
    if (path === "/" && method === "GET") return Response.json({ service: "GetEdge Pay integration lab", contract: "session-v2", processing: "Prime", sessionEndpoint: "/api/session", message: "Server-signed requests only. Checkout is provided by Prime. No card entry is hosted by Lab." }, { headers: { "cache-control": "no-store" } });
    return denied(404, "This route is not part of the canonical GetEdge Pay integration.");
  } catch { return denied(503, "Canonical Lab deployment is not configured."); }
}
function denied(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
export function rejectLegacyPayment(): Response | null {
  try { return canonicalDeployment() ? denied(410, "Legacy payment execution is disabled. Use the signed session API.") : null; }
  catch { return denied(503, "Lab deployment is not configured."); }
}
