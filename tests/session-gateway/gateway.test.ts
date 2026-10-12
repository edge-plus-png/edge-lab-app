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
import { processOutbox, DeliveryPending } from "../../lib/session-gateway/queue";
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
let dropLink = false;
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
        if (path === "links") {
            if(dropLink){dropLink=false;throw Error("Lost link response");}
            return primeResponse(c, { ...s, checkoutUrl: `${c.origin}/getedge-pay/checkout/${s.sessionId}` });
        }
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
test("VT retains staff action and lost creation recovers same collection", async () => {
    for (const mode of ["vt"]) {
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
test("PBL returns a customer URL directly, requires operator authority and recovers one obligation", async () => {
    for (const src of [a,b]) {
      const body=request(src,{mode:"pbl",currency:"EUR",amountMinor:1723,operator:{id:"configured-operator",authenticatedAt:new Date().toISOString()}});
      const before=collections.size;
      const first=await create(src,body), again=await create(src,body);
      assert.equal(first.launch.audience,"customer");
      assert.ok(first.launch.url.includes("/getedge-pay/checkout/"));
      assert.equal(first.payment.state,"awaiting");
      assert.equal(first.launch.url,again.launch.url);
      assert.equal(first.payment.sessionId,again.payment.sessionId);
      assert.equal(collections.size,before);
      assert.equal([...sessions.values()].filter(s=>s.source.obligationId===first.requestId).length,1);
      assert.equal((await sessionHandler(http(src,{...body,amountMinor:1724}),"session.create")).status,409);
      const status=await sessionHandler(http(src,{requestKey:body.requestKey},"session.status"),"session.status");
      assert.equal((await status.json()).launch.url,first.launch.url);
    }
    assert.equal((await sessionHandler(http(a,request(a,{mode:"pbl"})),"session.create")).status,403);
    assert.equal((await sessionHandler(http(a,request(a,{mode:"pbl",operator:{id:"staff",authenticatedAt:new Date(Date.now()-600000).toISOString()}})),"session.create")).status,403);
    assert.equal((await sessionHandler(http(a,request(a,{mode:"pbl",presentation:"inline",operator:{id:"staff",authenticatedAt:new Date().toISOString()}})),"session.create")).status,400);
});
test("PBL lost link reply recovers the original session and legacy staff requests fail explicitly", async()=>{
 const body=request(a,{mode:"pbl",operator:{id:"staff",authenticatedAt:new Date().toISOString()}});
 dropLink=true;
 assert.equal((await sessionHandler(http(a,body),"session.create")).status,503);
 const recovered=await create(a,body);
 assert.equal([...sessions.values()].filter(s=>s.source.obligationId===recovered.requestId).length,1);
 assert.equal((await create(a,body)).launch.url,recovered.launch.url);
 // Existing two-step requests must never silently gain a second obligation.
 await database().query("UPDATE pay_lab_bookings SET request=$3 WHERE connection=$1 AND id=$2",[a.connectionId,recovered.requestId,{routes:{payment_link:"ecom-gbp"}}]);
 const old=await sessionHandler(http(a,{requestKey:body.requestKey},"session.status"),"session.status");
 assert.equal(old.status,409);assert.match((await old.json()).error,/retired two-step/);
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
    const r = await create(a, request(a,{mode:"pbl",operator:{id:"staff",authenticatedAt:new Date().toISOString()}}));
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
test("decline and cancellation persist through signed callback and status recovery", async () => {
    for (const state of ["declined", "cancelled"] as const) {
        const requestBody = request(), r = await create(a, requestBody), snap = sessions.get(r.payment.sessionId)!;
        Object.assign(snap, { revision: 2, paymentState: state, sessionState: state === "cancelled" ? "closed" : "open" });
        const event = { version: "1", type: "payment.updated", eventId: randomUUID(), data: snap };
        const response = primeResponse(ca, event); response.headers.set("x-edge-event-id", event.eventId); response.headers.set("host", "lab.test");
        assert.equal((await callbackHandler(new Request(ca.callbackUrl, { method: "POST", headers: response.headers, body: await response.text() }))).status, 200);
        const recovered = await sessionHandler(http(a, { requestKey: requestBody.requestKey }, "session.status"), "session.status");
        assert.equal((await recovered.json()).payment.state, state);
    }
});
test("an authenticated higher revision cannot regress an approval", async () => {
    const r = await create(a, request()), snap = sessions.get(r.payment.sessionId)!;
    async function callback(state: string, revision: number) {
        const event = { version: "1", type: "payment.updated", eventId: randomUUID(), data: { ...snap, revision, paymentState: state, providerReference: "fixture-approved" } };
        const response = primeResponse(ca, event); response.headers.set("x-edge-event-id", event.eventId); response.headers.set("host", "lab.test");
        return callbackHandler(new Request(ca.callbackUrl, { method: "POST", headers: response.headers, body: await response.text() }));
    }
    assert.equal((await callback("approved", 2)).status, 200);
    assert.equal((await callback("declined", 3)).status, 409);
});
test("support replay preserves event identity and bytes and is authenticated", async () => {
    const { deliveryHandler } = await import("../../lib/session-gateway/delivery");
    process.env.PAY_LAB_SUPPORT_SECRET = "fixture-support-secret-at-least-32-characters";
    const r = await create(a, request());
    await database().query("UPDATE pay_lab_source_outbox SET exhausted_at=now(),attempts=3 WHERE booking_id=$1", [r.requestId]);
    const row = (await database().query("SELECT * FROM pay_lab_source_outbox WHERE booking_id=$1", [r.requestId])).rows[0];
    const call = (body: object, auth = true) => deliveryHandler(new Request("https://lab.test/api/session/delivery", { method: "POST", headers: auth ? { authorization: `Bearer ${process.env.PAY_LAB_SUPPORT_SECRET}` } : {}, body: JSON.stringify(body) }));
    assert.equal((await call({ action: "replay", eventId: row.event_id, reason: "Receiver restored" }, false)).status, 401);
    assert.equal((await call({ action: "replay", eventId: row.event_id, reason: "Receiver restored" })).status, 200);
    const saved = (await database().query("SELECT * FROM pay_lab_source_outbox WHERE event_id=$1", [row.event_id])).rows[0];
    assert.equal(saved.body, row.body); assert.equal(saved.destination, row.destination); assert.equal(saved.exhausted_at, null);
    assert.equal((await call({ action: "replay", eventId: row.event_id, reason: "Second replay" })).status, 409);
    assert.equal((await call({ action: "inspect", requestId: r.requestId })).status, 200);
});
test("queue consumer retries failed delivery from persisted bytes and acknowledges only after recovery", async () => {
    await database().query("UPDATE pay_lab_source_outbox SET exhausted_at=now() WHERE delivered_at IS NULL");
    const r = await create(a, request());
    const names = ["PAY_LAB_DEPLOYMENT_MODE", "PAY_LAB_ENVIRONMENT", "VERCEL_ENV", "PAY_LAB_QUEUE_ENABLED"];
    const previous = names.map(name => process.env[name]);
    try {
        process.env.PAY_LAB_DEPLOYMENT_MODE = "canonical"; process.env.PAY_LAB_ENVIRONMENT = "staging";
        process.env.VERCEL_ENV = "preview"; process.env.PAY_LAB_QUEUE_ENABLED = "true";
        receiverDown = true;
        await assert.rejects(processOutbox(), DeliveryPending);
        const failed = (await database().query("SELECT * FROM pay_lab_source_outbox WHERE booking_id=$1", [r.requestId])).rows[0];
        assert.equal(failed.delivered_at, null); assert.equal(failed.attempts, 1);
        receiverDown = false;
        await database().query("UPDATE pay_lab_source_outbox SET next_at=now() WHERE booking_id=$1", [r.requestId]);
        await processOutbox();
        const recovered = (await database().query("SELECT * FROM pay_lab_source_outbox WHERE booking_id=$1", [r.requestId])).rows[0];
        assert.ok(recovered.delivered_at); assert.equal(recovered.body, failed.body); assert.equal(recovered.event_id, failed.event_id);
    } finally { receiverDown = false; names.forEach((name, i) => { if(previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }); }
});

test("developer inspector is scoped, read-only and rejects missing or ambiguous credentials", async () => {
 const {developerSource,developerEvidence}=await import("../../lib/session-gateway/developer");
 const previous={mode:process.env.PAY_LAB_DEPLOYMENT_MODE,stage:process.env.PAY_LAB_ENVIRONMENT,configs:process.env.PAY_LAB_CONNECTIONS};
 process.env.PAY_LAB_DEPLOYMENT_MODE="canonical";process.env.PAY_LAB_ENVIRONMENT="staging";process.env.GATEWAY_TEST_STAFF="separate-read-only-password-".repeat(3);
 process.env.PAY_LAB_CONNECTIONS=JSON.stringify([{...ca,staffUser:"alpha-reader"},{...cb,staffUser:"beta-reader"}]);
 try {
  const h=new Headers({host:"lab.test",authorization:`Basic ${Buffer.from(`alpha-reader:${process.env.GATEWAY_TEST_STAFF}`).toString("base64")}`});
  const user=developerSource(h);assert.equal(user?.id,"alpha");
  assert.equal(developerSource(new Headers({host:"lab.test"})),null);
  h.set("host","wrong.test");assert.equal(developerSource(h),null);h.set("host","lab.test");
  const evidence=await developerEvidence(a);assert.equal(evidence.source.id,"alpha");assert.ok(evidence.requests.every(r=>r.request.returnUrl===a.returnUrls[0]));
  assert.equal(JSON.stringify(evidence).includes(process.env.GATEWAY_TEST_STAFF),false);
  process.env.PAY_LAB_CONNECTIONS=JSON.stringify([{...ca,staffUser:"alpha-reader"},{...cb,staffUser:"alpha-reader"}]);assert.equal(developerSource(h),null);
 } finally {for(const [key,value] of Object.entries({PAY_LAB_DEPLOYMENT_MODE:previous.mode,PAY_LAB_ENVIRONMENT:previous.stage,PAY_LAB_CONNECTIONS:previous.configs})){if(value===undefined)delete process.env[key];else process.env[key]=value}delete process.env.GATEWAY_TEST_STAFF;}
});

test('Lab browser login cookie is expiring, host/source-bound and rejects tampering', async()=>{
 const {developerSource,loginCookie}=await import('../../lib/session-gateway/developer');
 process.env.PAY_LAB_DEPLOYMENT_MODE='canonical';process.env.PAY_LAB_ENVIRONMENT='staging';process.env.VERCEL_ENV='preview';process.env.PAY_LAB_CONNECTIONS=JSON.stringify([ca,cb]);process.env.PAY_LAB_SOURCES=JSON.stringify([a,b]);
 process.env.GATEWAY_TEST_STAFF='fixture-login-secret-at-least-32-characters';
 const cookie=loginCookie(a),h=new Headers({host:'lab.test',cookie:`__Host-getedge-lab=${cookie}`});
 assert.equal(developerSource(h)?.id,a.id);
 assert.equal(developerSource(new Headers({host:'other.test',cookie:`__Host-getedge-lab=${cookie}`})),null);
 h.set('cookie',`__Host-getedge-lab=${cookie.slice(0,-1)}${cookie.endsWith('0')?'1':'0'}`);assert.equal(developerSource(h),null);
 process.env.VERCEL_ENV='production';assert.equal(developerSource(new Headers({host:'lab.test',cookie:`__Host-getedge-lab=${cookie}`})),null);process.env.VERCEL_ENV='preview';
});

test('Portal-owned source works without Lab source entries or per-source environment keys; callback and retry recover it',async()=>{
 const {createHmac}=await import('node:crypto');
 const oldFetch=global.fetch,oldSources=process.env.PAY_LAB_SOURCES,oldConnections=process.env.PAY_LAB_CONNECTIONS;
 const registryKey='isolated-registry-fixture-not-a-real-key',rs={...b,modes:['vt','pbl'] as Source['modes'],presentations:['hosted'] as Source['presentations'],requestSecretEnv:'REGISTRY_ONLY_REQUEST',resultSecretEnv:'REGISTRY_ONLY_RESULT'},rc={...cb,signingSecretEnv:'REGISTRY_ONLY_PRIME'};
 const sign=(t:string,raw:string)=>createHmac('sha256',registryKey).update(`registry-v1\n${t}\n${raw}`).digest('hex');let unavailable=false;
 process.env.PAY_LAB_SOURCES=JSON.stringify([a]);process.env.PAY_LAB_CONNECTIONS=JSON.stringify([ca]);process.env.PAY_LAB_REGISTRY_ORIGIN='https://prime.test';process.env.PAY_LAB_REGISTRY_SECRET=registryKey;process.env.PAY_LAB_ENVIRONMENT='staging';process.env.VERCEL_ENV='preview';
 global.fetch=async(input,init)=>{
  if(String(input)==='https://prime.test/api/pay/lab-registry'){
   if(unavailable)return new Response('Unavailable',{status:503});const raw=String(init?.body),h=new Headers(init?.headers);assert.equal(h.get('x-getedge-registry-signature'),sign(h.get('x-getedge-registry-time')!,raw));const q=JSON.parse(raw);assert.ok(q.sourceId===b.id||q.integrationId===cb.integrationId);
   const body=JSON.stringify({nonce:q.nonce,source:rs,connection:rc,secrets:{REGISTRY_ONLY_REQUEST:process.env[b.requestSecretEnv],REGISTRY_ONLY_RESULT:process.env[b.resultSecretEnv],REGISTRY_ONLY_PRIME:process.env.GATEWAY_TEST_PRIME}}),t=String(Math.floor(Date.now()/1000));return new Response(body,{headers:{'x-getedge-registry-time':t,'x-getedge-registry-signature':sign(t,body)}});
  }return oldFetch(input,init);
 };
 try{
  assert.equal(process.env.REGISTRY_ONLY_REQUEST,undefined);
  const body=request(b,{mode:'pbl',amountMinor:8123,currency:'EUR',operator:{id:'external-operator',authenticatedAt:new Date().toISOString()}});
  const r=await create(b,body);assert.equal(r.launch.audience,'customer');assert.equal(r.amountMinor,8123);
  const vt=await create(b,request(b,{mode:'vt',operator:{id:'external-operator',authenticatedAt:new Date().toISOString()}}));assert.equal(vt.launch.audience,'staff');
  assert.equal((await sessionHandler(http(b,request(b)), 'session.create')).status,403);
  const snapshot=sessions.get(r.payment.sessionId)!;snapshot.revision++;snapshot.paymentState='approved';snapshot.sessionState='closed';snapshot.providerReference='fixture-not-NMI';
  const event={version:'1',type:'payment.updated',eventId:randomUUID(),data:snapshot},res=primeResponse(cb,event),raw=await res.text();res.headers.set('x-edge-event-id',event.eventId);res.headers.set('host','lab.test');
  for(let n=0;n<2;n++)assert.equal((await callbackHandler(new Request(cb.callbackUrl,{method:'POST',headers:res.headers,body:raw}))).status,200);
  const rows=(await database().query('SELECT event_id FROM pay_lab_source_outbox WHERE booking_id=$1 AND revision=2',[r.requestId])).rows;assert.equal(rows.length,1);
  await database().query("UPDATE pay_lab_source_outbox SET next_at=now()+interval '1 hour' WHERE event_id<>$1",[rows[0].event_id]);
  dropAck=true;assert.equal((await deliverBatch(1)).delivered,0);await database().query('UPDATE pay_lab_source_outbox SET next_at=now() WHERE event_id=$1',[rows[0].event_id]);assert.equal((await deliverBatch(1)).delivered,1);
  const recovered=await sessionHandler(http(b,{requestKey:body.requestKey},'session.status'),'session.status');assert.equal(recovered.status,200);assert.equal((await recovered.json()).payment.state,'approved');
  unavailable=true;assert.equal((await sessionHandler(http(b,{requestKey:body.requestKey},'session.status'),'session.status')).status,503);
  assert.equal(process.env.REGISTRY_ONLY_REQUEST,undefined);
 }finally{global.fetch=oldFetch;process.env.PAY_LAB_SOURCES=oldSources;process.env.PAY_LAB_CONNECTIONS=oldConnections;delete process.env.PAY_LAB_REGISTRY_ORIGIN;delete process.env.PAY_LAB_REGISTRY_SECRET;}
});
