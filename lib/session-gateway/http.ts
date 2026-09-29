import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { LabError } from "../pay-lab/config";
import { receive } from "../pay-lab/service";
import { readBounded } from "../pay-lab/transport";
import { authenticate, signedHeaders } from "./auth";
import { connectionFor, key, sources } from "./config";
import { create, status } from "./service";
import { deliverBatch } from "./outbox";
export function failure(error: unknown) {
    const known = error instanceof LabError;
    const code = known ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
    return Response.json({ error: known ? error.message : code === 400 ? "Invalid versioned request." : "Unable to confirm operation; retry the same request identity or query its status." }, { status: code, headers: { "cache-control": "no-store" } });
}
export async function sessionHandler(req: Request, operation: "session.create" | "session.status") {
    try {
        if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
            throw new LabError("JSON content type required.", 415);
        const raw = await readBounded(req);
        const s = authenticate(req.headers, req.headers.get("host") || "", operation, raw);
        const result = operation === "session.create" ? await create(s, JSON.parse(raw)) : await status(s, JSON.parse(raw));
        const body = JSON.stringify(result);
        return new Response(body, { headers: signedHeaders(s, `${operation}.response`, body) });
    }
    catch (error) {
        return failure(error);
    }
}
export async function callbackHandler(req: Request) {
    try {
        const matches = sources().filter(s => s.enabled && s.hosts.includes((req.headers.get("host") || "").toLowerCase())).map(s => ({ s, c: connectionFor(s) })).filter(({ c }) => c.integrationId === req.headers.get("x-edge-integration-id"));
        if (matches.length !== 1)
            throw new LabError("Unknown callback integration.", 401);
        return Response.json(await receive(matches[0].c, await readBounded(req), req.headers), { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return failure(error);
    }
}
export async function workerHandler(req: Request) {
    try {
        const expected = `Bearer ${key("PAY_LAB_WORKER_SECRET")}`;
        if (!timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(req.headers.get("authorization") || "").digest()))
            throw new LabError("Worker authentication required.", 401);
        return Response.json(await deliverBatch(1), { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return failure(error);
    }
}
