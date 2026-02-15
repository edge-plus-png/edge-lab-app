// proxy.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getTenantFromHost(hostHeader: string) {
  const host = (hostHeader || "").split(":")[0].toLowerCase();

  // Local dev
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1") {
    return "demo";
  }

  // Vercel preview/prod default domains
  if (host.endsWith(".vercel.app")) {
    return "demo";
  }

  // edge-lab.uk subdomains
  const parts = host.split(".");
  const sub = parts[0] || "demo";

  // staging.edge-lab.uk behaves like demo tenant
  if (sub === "staging") return "demo";

  return sub;
}

const ALLOWED_TENANTS = new Set(["demo", "anytime", "nuco", "prismpay", "artisio"]);

export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();

  // 🔒 Store staging isolation (only /store routes)
  if (host === "demo-store-staging.edge-lab.uk") {
    const path = req.nextUrl.pathname;
    if (!path.startsWith("/store")) {
      return NextResponse.redirect(new URL("/store", req.url));
    }
  }

  const slug = getTenantFromHost(host);
  const tenant = ALLOWED_TENANTS.has(slug) ? slug : "demo";

  const res = NextResponse.next();
  res.headers.set("x-edge-lab-tenant", tenant);
  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};