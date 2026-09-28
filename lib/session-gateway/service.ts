import { randomUUID } from "node:crypto";
import { z } from "zod";
import { LabError } from "../pay-lab/config";
import { database, getRecord, transaction } from "../pay-lab/db";
import { canonical, launch, launchCollection, saveBooking, settings } from "../pay-lab/service";
import { Source, connectionFor } from "./config";
import { sessionRequest, SessionRequest, validatePolicy } from "./contract";
type External = {
    source: string;
    connection: string;
    booking_id: string;
    request_key: string;
    obligation_id: string;
    request: SessionRequest;
    source_config: Source;
    route_ref: string;
};
export async function create(s: Source, input: unknown) {
    const request = sessionRequest.parse(input);
    validatePolicy(s, request);
    const c = connectionFor(s);
    const external = await transaction(async (db) => {
        // Serialise all keys for this source, including concurrent conflicting obligations.
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`session-source:${s.id}`]);
        const old = await db.query<External>("SELECT * FROM pay_lab_external_requests WHERE source=$1 AND (request_key=$2 OR obligation_id=$3)", [s.id, request.requestKey, request.obligationId]);
        if (old.rows.length) {
            const r = old.rows[0];
            if (r.request_key !== request.requestKey || canonical(r.request) !== canonical(request) || r.connection !== c.id)
                throw new LabError("Request key or obligation is already bound to different payment details.", 409);
            return r;
        }
        const remaining = (Date.parse(request.expiresAt) - Date.now()) / 1000;
        if (remaining <= 0 || remaining > s.maxSessionSeconds)
            throw new LabError("Expiry exceeds configured session policy.", 400);
        if (request.operator && (Date.parse(request.operator.authenticatedAt) > Date.now() + 300000 || Date.parse(request.operator.authenticatedAt) < Date.now() - 300000))
            throw new LabError("New staff requests require a recent source authentication attestation.", 403);
        if (!c.providerTestModeConfirmed)
            throw new LabError("Verified provider test mode is required.", 409);
        const id = randomUUID(), ref = s.routes[request.currency][request.mode]!;
        const { rows } = await db.query<External>(`INSERT INTO pay_lab_external_requests(source,connection,booking_id,request_key,obligation_id,request,source_config,route_ref)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [s.id, c.id, id, request.requestKey, request.obligationId, request, s, ref]);
        return rows[0];
    });
    return resume(s, external);
}
export async function status(s: Source, input: unknown) {
    const { requestKey } = z.object({ requestKey: z.string().min(1).max(200) }).strict().parse(input);
    const { rows } = await database().query<External>("SELECT * FROM pay_lab_external_requests WHERE source=$1 AND request_key=$2", [s.id, requestKey]);
    if (!rows[0])
        throw new LabError("Request not found.", 404);
    if (rows[0].connection !== s.connectionId)
        throw new LabError("Source connection changed; restore the original connection to recover this request.", 409);
    return resume(s, rows[0]);
}
async function resume(s: Source, external: External) {
    const r = external.request, saved = external.source_config;
    const c = connectionFor(s);
    // Frozen destinations, route and request survive ordinary configuration edits.
    const configured = { ...c, returnUrls: saved.returnUrls, staffUser: r.operator?.id || c.staffUser };
    await saveBooking(configured, { id: external.booking_id, reference: r.reference, amount: `${Math.floor(r.amountMinor / 100)}.${String(r.amountMinor % 100).padStart(2, "0")}`, currency: r.currency, expiresAt: r.expiresAt, ...(r.description !== undefined ? { description: r.description } : {}), ...(r.customer ? { customer: r.customer } : {}), ...(r.customerCollection ? { customerCollection: r.customerCollection } : {}), ...(r.returnUrl ? { returnUrl: r.returnUrl } : {}) });
    const existing = await getRecord(c.id, external.booking_id);
    if (!existing.request) {
        const available = await settings(configured);
        if (!available.routes.some(route => route.ref === external.route_ref && route.currency === r.currency && route.channel === (r.mode === "vt" ? "MOTO" : "ECOM")))
            throw new LabError("Configured mode route is not granted by Prime.", 403);
    }
    if (r.mode === "ecom")
        await launch(configured, external.booking_id, external.route_ref);
    else {
        const action = r.mode === "vt" ? "telephone_payment" : "payment_link";
        const selected = { ...configured, staffCollection: { routes: { [r.currency]: { [action]: external.route_ref } }, ...(r.presentation === "inline" ? { embeddingOrigin: r.embeddingOrigin } : {}) } };
        await launchCollection(selected, external.booking_id);
    }
    const row = await getRecord(c.id, external.booking_id);
    let url = r.mode === "ecom" ? row.checkout_url : row.collection?.staffUrl;
    if (r.presentation === "inline") {
        if (r.mode === "ecom" && url) {
            const embedded = new URL(url);
            embedded.searchParams.set("embed", "1");
            url = embedded.href;
        }
        else
            url = row.collection?.embedUrl;
        if (!url && !row.snapshot)
            throw new LabError("Prime did not supply the requested embedded experience.", 502);
    }
    const deliveries = await database().query("SELECT event_id,revision,attempts,delivered_at,exhausted_at FROM pay_lab_source_outbox WHERE connection=$1 AND booking_id=$2 ORDER BY revision DESC LIMIT 1", [c.id, row.id]);
    return { version: "2", requestId: row.id, requestKey: r.requestKey, obligationId: r.obligationId, reference: r.reference, mode: r.mode, presentation: r.presentation, amountMinor: r.amountMinor, currency: r.currency, expiresAt: r.expiresAt, launch: url ? { url, presentation: r.presentation, audience: r.mode === "ecom" ? "customer" : "staff" } : null, payment: row.snapshot ? { sessionId: row.snapshot.sessionId, saleId: row.snapshot.saleId, revision: row.snapshot.revision, state: row.snapshot.paymentState, sessionState: row.snapshot.sessionState, providerReference: row.snapshot.providerReference } : null, delivery: deliveries.rows[0] || null };
}
