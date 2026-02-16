// proxy.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getTenantFromHost(hostHeader: string) {
  const host = (hostHeader || "").split(":")[0].toLowerCase();

  // Local dev
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) return "demo";

  // Vercel preview/prod default domains
  if (host.endsWith(".vercel.app")) return "demo";

  // Force store domains to behave like demo tenant
  if (host === "demo-store-staging.edge-lab.uk") return "demo";
  if (host === "demo-store.edge-lab.uk") return "demo";

  // staging.edge-lab.uk behaves like demo
  const sub = host.split(".")[0] || "demo";
  if (sub === "staging") return "demo";

  return sub;
}

const ALLOWED_TENANTS = new Set(["demo", "anytime", "nuco", "prismpay", "artisio"]);

function isStaticAsset(path: string) {
  return /\.[a-z0-9]+$/i.test(path);
}

/**
 * Next.js proxy.ts:
 * MUST export default function (Turbopack is strict here)
 * and if we want routes to "see" a header, we must set it on the REQUEST.
 */
export default function proxy(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const slug = getTenantFromHost(host);
  const tenant = ALLOWED_TENANTS.has(slug) ? slug : "demo";

  // 🔒 Store staging isolation (ONLY redirect page routes)
  if (host === "demo-store-staging.edge-lab.uk") {
    const path = req.nextUrl.pathname;

    const allow =
      path.startsWith("/store") ||
      path.startsWith("/api") ||
      path.startsWith("/_next") ||
      path === "/favicon.ico" ||
      isStaticAsset(path);

    if (!allow) {
      return NextResponse.redirect(new URL("/store", req.url));
    }
  }

  // ✅ IMPORTANT: inject tenant into the REQUEST headers so route handlers can read it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-edge-lab-tenant", tenant);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};