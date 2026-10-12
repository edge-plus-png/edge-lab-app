# GetEdge Pay: developer integration guide

Deployment readiness: see [4 October continuation](BUILD-STATUS-2026-10-04.md). External sandbox onboarding is not yet accepted; the staging access gates remain open.
Phase 2 implementation candidate, 3 October 2026. The executable reference is Events. Local cross-service acceptance exercises actual Events, Lab and Prime services and databases, with simulated NMI responses and local transport. **Actual NMI sandbox/browser acceptance and staging onboarding are still pending.** Do not interpret example IDs, screenshots or local test counts as a settled provider payment.

## Integration boundary

Your server → Lab signed session v2 → Prime GetEdge Pay public API → NMI → Prime persisted result → signed Prime-to-Lab notification → Lab persisted event → signed callback to your server → your order.

You do not integrate with NMI, receive NMI credentials, or collect card data in your own generic form. Hosted and embedded checkout both belong to Prime. Lab does not host a fallback card form. NMI's `/api/v5/payments/sale` version is independent of the developer-facing session v2 contract.

This phase proves ECOM integration mechanics. Terminal is excluded. VT/PBL modes exist in the wider contract but are not certified by this phase's ECOM acceptance.

## What GetEdge supplies

GetEdge issues a source ID, assigned HTTPS session endpoint, a server-to-server request-signing secret, a separate response/event verification secret, allowed checkout origins and a confirmed test configuration. It supplies enabled currencies/products, maximum session lifetime, registered destinations and the applicable delivery policy. Secrets are delivered privately, never in browser code, URLs, screenshots or example payloads. Lab's Prime credential is not a developer credential.

The intended staging endpoint is `https://staging.edge-lab.uk/api/session`; **use it only after GetEdge confirms the canonical deployment and your connection are active**. Older production Anytime/App domains are not substitutes and may run the legacy contract.

## What you provide

- Developer technical contact and the intended merchant/account.
- Your staging server callback URL, exact browser return URL and (for embedding) exact HTTPS origin.
- Required currency/product capabilities and maximum request lifetime.
- Your order/reference model and how a payment maps to an outstanding obligation.
- A public machine-reachable callback: no interactive hosting login, redirects or browser-only authentication.

GetEdge registers this configuration and a Prime route for the correct merchant. Your server installs its two secrets. Test and live secrets, destinations and orders must be isolated.

## Authentication

All calls are server-side POSTs with `Content-Type: application/json` and these headers:

```
x-getedge-version: 2
x-getedge-source: <assigned source ID>
x-getedge-timestamp: <Unix seconds>
x-getedge-signature: <lowercase hex HMAC-SHA256>
```

The signed bytes are UTF-8:

```
2\n<TIMESTAMP>\n<OPERATION>\n<SOURCE_ID>\n<EXACT_RAW_JSON_BODY>
```

Here `\n` denotes a newline byte, not two literal characters. Operations are `session.create`, `session.status`, `session.create.response`, `session.status.response`, and `result`. Request calls use the request secret. Successful responses and events use the result secret. Timestamps must be within 300 seconds; synchronise your clock. Re-sign retries with the current time while preserving request identity and contents.

Verify the signature against the raw body **before parsing or acting on it**. A re-serialised JSON object is not necessarily the same byte sequence. Check version and source ID, use constant-time comparison, and limit the body to 512 KiB. The supplied [Node example](../../examples/session-v2/client.mjs) implements transport and signature verification and is checked against the actual Lab signing functions.

## Create a session

POST to the assigned `/api/session` endpoint. Save the immutable request in your database before sending it.

| Field | Required | Meaning |
|---|---|---|
| `requestKey` | Yes | Unique retry/idempotency identity; retain across retries |
| `obligationId` | Yes | Your immutable outstanding-payment obligation ID |
| `reference` | Yes | Human-readable order/booking reference, up to 200 characters |
| `amountMinor` | Yes | Positive integer minor units; request limit 999999999; only configured currencies |
| `currency` | Yes | Three-letter uppercase configured currency; current Prime adapter supports two-decimal currencies |
| `mode` | Yes | `ecom` for this customer checkout integration |
| `presentation` | Yes | `hosted` or explicitly enabled `inline` |
| `expiresAt` | Yes | Future ISO timestamp with timezone, within assigned lifetime |
| `returnUrl` | Required for inline | Exact registered return destination; use it for hosted return as well |
| `embeddingOrigin` | Inline only | Exact registered HTTPS origin matching the return origin |
| `description` | No | Up to 500 characters |
| `customer` | No | Known customer data; omit unknown data rather than inventing it |
| `customerCollection` | No | Per-field `hidden`, `optional`, `required` policy for `customerName`, `email`, `billingPostcode` |
| `operator` | Not for ECOM | Rejected for customer checkout; reserved for staff flows |

