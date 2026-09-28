import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../../lib/pay-lab/db";
import { Config, authorized, getConfig } from "../../lib/pay-lab/config";
import {
  canonical,
  launch,
  operatorSetup,
  receive,
  refresh,
  saveBooking,
  settings,
  submit,
} from "../../lib/pay-lab/service";
import { sign, verify } from "../../lib/pay-lab/transport";
import type { Snapshot } from "../../lib/pay-lab/contract";
const c: Config = {
  id: "fixture-a",
  name: "Fixture A",
  hosts: ["localhost:4198"],
  origin: "https://pay.example.test",
  integrationId: "integration-a",
  merchantId: "merchant-a",
  pairingId: "pair-a",
  environment: "staging",
  sourceId: "source-a",
  sourceType: "booking",
  signingSecretEnv: "LAB_TEST_SIGNING",
  staffPasswordEnv: "LAB_TEST_ACCESS",
  staffUser: "tester",
  routeRefs: ["ecom-gbp", "moto-gbp", "ecom-eur"],
  callbackUrl: "https://receiver.example.test/callback",
  returnUrls: ["https://booking.example.test/return"],
  collectScriptUrl: "https://provider.example.test/Collect.js",
  providerTestModeConfirmed: true,
  sample: {
    reference: "editable",
    amount: "12.50",
    currency: "GBP",
    sessionSeconds: 900,
  },
};
process.env.LAB_TEST_SIGNING = "test-only-signing-key-with-at-least-32-bytes";
process.env.LAB_TEST_ACCESS = "test-only-staff-password-more-than-24";
const routes = [
  {
    ref: "ecom-gbp",
    label: "Online GBP",
    currency: "GBP",
    channel: "ECOM",
    presentation: "hosted_customer",
  },
  {
    ref: "moto-gbp",
    label: "Telephone GBP",
    currency: "GBP",
    channel: "MOTO",
    presentation: "operator_card",
  },
  {
    ref: "ecom-eur",
    label: "Online EUR",
    currency: "EUR",
    channel: "ECOM",
    presentation: "hosted_customer",
  },
];
const sessions = new Map<string, Snapshot>();
let submissions = 0,
  failSubmit = false;
