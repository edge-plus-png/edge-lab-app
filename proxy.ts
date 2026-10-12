import { publicEcomConfiguration } from './lib/developer-ecom/public-access';
import { consumerConfiguration } from './lib/developer-ecom/consumer-config';
// proxy.ts
import { developerSource, developerChallenge } from "./lib/session-gateway/developer";
import { authorized, getConfig } from "./lib/pay-lab/config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { canonicalBoundary, canonicalDeployment } from "./lib/session-gateway/deployment";

function getTenantFromHost(hostHeader: string) {
  const host = (hostHeader || "").split(":")[0].toLowerCase();

  // Local dev
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost")
  )
    return "demo";

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

const ALLOWED_TENANTS = new Set([
  "demo",
  "anytime",
  "nuco",
  "prismpay",
  "artisio",
]);

function isStaticAsset(path: string) {
  return /\.[a-z0-9]+$/i.test(path);
}

/**
 * Next.js proxy.ts:
 * MUST export default function (Turbopack is strict here)
 * and if we want routes to "see" a header, we must set it on the REQUEST.
 */
export default function proxy(req: NextRequest) {
  const boundary = canonicalBoundary(req.headers.get("host") || "", req.nextUrl.pathname, req.method);
  if (boundary) {
    if (canonicalDeployment() && req.nextUrl.pathname === "/" && req.headers.get("accept")?.includes("text/html") && boundary.status === 200) return NextResponse.redirect(new URL("/developer", req.url));
    return boundary;
  }
  if (canonicalDeployment() && ["/developer", "/developer/guide", "/developer-guide.md", "/developer-client.mjs", "/hosted-ecom-example.mjs", "/hosted-moto-example.mjs", "/hosted-moto-guide.md", "/payment-link-example.mjs", "/payment-link-guide.md", "/developer/payment-links", "/developer/moto"].includes(req.nextUrl.pathname)) {
    try { if (publicEcomConfiguration(req.headers, req.nextUrl.pathname.includes("moto") ? "vt" : req.nextUrl.pathname.includes("payment-link") ? "pbl" : "ecom")) return NextResponse.next(); const c=consumerConfiguration(); const source=c?developerSource(req.headers,[{source:c.source,staffUser:c.staffUser,staffPasswordEnv:c.staffPasswordEnv}]):developerSource(req.headers); if (!source) return NextResponse.redirect(new URL("/developer/login",req.url)); } catch { return developerChallenge(); }
  }
  if (canonicalDeployment()) return NextResponse.next();
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (req.nextUrl.pathname === "/collect") {
    try {
      const collection = getConfig(req.headers.get("host"));
      if (!authorized(collection, req.headers))
        return new NextResponse(
          "Staff sign-in is required for the staging collection lab.",
          {
            status: 401,
            headers: {
              "WWW-Authenticate":
                'Basic realm="GetEdge Pay staging lab", charset="UTF-8"',
              "Cache-Control": "no-store",
            },
          },
        );
    } catch {
      /* The page displays the configuration gate; APIs remain closed. */
    }
  }
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
