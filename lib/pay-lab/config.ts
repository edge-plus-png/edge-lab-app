import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
const https = z.url().refine((v) => {
  const u = new URL(v);
  return u.protocol === "https:" && !u.username && !u.password && !u.hash;
}, "Public HTTPS URL required");
const configSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    hosts: z.array(z.string().min(1)).min(1),
    origin: https.refine(
      (v) => new URL(v).pathname === "/" && !new URL(v).search,
    ),
    integrationId: z.string().min(1),
    merchantId: z.string().min(1),
    pairingId: z.string().min(1),
    environment: z.literal("staging"),
    sourceId: z.string().min(1),
    sourceType: z.string().min(1),
    signingSecretEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    staffPasswordEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    staffUser: z.string().min(1),
    routeRefs: z.array(z.string().min(1)).min(1),
    callbackUrl: https,
    returnUrls: z.array(https),
    collectScriptUrl: https,
    providerTestModeConfirmed: z.boolean(),
    staffCollection: z.object({
      embeddingOrigin: https.refine(v => new URL(v).origin === v).optional(),
      routes: z.record(z.string().regex(/^[A-Z]{3}$/), z.object({ telephone_payment: z.string().min(1).optional(), payment_link: z.string().min(1).optional() }).strict()),
    }).strict().optional(),
    sample: z.object({
      reference: z.string().min(1),
      amount: z.string(),
      currency: z.string().regex(/^[A-Z]{3}$/),
      sessionSeconds: z.number().int().positive().max(2592000),
    }),
  })
  .strict();
export type Config = z.infer<typeof configSchema>;
export class LabError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function getConfig(host: string | null): Config {
  const configs = z
    .array(configSchema)
    .parse(JSON.parse(process.env.PAY_LAB_CONNECTIONS || "[]"));
  const matching = configs.filter((c) =>
    c.hosts.includes((host || "").toLowerCase()),
  );
  if (matching.length !== 1)
    throw new LabError(
      "GetEdge Pay collection is not configured for this host.",
      503,
    );
  return matching[0];
}
export function secret(c: Config) {
  const s = process.env[c.signingSecretEnv];
  if (!s || s.length < 32)
    throw new LabError("The server signing credential is not configured.", 503);
  return s;
}
export function authorized(c: Config, headers: Headers) {
  const expected = process.env[c.staffPasswordEnv];
  if (!expected || expected.length < 24) return false;
  const actual = headers.get("authorization") || "";
  const wanted =
    "Basic " + Buffer.from(`${c.staffUser}:${expected}`).toString("base64");
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(wanted).digest(),
  );
}
export function scope(c: Config) {
  return {
    version: "1",
    merchantId: c.merchantId,
    pairingId: c.pairingId,
    environment: c.environment,
  };
}
export function sameOrigin(req: Request) {
  const raw = req.headers.get("origin") || "";
  let origin: URL;
  try {
    origin = new URL(raw);
  } catch {
    throw new LabError("Use the collection page on this origin.", 403);
  }
  // getConfig has already bound this exact Host to an installed connection.
  // Next's internal URL may use localhost behind a trusted reverse proxy.
  const local = ["127.0.0.1", "localhost"].includes(origin.hostname);
  if (
    origin.origin !== raw ||
    origin.host !== req.headers.get("host") ||
    (origin.protocol !== "https:" && !(local && origin.protocol === "http:"))
  )
    throw new LabError("Use the collection page on this origin.", 403);
}