const originalFetch = global.fetch;
function signed(body: unknown, config = c) {
  const raw = JSON.stringify(body),
    timestamp = String(Math.floor(Date.now() / 1000));
  const headers = new Headers({
    "x-edge-integration-id": config.integrationId,
    "x-edge-signature-timestamp": timestamp,
    "x-edge-signature-v2": sign(process.env.LAB_TEST_SIGNING!, timestamp, raw),
  });
  return { raw, headers };
}
function booking(overrides = {}) {
  return {
    id: randomUUID(),
    reference: "booking-" + randomUUID(),
    amount: "12.50",
    currency: "GBP",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    ...overrides,
  };
}
before(async () => {
  global.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname.replace("/api/pay/v1/", "");
    const body = JSON.parse(String(init?.body));
    verify(c, String(init?.body), new Headers(init?.headers));
    const scope = {
      version: "1",
      merchantId: body.merchantId,
      pairingId: body.pairingId,
      environment: body.environment,
    };
    let value: unknown;
    if (path === "routes") value = { ...scope, routes };
    else if (path === "configuration")
      value = { ...scope, callbackUrl: c.callbackUrl };
    else if (path === "sessions") {
      let s = [...sessions.values()].find(
        (s) => s.source.obligationId === body.source.obligationId,
      );
      if (!s) {
        s = {
          ...scope,
          sessionId: randomUUID(),
          saleId: randomUUID(),
          revision: 1,
          source: {
            id: body.merchantId === "merchant-b" ? "source-b" : c.sourceId,
            type: c.sourceType,
            ...body.source,
          },
          amountMinor: body.amountMinor,
          currency: body.currency,
          expiresAt: body.expiresAt,
          paymentState: "awaiting",
          sessionState: "open",
          providerReference: null,
          route: routes.find((r) => r.ref === body.routeRef)!,
        } as Snapshot;
        sessions.set(s.sessionId, s);
      }
      value = s;
    } else {
      const s = sessions.get(body.sessionId);
      assert.ok(s);
      if (path === "sessions/status") value = s;
      else if (path === "links")
        value = {
          ...s,
          checkoutUrl: `${c.origin}/getedge-pay/checkout/${s.sessionId}`,
        };
      else if (path === "sessions/operator/setup")
        value = {
          ...s,
          operatorSetup: {
            tokenizationKey: "public-test-key",
            fields: {
              customerName: "hidden",
              email: "hidden",
              billingPostcode: "hidden",
            },
          },
        };
      else if (path === "sessions/operator/pay") {
        submissions++;
        if (failSubmit) throw Error("Simulated lost response");
        s.revision++;
        s.paymentState = "approved";
        s.sessionState = "closed";
        s.providerReference = "fixture-reference";
        value = s;
      } else throw Error("Unexpected endpoint");
    }
    const response = signed(value);
    return new Response(response.raw, { headers: response.headers });
  };
});
after(async () => {
  global.fetch = originalFetch;
  await database().end();
});
test("connection configuration is host-scoped and requires staff credentials", () => {
  process.env.PAY_LAB_CONNECTIONS = JSON.stringify([c]);
  assert.equal(getConfig("localhost:4198").id, c.id);
  assert.throws(() => getConfig("another.test"));
  assert.equal(authorized(c, new Headers()), false);
  assert.equal(
    authorized(
      c,
      new Headers({
        authorization:
          "Basic " +
          Buffer.from("tester:" + process.env.LAB_TEST_ACCESS).toString(
            "base64",
          ),
      }),
    ),
    true,
  );
});
test("configuration comes from signed grants and immutable callback registration", async () => {
  assert.equal((await settings(c)).routes.length, 3);
  await assert.rejects(() =>
    settings({ ...c, callbackUrl: "https://wrong.test/callback" }),
  );
});
test("exact creation retries recover one booking and reject changed amount", async () => {
  const b = booking();
  await Promise.all([saveBooking(c, b), saveBooking(c, b)]);
  await assert.rejects(() => saveBooking(c, { ...b, amount: "99.00" }));
  const [a, d] = await Promise.all([
    launch(c, b.id, "ecom-gbp"),
    launch(c, b.id, "ecom-gbp"),
  ]);
  assert.equal(a.snapshot?.sessionId, d.snapshot?.sessionId);
  assert.ok(a.checkoutUrl);
  assert.equal(a.snapshot?.paymentState, "awaiting");
  await assert.rejects(() => launch(c, b.id, "moto-gbp"));
});
test("unknown routes, malformed amounts, expired requests and unregistered returns fail closed", async () => {
  for (const props of [
    { amount: "0.00" },
    { amount: "1.001" },
    { expiresAt: "2000-01-01T00:00:00Z" },
    { returnUrl: "https://evil.test/return" },
  ])
    await assert.rejects(() => saveBooking(c, booking(props)));
  const b = booking();
  await saveBooking(c, b);
  await assert.rejects(() => launch(c, b.id, "unknown"));
  await assert.rejects(() =>
    launch({ ...c, providerTestModeConfirmed: false }, b.id, "ecom-gbp"),
  );
});
test("another configured source and changed currency/expiry work without source branches", async () => {
  const other = {
    ...c,
    id: "fixture-b",
    merchantId: "merchant-b",
    sourceId: "source-b",
  };
  const b = booking({
    amount: "23.75",
    currency: "EUR",
    expiresAt: new Date(Date.now() + 1200000).toISOString(),
  });
  await saveBooking(other, b);
  const r = await launch(other, b.id, "ecom-eur");
  assert.equal(r.snapshot?.amountMinor, 2375);
  assert.equal(r.snapshot?.source.id, "source-b");
  await assert.rejects(() => refresh(c, b.id));
});
test("signed callback application is durable, deduplicated and rejects changed payload or foreign amount", async () => {
  const b = booking();
  await saveBooking(c, b);
  const r = await launch(c, b.id, "ecom-gbp");
  const data = {
    ...r.snapshot!,
    revision: 2,
    paymentState: "approved",
    sessionState: "closed",
    providerReference: "fixture-approval",
  };
  const event = {
    version: "1",
    type: "payment.updated",
    eventId: randomUUID(),
    data,
  };
  const message = signed(event);
  message.headers.set("x-edge-event-id", event.eventId);
  await Promise.all([
    receive(c, message.raw, message.headers),
    receive(c, message.raw, message.headers),
  ]);
  const { rows } = await database().query(
    "SELECT snapshot,callback_count FROM pay_lab_bookings WHERE id=$1",
    [b.id],
  );
  assert.equal(rows[0].callback_count, 1);
  assert.equal(rows[0].snapshot.paymentState, "approved");
  const forged = signed({ ...event, data: { ...data, amountMinor: 1 } });
  forged.headers.set("x-edge-event-id", event.eventId);
  await assert.rejects(() => receive(c, forged.raw, forged.headers));
  const changed = signed({
    ...event,
    data: { ...data, providerReference: "changed" },
  });
  changed.headers.set("x-edge-event-id", event.eventId);
  await assert.rejects(() => receive(c, changed.raw, changed.headers));
  const old = { ...event, eventId: randomUUID(), data: r.snapshot };
  const msg = signed(old);
  msg.headers.set("x-edge-event-id", old.eventId);
  await receive(c, msg.raw, msg.headers);
  const current = await database().query(
    "SELECT snapshot FROM pay_lab_bookings WHERE id=$1",
    [b.id],
  );
  assert.equal(current.rows[0].snapshot.paymentState, "approved");
});
test("MOTO concurrent submissions dispatch only one provider instruction", async () => {
  const b = booking();
  await saveBooking(c, b);
  await launch(c, b.id, "moto-gbp");
  const setup = await operatorSetup(c, b.id);
  assert.equal(setup.setup.fields.customerName, "hidden");
  const before = submissions;
  const results = await Promise.allSettled([
    submit(c, b.id, { paymentToken: "fixture-token" }),
    submit(c, b.id, { paymentToken: "fixture-token" }),
  ]);
  assert.equal(submissions - before, 1);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(() => submit(c, b.id, { paymentToken: "another" }));
});
test("lost MOTO response preserves dispatched hold and prevents fresh submission", async () => {
  const b = booking();
  await saveBooking(c, b);
  await launch(c, b.id, "moto-gbp");
  failSubmit = true;
  await assert.rejects(() => submit(c, b.id, { paymentToken: "fixture-lost" }));
  failSubmit = false;
  const saved = await refresh(c, b.id);
  assert.equal(saved.submissionUncertain, true);
  await assert.rejects(() => operatorSetup(c, b.id));
  const { rows } = await database().query(
    "SELECT request,booking FROM pay_lab_bookings WHERE id=$1",
    [b.id],
  );
  assert.ok(!JSON.stringify(rows).includes("fixture-lost"));
});
test("tampering and stale signatures are rejected", () => {
  const msg = signed({ ok: true });
  assert.throws(() => verify(c, msg.raw + " ", msg.headers));
  msg.headers.set("x-edge-signature-timestamp", "1000000000");
  assert.throws(() => verify(c, msg.raw, msg.headers));
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
});

