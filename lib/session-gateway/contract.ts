import { z } from "zod";
import { requestSchema } from "../pay-lab/contract";
import { LabError } from "../pay-lab/config";
import { Source } from "./config";
export const sessionRequest = z.object({
    requestKey: z.string().min(1).max(200), obligationId: z.string().min(1).max(200),
    reference: z.string().trim().min(1).max(200), amountMinor: z.number().int().min(1).max(999999999), currency: z.string().regex(/^[A-Z]{3}$/),
    mode: z.enum(["ecom", "vt", "pbl"]), presentation: z.enum(["hosted", "inline"]),
    expiresAt: z.iso.datetime({ offset: true }), returnUrl: z.url().max(2048).optional(), embeddingOrigin: z.url().optional(),
    description: requestSchema.shape.description, customer: requestSchema.shape.customer, customerCollection: requestSchema.shape.customerCollection,
    operator: z.object({ id: z.string().min(1).max(200), authenticatedAt: z.iso.datetime({ offset: true }) }).strict().optional(),
}).strict();
export type SessionRequest = z.infer<typeof sessionRequest>;
export function validatePolicy(s: Source, r: SessionRequest) {
    if (!s.modes.includes(r.mode) || !s.presentations.includes(r.presentation))
        throw new LabError("Journey or presentation is not enabled.", 403);
    if (!s.routes[r.currency]?.[r.mode])
        throw new LabError("No configured route for this mode and currency.", 403);
    if (r.returnUrl && !s.returnUrls.includes(r.returnUrl))
        throw new LabError("Return destination is not registered.", 403);
    if (r.presentation === "inline") {
        if (!r.embeddingOrigin || !s.embeddingOrigins.includes(r.embeddingOrigin))
            throw new LabError("Embedding origin is not registered.", 403);
        if (r.mode === "ecom" && (!r.returnUrl || new URL(r.returnUrl).origin !== r.embeddingOrigin))
            throw new LabError("Inline customer checkout requires a return destination on the embedding origin.", 400);
    }
    else if (r.embeddingOrigin)
        throw new LabError("Embedding origin is only valid for inline presentation.", 400);
    if (r.mode !== "ecom" && !r.operator)
        throw new LabError("Staff collection requires server-attested operator identity.", 403);
    if (r.mode === "ecom" && r.operator)
        throw new LabError("Customer checkout must not carry staff authority.", 400);
}