Customer fields supported: `customerName`, `businessName`, `phone`, `firstName`, `lastName`, `email`, `billingAddress`, `shippingAddress`. Address fields: `address1`, `address2`, `city`, `state`, `postcode`, `country` (two-letter uppercase). These objects are strict; do not send PAN, CVV, provider keys or arbitrary Opayo fields. Provider authentication may ask for missing technical data separately from optional merchant business collection.

Example fixture — generate real identities and a fresh expiry from your own order:

```json
{
  "requestKey": "d23d1a01-3454-4551-a372-17018b82e840",
  "obligationId": "0214e690-7929-4b92-b3c7-c2c9e8c9f640",
  "reference": "BOOKING-EXAMPLE-42",
  "amountMinor": 4999,
  "currency": "GBP",
  "mode": "ecom",
  "presentation": "hosted",
  "expiresAt": "2026-10-03T12:10:00.000Z",
  "returnUrl": "https://your-staging.example/payment/return"
}
```

The sample expiry is illustrative and will expire; it is not a working static request. In code:

```js
import { randomUUID } from 'node:crypto';
import { call } from './client.mjs';
const request = {
  requestKey: randomUUID(), obligationId: savedOrder.obligationId,
  reference: savedOrder.reference, amountMinor: savedOrder.amountMinor,
  currency: savedOrder.currency, mode: 'ecom', presentation: 'hosted',
  expiresAt: savedOrder.paymentExpiresAt, returnUrl: config.returnUrl
};
// Persist once; all retries load the saved request rather than regenerate IDs.
const result = await call(config, 'session.create', JSON.stringify(request));
// Match reference/money/requestKey/obligationId and persist returned IDs.
```

Example immediate signed success response (IDs/URL are fixtures):

```json
{
  "version": "2",
  "requestId": "518ebf88-a773-426f-8f3d-cd0c06d3dd03",
  "requestKey": "d23d1a01-3454-4551-a372-17018b82e840",
  "obligationId": "0214e690-7929-4b92-b3c7-c2c9e8c9f640",
  "reference": "BOOKING-EXAMPLE-42",
  "mode": "ecom", "presentation": "hosted",
  "amountMinor": 4999, "currency": "GBP",
  "expiresAt": "2026-10-03T12:10:00.000Z",
  "launch": { "url": "https://assigned-prime.example/getedge-pay/checkout/<scoped-token>", "presentation": "hosted", "audience": "customer" },
  "payment": { "sessionId": "prime-session-id", "saleId": "prime-sale-id", "revision": 1, "state": "awaiting", "sessionState": "open", "providerReference": null },
  "delivery": { "event_id": "notification-id", "revision": 1, "attempts": 0, "delivered_at": null, "exhausted_at": null }
}
```

`launch`, `payment` and `delivery` can be null where no corresponding record exists. Delivery describes the latest queued revision, not confirmation that your order is paid. Treat URLs as scoped capabilities: do not log their tokens. Validate the returned launch origin against the origins GetEdge supplied.

## What to persist

Persist your order ID, immutable obligation/requestKey and request bytes, Lab requestId, Prime sessionId/saleId, payment state/revision, providerReference when present, and callback receipts keyed by eventId with a payload hash. Retain mapping to the original merchant/source. Display the human reference in support tools; use stable IDs for correlation.

Never store card data or use the browser as the source of truth. Changing amount, currency, reference or mode under an existing obligation is a conflict, not a fresh payment.

## Hosted checkout

Redirect the customer to the verified `launch.url`. Prime provides payment collection and authentication, then executes via its configured provider. The browser may return before your callback arrives, or never return at all. On your return page, show saved state and perform a server-side status recovery. Only a verified approved result confirms payment.

## Embedded checkout

Create with `presentation: "inline"`, `embeddingOrigin` and matching registered `returnUrl`. After verifying the response, render the returned URL in an iframe with `allow="payment"` and `referrerpolicy="no-referrer"`. Do not iframe the old Lab card page or create your own fallback inputs.

The Prime component emits `source: "getedge-pay-embed"`; resize messages use `event: "checkout.height_changed"` and `payload.heightPx`. Validate `event.origin` against the assigned checkout origin and `event.source` against your iframe's contentWindow. Clamp height. Payment outcome messages have no settlement authority: request server status instead. Actual cross-origin/3DS browser acceptance remains required before enabling inline for a developer.

## Signed events

Lab POSTs JSON to your configured callback with the four signing headers plus `x-getedge-event-id`. Example:

