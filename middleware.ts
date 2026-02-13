import { NextRequest, NextResponse } from "next/server";

const KNOWN_CLIENTS = new Set(["anytime", "nuco", "demo", "artisio"]);

function getSlugFromHost(host: string): string {
  const first = host.split(".")[0] || "";
  return first.toLowerCase();
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);

  if (!KNOWN_CLIENTS.has(slug) && host !== "localhost:3000") {
    return new NextResponse("Unknown client", { status: 404 });
  }

  const res = NextResponse.next();
  res.headers.set("x-edge-lab-client", slug || "localhost");
  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};