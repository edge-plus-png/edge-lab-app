import { z } from "zod";
import { Config, LabError, configSchema } from "../pay-lab/config";
const https = z.url().refine(v => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.hash; });
const env = z.string().regex(/^[A-Z][A-Z0-9_]+$/);
export const sourceSchema = z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), connectionId: z.string().min(1),
    hosts: z.array(z.string().min(1)).min(1), enabled: z.boolean(),
    requestSecretEnv: env, resultSecretEnv: env,
    callbackUrl: https,
    returnUrls: z.array(https),
    embeddingOrigins: z.array(https.refine(v => new URL(v).origin === v)),
    modes: z.array(z.enum(["ecom", "vt", "pbl"])).min(1),
    presentations: z.array(z.enum(["hosted", "inline"])).min(1),
    routes: z.record(z.string().regex(/^[A-Z]{3}$/), z.object({ ecom: z.string().optional(), vt: z.string().optional(), pbl: z.string().optional() }).strict()),
    maxSessionSeconds: z.number().int().positive().max(2592000),
    delivery: z.object({ maxAttempts: z.number().int().min(1).max(100), retrySeconds: z.number().int().min(1).max(86400), timeoutSeconds: z.number().int().min(1).max(30), leaseSeconds: z.number().int().min(2).max(600) }).strict().refine(v => v.leaseSeconds > v.timeoutSeconds),
}).strict();
export type Source = z.infer<typeof sourceSchema>;
export function sources() {
    const entries = z.array(sourceSchema).parse(JSON.parse(process.env.PAY_LAB_SOURCES || "[]"));
    if (new Set(entries.map(s => s.id)).size !== entries.length || new Set(entries.map(s => s.connectionId)).size !== entries.length)
        throw new LabError("Source configuration must have unique identities and dedicated connections.", 503);
    return entries;
}
export function sourceFor(id: string, host: string): Source {
    const s = sources().find(s => s.id === id && s.enabled && s.hosts.includes(host.toLowerCase()));
    if (!s)
        throw new LabError("Unknown or disabled source connection.", 401);
    return s;
}
export function connectionFor(s: Source): Config {
    const all = z.array(configSchema).parse(JSON.parse(process.env.PAY_LAB_CONNECTIONS || "[]"));
    const match = all.filter(c => c.id === s.connectionId);
    if (match.length !== 1)
        throw new LabError("Source payment connection is not configured.", 503);
    if (all.filter(c => c.integrationId === match[0].integrationId).length !== 1)
        throw new LabError("Prime integration must have a unique connection.", 503);
    return match[0];
}
export function key(name: string) {
    const value = process.env[name];
    if (!value || value.length < 32)
        throw new LabError("Server signing credential is not configured.", 503);
    return value;
}
