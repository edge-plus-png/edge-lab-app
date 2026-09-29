import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../../lib/pay-lab/db";
import { sign, verify } from "../../lib/pay-lab/transport";
import { Config } from "../../lib/pay-lab/config";
import { Source } from "../../lib/session-gateway/config";
import { signature } from "../../lib/session-gateway/auth";
import { sessionHandler, callbackHandler, workerHandler } from "../../lib/session-gateway/http";
import { deliverBatch } from "../../lib/session-gateway/outbox";
import { Snapshot } from "../../lib/pay-lab/contract";
if (process.env.PAY_LAB_DATABASE_URL !== "postgresql://kevinsmith@127.0.0.1:55459/postgres")
    throw Error("Run only against the isolated session-gateway test database");
const config = (id: string): Config => ({ id, name: id, hosts: ["lab.test"], origin: "https://prime.test", integrationId: `integration-${id}`, merchantId: `merchant-${id}`, pairingId: `pair-${id}`, environment: "staging", sourceId: `source-${id}`, sourceType: "booking", signingSecretEnv: "GATEWAY_TEST_PRIME", staffPasswordEnv: "GATEWAY_TEST_STAFF", staffUser: "fixture", routeRefs: ["ecom-gbp", "moto-gbp", "ecom-eur", "moto-eur"], callbackUrl: "https://lab.test/api/session/callback", returnUrls: [`https://${id}.test/return`], collectScriptUrl: "https://provider.test/Collect.js", providerTestModeConfirmed: true, sample: { reference: "editable fixture", amount: "2.00", currency: "GBP", sessionSeconds: 600 }, staffCollection: { routes: { GBP: { telephone_payment: "moto-gbp", payment_link: "ecom-gbp" }, EUR: { telephone_payment: "moto-eur", payment_link: "ecom-eur" } } } });
const source = (id: string): Source => ({ id, connectionId: id, hosts: ["lab.test"], enabled: true, requestSecretEnv: `GATEWAY_TEST_${id.toUpperCase()}_REQUEST`, resultSecretEnv: `GATEWAY_TEST_${id.toUpperCase()}_RESULT`, callbackUrl: `https://${id}.test/callback`, returnUrls: [`https://${id}.test/return`], embeddingOrigins: [`https://${id}.test`], modes: ["ecom", "vt", "pbl"], presentations: ["hosted", "inline"], routes: { GBP: { ecom: "ecom-gbp", vt: "moto-gbp", pbl: "ecom-gbp" }, EUR: { ecom: "ecom-eur", vt: "moto-eur", pbl: "ecom-eur" } }, maxSessionSeconds: 1200, delivery: { maxAttempts: 3, retrySeconds: 1, timeoutSeconds: 1, leaseSeconds: 2 } });
const a = source("alpha"), b = source("beta"), ca = config("alpha"), cb = config("beta");
const sessions = new Map<string, Snapshot>();
type CollectionFixture = {
    collectionId: string;
    routes: Record<string, string>;
    [key: string]: unknown;
};
const collections = new Map<string, CollectionFixture>(); // Provider/service fixture only.
const deliveries: {
    source: string;
    raw: string;
    headers: Headers;
}[] = [];
let dropCreate = false, dropAck = false, receiverDown = false;
const originalFetch = global.fetch;
function primeResponse(c: Config, value: unknown) { const raw = JSON.stringify(value), time = String(Math.floor(Date.now() / 1000)); return new Response(raw, { headers: { "x-edge-integration-id": c.integrationId, "x-edge-signature-timestamp": time, "x-edge-signature-v2": sign(process.env.GATEWAY_TEST_PRIME!, time, raw) } }); }
function request(s = a, overrides = {}) { return { requestKey: randomUUID(), obligationId: randomUUID(), reference: "booking-fixture", amountMinor: 4999, currency: "GBP", mode: "ecom", presentation: "hosted", expiresAt: new Date(Date.now() + 600000).toISOString(), returnUrl: s.returnUrls[0], ...overrides }; }
function http(s: Source, body: unknown, operation: "session.create" | "session.status" = "session.create", headers = {}) {
    const raw = JSON.stringify(body), timestamp = String(Math.floor(Date.now() / 1000));
    return new Request(`https://lab.test/api/session${operation === "session.status" ? "/status" : ""}`, { method: "POST", headers: { host: "lab.test", "content-type": "application/json", "x-getedge-version": "2", "x-getedge-source": s.id, "x-getedge-timestamp": timestamp, "x-getedge-signature": signature(process.env[s.requestSecretEnv]!, timestamp, operation, s.id, raw), ...headers }, body: raw });
}
async function create(s: Source, body: unknown) { const res = await sessionHandler(http(s, body), "session.create"); const data = await res.json(); assert.equal(res.status, 200, JSON.stringify(data)); return data; }
before(() => {
    process.env.GATEWAY_TEST_PRIME = "fixture-prime-secret-at-least-32-characters";
    process.env.GATEWAY_TEST_STAFF = "fixture-staff-secret-at-least-32-characters";
    process.env.PAY_LAB_WORKER_SECRET = "fixture-worker-secret-at-least-32-characters";
    for (const s of [a, b]) {
        process.env[s.requestSecretEnv] = `fixture-${s.id}-request-secret-at-least-32`;
        process.env[s.resultSecretEnv] = `fixture-${s.id}-result-secret-at-least-32`;
    }
    process.env.PAY_LAB_CONNECTIONS = JSON.stringify([ca, cb]);
    process.env.PAY_LAB_SOURCES = JSON.stringify([a, b]);
    global.fetch = async (input, init) => {
        const u = new URL(String(input)), headers = new Headers(init?.headers), raw = String(init?.body);
        if (u.hostname !== "prime.test") {
            const id = u.hostname.split(".")[0], s = id === a.id ? a : b;
            assert.equal(headers.get("x-getedge-signature"), signature(process.env[s.resultSecretEnv]!, headers.get("x-getedge-timestamp")!, "result", s.id, raw));
            deliveries.push({ source: s.id, raw, headers });
            if (dropAck) {
                dropAck = false;
                throw Error("Simulated lost acknowledgement after receiver commit");
            }
            if (receiverDown)
                return new Response("Unavailable", { status: 503 });
            return Response.json({ eventId: JSON.parse(raw).eventId, accepted: true });
        }
        const c = headers.get("x-edge-integration-id") === ca.integrationId ? ca : cb;
        const body = verify(c, raw, headers), path = u.pathname.replace("/api/pay/v1/", "");
        const scope = { version: "1", merchantId: c.merchantId, pairingId: c.pairingId, environment: "staging" };
        const routes = ["GBP", "EUR"].flatMap(currency => ["ECOM", "MOTO"].map(channel => ({ ref: `${channel === "ECOM" ? "ecom" : "moto"}-${currency.toLowerCase()}`, label: "fixture route", channel, currency, presentation: channel === "ECOM" ? "hosted_customer" : "operator_card" })));
        if (path === "configuration")
            return primeResponse(c, { ...scope, callbackUrl: c.callbackUrl });
        if (path === "routes")
            return primeResponse(c, { ...scope, routes });
        if (path === "collections") {
            const key = `${c.id}:${body.source.obligationId}`;
            let collection = collections.get(key);
            if (!collection) {
                const token = randomUUID().replaceAll("-", "").repeat(2);
                collection = { ...body, ...scope, source: { ...body.source, id: c.sourceId, type: c.sourceType }, collectionId: randomUUID(), staffUrl: `${c.origin}/getedge-pay/collect/${token}`, embedUrl: body.embeddingOrigin ? `${c.origin}/getedge-pay/collect/${token}?embed=1` : null, payment: null };
                collections.set(key, collection!);
            }
            if (dropCreate) {
                dropCreate = false;
                throw Error("Lost creation reply");
            }
            return primeResponse(c, collection);
        }
        if (path === "collections/status") {
            const found = [...collections.values()].find(r => r.collectionId === body.collectionId);
            assert.ok(found);
            return primeResponse(c, found);
        }
        if (path === "sessions") {
            let s = [...sessions.values()].find(s => s.source.obligationId === body.source.obligationId && s.source.id === c.sourceId);
            if (!s) {
                s = { ...scope, sessionId: randomUUID(), saleId: randomUUID(), revision: 1, source: { ...body.source, id: c.sourceId, type: c.sourceType }, amountMinor: body.amountMinor, currency: body.currency, expiresAt: body.expiresAt, paymentState: "awaiting", sessionState: "open", providerReference: null, route: routes.find(r => r.ref === body.routeRef)! } as Snapshot;
                sessions.set(s.sessionId, s);
            }
            return primeResponse(c, s);
        }
        const s = sessions.get(body.sessionId);
        assert.ok(s);
        if (path === "sessions/status")
            return primeResponse(c, s);
        if (path === "links")
            return primeResponse(c, { ...s, checkoutUrl: `${c.origin}/getedge-pay/checkout/${s.sessionId}` });
        throw Error(`Unexpected fixture path ${path}`);
    };
});
after(async () => { global.fetch = originalFetch; await database().end(); });
test("authentication binds source, operation, host and bytes", async () => {
    const body = request();
    for (const headers of [{ "x-getedge-source": b.id }, { "x-getedge-signature": "0".repeat(64) }, { host: "other.test" }, { "x-getedge-version": "9" }]) {
        assert.notEqual((await sessionHandler(http(a, body, "session.create", headers), "session.create")).status, 200);
    }
    assert.equal((await sessionHandler(http(a, body), "session.status")).status, 401);
});
test("ECOM replay is durable and conflicting amount/obligation is rejected", async () => {
    const body = request();
    const [one, two] = await Promise.all([create(a, body), create(a, body)]);
    assert.equal(one.requestId, two.requestId);
    assert.equal(one.launch.audience, "customer");
    assert.equal(one.payment.state, "awaiting");
    assert.equal((await sessionHandler(http(a, { ...body, amountMinor: 5000 }), "session.create")).status, 409);
    assert.equal((await sessionHandler(http(a, { ...body, requestKey: randomUUID(), mode: "pbl", operator: { id: "operator-1", authenticatedAt: new Date().toISOString() } }), "session.create")).status, 409);
});
test("VT and PBL select only their own action; lost creation recovers same collection", async () => {
    for (const mode of ["vt", "pbl"]) {
        const body = request(a, { mode, operator: { id: "staff-42", authenticatedAt: new Date().toISOString() } });
        dropCreate = true;
        assert.equal((await sessionHandler(http(a, body), "session.create")).status, 503);
        const result = await create(a, body);
        assert.equal(result.launch.audience, "staff");
        assert.equal(result.payment, null);
        const collection = collections.get(`alpha:${result.requestId}`)!;
        assert.deepEqual(Object.keys(collection.routes), [mode === "vt" ? "telephone_payment" : "payment_link"]);
        assert.equal((await create(a, body)).launch.url, result.launch.url);
    }
});
test("staff authority and origin gates are enforced", async () => {
    assert.equal((await sessionHandler(http(a, request(a, { mode: "vt" })), "session.create")).status, 403);
    assert.equal((await sessionHandler(http(a, request(a, { presentation: "inline", embeddingOrigin: "https://evil.test" })), "session.create")).status, 403);
    assert.equal((await sessionHandler(http(a, request(a, { presentation: "inline", embeddingOrigin: a.embeddingOrigins[0], returnUrl: undefined })), "session.create")).status, 400);
});
test("second source, alternate currency and inline customer/staff use configuration", async () => {
    const e = await create(b, request(b, { currency: "EUR", amountMinor: 2713, presentation: "inline", embeddingOrigin: b.embeddingOrigins[0] }));
    assert.equal(e.amountMinor, 2713);
    assert.equal(e.currency, "EUR");
    assert.ok(e.launch.url.endsWith("?embed=1"));
    const vt = await create(b, request(b, { currency: "EUR", mode: "vt", presentation: "inline", embeddingOrigin: b.embeddingOrigins[0], operator: { id: "other-staff", authenticatedAt: new Date().toISOString() } }));
    assert.ok(vt.launch.url.endsWith("?embed=1"));
    const wrong = await sessionHandler(http(a, { requestKey: e.requestKey }, "session.status"), "session.status");
    assert.equal(wrong.status, 404);
});
test("verified approval queues once and receiver lost-ack retries identical signed payload", async () => {
    const r = await create(a, request());
    const snap = sessions.get(r.payment.sessionId)!;
    snap.revision++;
    snap.paymentState = "approved";
    snap.sessionState = "closed";
    snap.providerReference = "simulated-only";
    const event = { version: "1", type: "payment.updated", eventId: randomUUID(), data: snap };
    const response = primeResponse(ca, event), raw = await response.text();
    response.headers.set("x-edge-event-id", event.eventId);
    response.headers.set("host", "lab.test");
    const callback = () => callbackHandler(new Request(ca.callbackUrl, { method: "POST", headers: response.headers, body: raw }));
    assert.equal((await callback()).status, 200);
    assert.equal((await callback()).status, 200);
    const { rows } = await database().query("SELECT * FROM pay_lab_source_outbox WHERE booking_id=$1 AND revision=2", [r.requestId]);
    assert.equal(rows.length, 1);
    // Isolate this delivery from other test events without deleting any records.
    await database().query("UPDATE pay_lab_source_outbox SET next_at=now()+interval '1 hour' WHERE event_id<>$1", [rows[0].event_id]);
    dropAck = true;
    assert.equal((await deliverBatch(1)).delivered, 0);
    await database().query("UPDATE pay_lab_source_outbox SET next_at=now() WHERE event_id=$1", [rows[0].event_id]);
    assert.equal((await deliverBatch(1)).delivered, 1);
    const seen = deliveries.filter(d => JSON.parse(d.raw).eventId === rows[0].event_id);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].raw, seen[1].raw);
    const altered = primeResponse(ca, { ...event, data: { ...snap, amountMinor: snap.amountMinor + 1 } });
    altered.headers.set("x-edge-event-id", event.eventId);
    altered.headers.set("host", "lab.test");
    assert.equal((await callbackHandler(new Request(ca.callbackUrl, { method: "POST", headers: altered.headers, body: await altered.text() }))).status, 409);
});
test("source notification exhaustion is bounded and worker is authenticated", async () => {
    const r = await create(b, request(b));
    await database().query("UPDATE pay_lab_source_outbox SET next_at=now()+interval '1 hour' WHERE booking_id<>$1", [r.requestId]);
    receiverDown = true;
    for (let i = 0; i < 3; i++) {
        await database().query("UPDATE pay_lab_source_outbox SET next_at=now() WHERE booking_id=$1", [r.requestId]);
        await deliverBatch(1);
    }
    receiverDown = false;
    const { rows } = await database().query("SELECT attempts,exhausted_at FROM pay_lab_source_outbox WHERE booking_id=$1", [r.requestId]);
    assert.equal(rows[0].attempts, 3);
    assert.ok(rows[0].exhausted_at);
    assert.equal((await workerHandler(new Request("https://lab.test/api/session/worker", { method: "POST" }))).status, 401);
});
test("source policy changes do not rewrite an existing request or callback destination", async () => {
    const body = request(a);
    const first = await create(a, body);
    const changed = { ...a, callbackUrl: "https://alpha.test/new-callback", routes: { GBP: { ecom: "different-route" } }, returnUrls: [] };
    process.env.PAY_LAB_SOURCES = JSON.stringify([changed, b]);
    try {
        const result = await sessionHandler(http(a, { requestKey: body.requestKey }, "session.status"), "session.status");
        assert.equal(result.status, 200);
        assert.equal((await result.json()).requestId, first.requestId);
        const { rows } = await database().query("SELECT destination FROM pay_lab_source_outbox WHERE booking_id=$1", [first.requestId]);
        assert.equal(rows[0].destination, a.callbackUrl);
    }
    finally {
        process.env.PAY_LAB_SOURCES = JSON.stringify([a, b]);
    }
});
test("an older verified result cannot roll an approved payment backwards or create a stale notification", async () => {
    const r = await create(a, request()), snap = sessions.get(r.payment.sessionId)!;
    const deliver = async (revision: number, state: Snapshot["paymentState"]) => {
        const event = { version: "1", type: "payment.updated", eventId: randomUUID(), data: { ...snap, revision, paymentState: state, sessionState: state === "approved" ? "closed" : "open" } };
        const response = primeResponse(ca, event);
        response.headers.set("x-edge-event-id", event.eventId);
        response.headers.set("host", "lab.test");
        return callbackHandler(new Request(ca.callbackUrl, { method: "POST", headers: response.headers, body: await response.text() }));
    };
    assert.equal((await deliver(3, "approved")).status, 200);
    assert.equal((await deliver(2, "awaiting")).status, 200);
    const { rows } = await database().query("SELECT snapshot FROM pay_lab_bookings WHERE connection=$1 AND id=$2", [ca.id, r.requestId]);
    assert.equal(rows[0].snapshot.paymentState, "approved");
    assert.equal((await database().query("SELECT 1 FROM pay_lab_source_outbox WHERE booking_id=$1 AND revision=2", [r.requestId])).rowCount, 0);
});
test("concurrent workers do not claim the same active event", async () => {
    const r = await create(b, request(b));
    await database().query("UPDATE pay_lab_source_outbox SET next_at=now()+interval '1 hour' WHERE booking_id<>$1", [r.requestId]);
    const results = await Promise.all([deliverBatch(1), deliverBatch(1)]);
    assert.equal(results.reduce((n, r) => n + r.claimed, 0), 1);
});
test("expired worker lease is reclaimed and the previous claim cannot acknowledge it", async () => {
    const r = await create(a, request());
    await database().query("UPDATE pay_lab_source_outbox SET next_at=now()+interval '1 hour' WHERE booking_id<>$1", [r.requestId]);
    const oldClaim = randomUUID();
    await database().query("UPDATE pay_lab_source_outbox SET claim=$2,lease_until=now()-interval '1 second',attempts=1 WHERE booking_id=$1", [r.requestId, oldClaim]);
    assert.equal((await deliverBatch(1)).delivered, 1);
    const stale = await database().query("UPDATE pay_lab_source_outbox SET last_error='stale claim' WHERE booking_id=$1 AND claim=$2", [r.requestId, oldClaim]);
    assert.equal(stale.rowCount, 0);
});