test("HTTP boundary rejects missing staff access and cross-origin mutations", async () => {
  const { NextRequest } = await import("next/server");
  const { GET, POST } = await import("../../app/api/pay-lab/[...action]/route");
  process.env.PAY_LAB_CONNECTIONS = JSON.stringify([c]);
  const unauthorized = await GET(
    new NextRequest("http://localhost:4198/api/pay-lab/settings", {
      headers: { host: "localhost:4198" },
    }),
    { params: Promise.resolve({ action: ["settings"] }) },
  );
  assert.equal(unauthorized.status, 401);
  const blocked = await POST(
    new NextRequest("http://localhost:4198/api/pay-lab/bookings", {
      method: "POST",
      headers: {
        host: "localhost:4198",
        origin: "https://foreign.example.test",
        authorization:
          "Basic " +
          Buffer.from(`tester:${process.env.LAB_TEST_ACCESS}`).toString(
            "base64",
          ),
      },
      body: JSON.stringify(booking()),
    }),
    { params: Promise.resolve({ action: ["bookings"] }) },
  );
  assert.equal(blocked.status, 403);
  const unknown = await GET(
    new NextRequest("http://localhost:4198/api/pay-lab/settings", {
      headers: { host: "unregistered.test" },
    }),
    { params: Promise.resolve({ action: ["settings"] }) },
  );
  assert.equal(unknown.status, 503);
});
