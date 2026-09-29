// Deployment configuration selects domains; protocol routes are explicit.
// This never authenticates a request: the selected route still enforces its
// source signature, callback signature, worker credential or staff credentials.
export function publicSessionBoundary(host: string, path: string, method: string, version: string | null, raw = process.env.PAY_LAB_PUBLIC_SESSION_HOSTS): number | null {
  if (!raw) return null;
  let hosts: unknown;
  try { hosts = JSON.parse(raw); } catch { return 503; }
  if (!Array.isArray(hosts) || hosts.some(h => typeof h !== "string" || !/^[a-z0-9.-]+(?::[0-9]+)?$/.test(h))) return 503;
  if (!hosts.includes(host.toLowerCase())) return null;
  if (path === "/api/session") return method === "POST" && version === "2" ? null : 401;
  if (["/api/session/status", "/api/session/callback", "/api/session/worker"].includes(path)) return method === "POST" ? null : 405;
  if (path === "/collect" && ["GET", "HEAD"].includes(method)) return null;
  if (path.startsWith("/api/pay-lab/")) return null;
  if ((path.startsWith("/_next/") || path === "/favicon.ico") && ["GET", "HEAD"].includes(method)) return null;
  return 404;
}