```json
{
  "version": "2", "type": "payment.updated", "eventId": "event-id",
  "requestId": "lab-request-id", "requestKey": "your-saved-request-key",
  "obligationId": "your-saved-obligation", "reference": "BOOKING-EXAMPLE-42",
  "mode": "ecom", "amountMinor": 4999, "currency": "GBP",
  "payment": {
    "sessionId": "prime-session-id", "saleId": "prime-sale-id", "revision": 3,
    "state": "approved", "sessionState": "closed", "providerReference": "provider-transaction-id"
  }
}
```

Authenticate using operation `result` and your result secret. Then validate the event schema, header event ID, source, order mapping, amount, currency and already-bound payment IDs. The example's `verifyEvent` performs basic matching; implement database receipt/revision handling as below.

In one transaction: lock your obligation/order; reject an event ID reused with different content; record the receipt; ignore stale revisions; reject conflicting same-revision state; prevent an approved payment regressing or changing provider reference; apply the payment and order transition once. Commit before returning HTTP 200 JSON:

```json
{"eventId":"event-id","accepted":true}
```

Acknowledging receipt is not itself a payment approval. Return the same acknowledgement for an already committed duplicate. If verification or durable persistence fails, do not acknowledge acceptance. Do not send emails or issue tickets twice; use your existing durable fulfilment mechanism. Events flags late approval for review when the booking has expired rather than issuing tickets automatically.

## Status, retry and recovery

POST `{ "requestKey": "the-original-key" }` to `<session endpoint>/status`, signing as `session.status`. Verify `session.status.response` exactly like creation, then apply the same correlation/revision rules as a callback.

If creation times out, query the saved key. If the request is not found, resend the original immutable creation request with a fresh signature. Never create a new obligation merely because a response was lost. If expiry prevents creation, resolve that order explicitly; do not silently extend its saved expiry.

Callbacks are at least once. Lab retains each event's identity/body/destination, retries according to the assigned policy and records exhaustion. GetEdge can inspect/replay an exhausted delivery without another charge. Both Prime → Lab and Lab → developer have durable delivery records. Browser return is independent. If your callback is unavailable, signed status can still recover the result.

| State | Developer action |
|---|---|
| `approved` | Confirm the matching order once, subject to late-order review |
| `declined` | Leave unpaid; show a verified decline; recover the existing session before further action |
| `cancelled` | Leave unpaid; reflect authoritative cancellation |
| `awaiting`, `requires_action`, `processing`, `pending` | Not yet confirmed; recover status |
| `unknown` | Outcome uncertain; do not start a replacement charge; contact support/reconcile |
| `expired` or expired session | Stop new submission; check for a late/unknown result before replacing |

Closing a tab is not cancellation. Session v2 currently has no developer cancellation operation; Prime's authorised lifecycle can emit cancellation. The local cancellation acceptance exercises that lifecycle. Do not invent `/api/session/cancel`.

## Sandbox procedures and troubleshooting

GetEdge verifies the merchant's account test mode and route before enabling payment execution. Use the test cards and 3DS procedures applicable to that configured NMI account. No fixed card list is certified in this candidate; obtain the account-specific procedure from GetEdge. Never use live cards or change a live gateway's mode for this demonstration.

Run approval, decline, cancellation, duplicate submission, lost creation response, callback outage, lost callback acknowledgement, expiry/late result, and refresh/reopen. For inline, also exercise real authentication across origins. The executable local cross-service tests simulate provider responses and authentication evidence; they cannot prove NMI processing or 3DS.

For support provide timestamp, environment, source ID, order reference, requestKey/obligationId, Lab requestId, Prime sessionId/saleId, event ID/revision and providerReference if present. Do not send signing secrets, scoped checkout tokens, card data or CAVV.

- 401/version failure: assigned source, host, clock, operation and exact raw-body signing.
- 403/409: registered capability/destination, immutable request conflict or expired request.
- 502/503/timeout: recover saved status; investigate Prime availability/configuration.
- HTML/redirect instead of JSON: hosting protection or wrong endpoint.
- Payment approved but order unpaid: inspect each callback hop and acknowledgement; recover signed status.
- Blank/broken frame: registered origin, Prime frame policy, component message identifier and browser console; do not fall back to card fields.

## Moving to live

The canonical Phase 2 deployment explicitly refuses production mode. Promotion to live is a separate reviewed release after provider/browser acceptance. Issue distinct live credentials, register live destinations/origins, select merchant-approved live routes in Prime, verify delivery workers and monitoring, and repeat acceptance appropriate to live rollout. Do not reuse test obligations or change an existing test session to live. The developer's request and event contract stays the same; credentials, endpoint/configuration and provider routing change through onboarding.
