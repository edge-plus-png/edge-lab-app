import { sessionHandler } from "@/lib/session-gateway/http";
export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) { return sessionHandler(req, "session.status"); }
