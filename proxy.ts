// proxy.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Resolve tenant slug from Host header.
 * Supports:
 * - demo.edge-lab.uk
 * - anytime.edge-lab.uk
 * - staging.edge-lab.uk  (mapped to demo)
 * - localhost:3000 / *.localhost:3000 (mapped to demo)
 * - Vercel preview hosts (*.vercel.app) (mapped to demo unless you override)
 */
function getTenantFromHost(hostHeader: string) {
  const host = (hostHeader || "").split(":")[0].toLowerCase(); // strip port

  // Local dev
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1") {
    return "demo";
  }

  // Vercel preview/prod default domains
  if (host.endsWith(".vercel.app")) {
    return "demo";
  }

  // edge-lab.uk subdomains
  // e.g. staging.edge-lab.uk -> "staging"
  const parts = host.split(".");
  const sub = parts[0] || "demo";

  // staging should behave like demo tenant
  if (sub === "staging") return "demo";

  return sub;
}

// Only tenants you want to recognise publicly.
const ALLOWED_TENANTS = new Set(["demo", "anytime", "nuco", "prismpay", "artisio"]);

export function proxy(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getTenantFromHost(host);

  // If unknown, fall back to demo (safer than erroring at the edge).
  const tenant = ALLOWED_TENANTS.has(slug) ? slug : "demo";

  const res = NextResponse.next();

  // Your app/API can read this header to know which tenant to load.
  res.headers.set("x-edge-lab-tenant", tenant);

  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};