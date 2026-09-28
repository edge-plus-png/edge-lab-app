import { workerHandler } from "@/lib/session-gateway/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = workerHandler;
