import { createHmac, timingSafeEqual } from "node:crypto";
import { Config, LabError, secret, scope } from "./config";
const limit = 524288;
export async function readBounded(response: Response | Request) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new LabError("Message is too large.", 413);
    }
    parts.push(value);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts));
}
export function sign(key: string, timestamp: string, raw: string) {
  return createHmac("sha256", key).update(`${timestamp}.${raw}`).digest("hex");
}
export function verify(c: Config, raw: string, headers: Headers) {
  const timestamp = headers.get("x-edge-signature-timestamp") || "",
    supplied = headers.get("x-edge-signature-v2") || "";
  if (
    headers.get("x-edge-integration-id") !== c.integrationId ||
    !/^\d{10,}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    !/^[a-f0-9]{64}$/.test(supplied) ||
    !timingSafeEqual(
      Buffer.from(supplied, "hex"),
      Buffer.from(sign(secret(c), timestamp, raw), "hex"),
    )
  )
    throw new LabError("Invalid GetEdge Pay authentication.", 401);
  return JSON.parse(raw);
}
export async function pay(c: Config, path: string, body: object) {
  if (
    ![
      "collections",
      "collections/status",
      "routes",
      "configuration",
      "sessions",
      "sessions/status",
      "links",
      "sessions/operator/setup",
      "sessions/operator/pay",
    ].includes(path)
  )
    throw Error("Unsupported Pay operation");
  const raw = JSON.stringify({ ...scope(c), ...body }),
    timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(new URL(`/api/pay/v1/${path}`, c.origin), {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      "content-type": "application/json",
      "x-edge-integration-id": c.integrationId,
      "x-edge-signature-timestamp": timestamp,
      "x-edge-signature-v2": sign(secret(c), timestamp, raw),
    },
    body: raw,
  });
  if (!response.ok)
    throw new LabError(
      `GetEdge Pay returned HTTP ${response.status}. Check the saved status before retrying a payment.`,
      502,
    );
  const value = verify(c, await readBounded(response), response.headers);
  for (const [key, expected] of Object.entries(scope(c)))
    if (value[key] !== expected)
      throw new LabError("GetEdge Pay response scope mismatch.", 502);
  return value;
}
