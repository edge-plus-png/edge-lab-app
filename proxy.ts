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

// Tenants you recognise publicly
const ALLOWED_TENANTS = new Set(["demo", "anytime", "nuco", "prismpay", "artisio"]);

function isStaticAsset(path: string) {
  return /\.[a-z0-9]+$/i.test(path);
}

/**
 * IMPORTANT:
 * Next.js will run this for every request handled by proxy.ts
 * Default export is the most reliable way to satisfy Turbopack.
 */
export default function proxy(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const slug = getTenantFromHost(host);
  const tenant = ALLOWED_TENANTS.has(slug) ? slug : "demo";

  // 🔒 Store staging isolation
  // Allow only store + necessary app routes to make the demo work end-to-end:
  // - /store... (the demo store)
  // - /api... (session create, webhook sink, etc.)
  // - /pay... and /result... (hosted pay flow + result page)
  // - /webhook-sink... (viewer page)
  // - static assets
  if (host === "demo-store-staging.edge-lab.uk") {
    const path = req.nextUrl.pathname;

    const allow =
      path.startsWith("/store") ||
      path.startsWith("/api") ||
      path.startsWith("/pay") ||
      path.startsWith("/result") ||
      path.startsWith("/webhook-sink") ||
      path.startsWith("/_next") ||
      path === "/favicon.ico" ||
      isStaticAsset(path);

    if (!allow) {
      return NextResponse.redirect(new URL("/store", req.url));
    }
  }

  const res = NextResponse.next();
  res.headers.set("x-edge-lab-tenant", tenant);
  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};