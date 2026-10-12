import { handleCallback } from "@vercel/queue";
import { deliveryRetry, processOutbox, queueEnabled } from "@/lib/session-gateway/queue";
export const runtime = "nodejs";
export const maxDuration = 180;
const callback = handleCallback(processOutbox, { retry: deliveryRetry });
export async function POST(request: Request) {
  if (!queueEnabled()) return new Response(null, { status: 404 });
  return callback(request);
}
