import { NextRequest, NextResponse } from "next/server";
import { getSlugFromHost } from "./lib/tenant";
import { loadClientConfig } from "./lib/clients";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const slug = getSlugFromHost(host);

  try {
    loadClientConfig(slug);
  } catch {
    return new NextResponse("Unknown client", { status: 404 });
  }

  const res = NextResponse.next();
  res.headers.set("x-edge-lab-client", slug);
  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};