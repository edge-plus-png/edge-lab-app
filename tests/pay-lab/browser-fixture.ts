// Local UI fixture only. No provider calls, no live credentials, no approved-payment simulation.
import next from "next";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { sign } from "../../lib/pay-lab/transport";
const port = 4198;
const cfg = {
  id: "browser-fixture",
  name: "LOCAL QA · simulated Pay transport",
  hosts: [`127.0.0.1:${port}`],
  origin: "https://pay.fixture.test",
  integrationId: "ui-fixture",
  merchantId: "fixture-merchant",
  pairingId: "fixture-pair",
  environment: "staging",
  sourceId: "fixture-source",
  sourceType: "booking",
  signingSecretEnv: "LAB_BROWSER_SIGNING",
  staffPasswordEnv: "LAB_BROWSER_ACCESS",
  staffUser: "fixture",
  routeRefs: ["online", "telephone"],
  callbackUrl: "https://receiver.fixture.test/callback",
  returnUrls: [],
  collectScriptUrl: "https://provider.fixture.test/Collect.js",
  providerTestModeConfirmed: true,
  sample: {
    reference: "QA-BOOKING",
    amount: "12.50",
    currency: "GBP",
    sessionSeconds: 1800,
  },
};
process.env.PAY_LAB_CONNECTIONS = JSON.stringify([cfg]);
process.env.LAB_BROWSER_SIGNING =
  "local-fixture-signing-value-not-a-real-secret";
process.env.LAB_BROWSER_ACCESS = "local-fixture-access-value-not-a-real-secret";
const originalFetch = global.fetch;
const sessions = new Map();
global.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== cfg.origin) return originalFetch(input, init);
  const path = url.pathname.split("/api/pay/v1/")[1],
    body = JSON.parse(String(init?.body));
  const scope = {
    version: "1",
    merchantId: cfg.merchantId,
    pairingId: cfg.pairingId,
    environment: "staging",
  };
  const routes = [
    {
      ref: "online",
      label: "Fixture online route",
      channel: "ECOM",
      currency: "GBP",
      presentation: "hosted_customer",
    },
    {
      ref: "telephone",
      label: "Fixture telephone route",
      channel: "MOTO",
      currency: "GBP",
      presentation: "operator_card",
    },
  ];
  let result;
  if (path === "routes") result = { ...scope, routes };
  else if (path === "configuration")
    result = { ...scope, callbackUrl: cfg.callbackUrl };
  else if (path === "sessions") {
    result = [...sessions.values()].find(
      (s) => s.source.obligationId === body.source.obligationId,
    );
    if (!result) {
      result = {
        ...scope,
        sessionId: randomUUID(),
        saleId: randomUUID(),
        revision: 1,
        source: { id: cfg.sourceId, type: cfg.sourceType, ...body.source },
        amountMinor: body.amountMinor,
        currency: body.currency,
        expiresAt: body.expiresAt,
        paymentState: "awaiting",
        sessionState: "open",
        providerReference: null,
        route: routes.find((r) => r.ref === body.routeRef),
      };
      sessions.set(result.sessionId, result);
    }
  } else if (path === "sessions/status") result = sessions.get(body.sessionId);
  else if (path === "links")
    result = {
      ...sessions.get(body.sessionId),
      checkoutUrl: `${cfg.origin}/checkout/${body.sessionId}`,
    };
  else if (path === "sessions/operator/setup")
    return new Response("", { status: 503 });
  else throw Error("No payment processing is available in the UI fixture");
  const raw = JSON.stringify(result),
    timestamp = String(Math.floor(Date.now() / 1000));
  return new Response(raw, {
    headers: {
      "content-type": "application/json",
      "x-edge-integration-id": cfg.integrationId,
      "x-edge-signature-timestamp": timestamp,
      "x-edge-signature-v2": sign(
        process.env.LAB_BROWSER_SIGNING!,
        timestamp,
        raw,
      ),
    },
  });
};
async function main() {
  const app = next({ dev: false, hostname: "127.0.0.1", port });
  await app.prepare();
  const handler = app.getRequestHandler();
  createServer((req, res) => {
    // Local fixture user only. Authentication rejection is covered separately; never deploy this harness.
    req.headers.authorization =
      "Basic " +
      Buffer.from(`fixture:${process.env.LAB_BROWSER_ACCESS}`).toString(
        "base64",
      );
    void handler(req, res);
  }).listen(port, "127.0.0.1", () =>
    console.log(`LOCAL UI FIXTURE http://127.0.0.1:${port}/collect`),
  );
}
main();
