import { createHmac, timingSafeEqual } from "node:crypto";
import { LabError } from "../pay-lab/config";
import { key, Source, sourceFor } from "./config";
export const VERSION = "2";
// Bind signatures to operation and identity as well as exact body bytes.
export function signature(secret: string, timestamp: string, operation: string, identity: string, raw: string) {
    return createHmac("sha256", secret).update(`${VERSION}\n${timestamp}\n${operation}\n${identity}\n${raw}`).digest("hex");
}
export function authenticate(headers: Headers, host: string, operation: string, raw: string): Source {
    if (headers.get("x-getedge-version") !== VERSION)
        throw new LabError("Unsupported session API version.", 400);
    const s = sourceFor(headers.get("x-getedge-source") || "", host);
    const stamp = headers.get("x-getedge-timestamp") || "", sig = headers.get("x-getedge-signature") || "";
    if (!/^\d{10}$/.test(stamp) || Math.abs(Date.now() / 1000 - Number(stamp)) > 300 || !/^[a-f0-9]{64}$/.test(sig) || !timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(signature(key(s.requestSecretEnv), stamp, operation, s.id, raw), "hex")))
        throw new LabError("Invalid source authentication.", 401);
    return s;
}
export function signedHeaders(s: Source, operation: string, raw: string) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    return { "content-type": "application/json", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-getedge-version": VERSION, "x-getedge-source": s.id, "x-getedge-timestamp": timestamp, "x-getedge-signature": signature(key(s.resultSecretEnv), timestamp, operation, s.id, raw) };
}
