# GetEdge Pay lab session API v2

Implementation candidate, 28 September 2026. This extends the existing `edge-lab-app`; it does not change Prime or deploy anything. Local tests use real disposable PostgreSQL with simulated signed Prime responses. Provider payments, 3DS, cross-origin card fields and external Events/Anytime acceptance remain unverified.

## Architecture and journeys

Events and Anytime are ordinary authenticated source applications. Both use the same contract; no payment behaviour branches on their names. Their servers call the lab; the lab uses the existing signed GetEdge Pay APIs in Prime. Partners do not receive NMI keys or integrate with its transaction API.

| Mode | Prime request | Audience | Result |
| --- | --- | --- | --- |
| `ecom` | `sessions` then `links` | Customer | Direct customer checkout |
| `vt` | `collections`, only `telephone_payment` | Staff | Telephone card entry |
| `pbl` | `collections`, only `payment_link` | Staff, then customer | Link creation/recovery, followed by separate customer checkout |

Presentation is `hosted` or `inline`; it does not change processing classification. PBL inline embeds the staff collection experience, not a shared staff/customer authority. Card-present is rejected as an unsupported mode in this version.

## Versioning and compatibility

Use signed `POST /api/session` with `x-getedge-version: 2`. Existing requests without any `x-getedge-*` headers retain the legacy customer route and callback contract. A new-style body without versioned authentication fails closed. Unknown versions never fall back to the old provider path. Version 2 does not use legacy host-derived tenant identity or fixed CORS lists; it is a server-to-server API.

Use staging first: `https://staging.edge-lab.uk/api/session`. Planned published entry points are `https://app.edge-lab.uk/api/session` and `https://anytime.edge-lab.uk/api/session`, once accepted and deliberately promoted. Configured host grants are required even when DNS points to this application. A Production hosting alias is not evidence of provider live/test mode.

## Authentication

Provision separate request-signing and result-verification secrets for each source in the server secret store. Never reuse the staff Basic login or expose these secrets in browser code.

Headers: `content-type: application/json`, `x-getedge-version: 2`, `x-getedge-source`, `x-getedge-timestamp` (Unix seconds), and `x-getedge-signature` (lowercase HMAC-SHA256 hex).

Sign exact UTF-8 request bytes using the source request secret:

```text
2\n{timestamp}\n{operation}\n{sourceId}\n{rawBody}
```

The separators are actual newline bytes. Operations: `session.create` and `session.status`. Timestamps have a five-minute tolerance. TLS, operation binding, persisted request identity and immutable payload comparison protect the boundary; refreshing the signature on a retry must not change the saved request.

Successful replies use the source result secret, the same header names, and operation `session.create.response` or `session.status.response`. Verify these replies before opening a launch URL. Error bodies are unsigned diagnostics, never proof of a payment outcome.

Executable signing and verification: `examples/session-gateway/client.mjs`.

## Create request

Example values below are explicitly illustrative inputs, not application defaults:

```json
{
  "requestKey": "persisted-request-identifier",
  "obligationId": "order-123-balance-1",
  "reference": "ORDER-123",
  "amountMinor": 4999,
  "currency": "GBP",
  "mode": "ecom",
  "presentation": "hosted",
  "expiresAt": "2026-10-01T12:00:00Z",
  "returnUrl": "https://partner.example/payment-return"
}
```

Supply an actual future expiry within the configured policy. `amountMinor` is an integer; no floating-point conversion or currency guessing is performed by the public API. The existing lab's internal booking storage encodes this integer as a two-place string and decodes it exactly before sending to Prime; that internal encoding is not an assertion that every currency has two fractional digits.

`requestKey` is stable across network retries. `obligationId` is stable for that amount due. A changed amount, mode or request key for an already-bound obligation returns 409; there is no automatic switch to a competing collection. Prime receives a persisted lab UUID as its obligation/idempotency identity, with the source's original identities preserved in the lab and results.

For `vt`/`pbl`, include `operator: { "id": "actual-source-staff-id", "authenticatedAt": "actual-recent-ISO-timestamp" }`. The source server attests that it authenticated and authorised this staff member. New requests require attestation within five minutes. This is recorded in the immutable request/audit; it does not impersonate a Prime portal user. The source must deliver a staff launch only into the authorised back office and protect it as a bearer capability.

For inline, include the exact registered `embeddingOrigin`. ECOM also requires an explicit registered `returnUrl` on that origin because Prime derives the customer iframe allowlist from it. Staff embedding uses Prime's collection `embeddingOrigin`. Prime independently enforces its own permissions. The caller must handle iframe resizing/events according to Prime's embedded contract and must not treat browser events as payment confirmation.

Optional: description, supplied customer details (names, email, phone, businessName, billingAddress/shippingAddress), and customerCollection policy. Address fields are address1, address2, city, state, postcode, country (two-letter uppercase). Unknown fields are rejected. Omitted business collection stays omitted; no dummy values are fabricated. This is not an Opayo wire-protocol proxy and supports payment only, not AUTHENTICATE/deferred capture/recurring parity.

## Response and recovery

Successful replies contain `version`, `requestId`, `requestKey`, `obligationId`, `reference`, `mode`, `presentation`, `amountMinor`, `currency`, `expiresAt`, `launch`, `payment`, and latest `delivery` metadata.

`launch` is `{url,presentation,audience}` or null. Customer launch is for ECOM; staff launch is for VT/PBL. Inline ECOM uses the verified Prime checkout URL with `embed=1`; staff inline uses Prime's returned embed URL. Never blindly frame a normal hosted URL or downgrade an unsupported inline request.

`payment` is null until a collection has selected its underlying payment session, otherwise contains sessionId, saleId, revision, state, sessionState and providerReference. Pending/awaiting or a created link is not approval.

Use signed `POST /api/session/status` with `{ "requestKey": "the-original-key" }` to recover. Recovery reuses saved identity/routes/destinations and may replay the identical Prime creation request after a lost reply. It never executes a new charge. Keep connection identity and old secret references available during configuration/credential migration.

## Two result-delivery legs

Register Prime's receiver as the actual lab `https://<configured-host>/api/session/callback`. It identifies the configured dedicated Prime integration, verifies Prime's raw-body HMAC and event identity, and validates the saved payment scope/reference/money/route before changing state.

The lab stores a source outbox event in the same database transaction as the verified snapshot. Signed status recovery can also enqueue a newly observed revision. One event exists per source payment revision; duplicate Prime delivery cannot enqueue it twice. Old revisions cannot roll back state or generate stale new notifications. Initial awaiting snapshots may also generate notifications; a notification alone never implies payment success.

The lab POSTs the exact saved event bytes to the source callback frozen at request creation. Headers follow v2 signing with operation `result`, plus `x-getedge-event-id`. Fields include version, type `payment.updated`, eventId, requestId, requestKey, obligationId, reference, mode, amountMinor, currency, and payment snapshot fields.

The source verifies the HMAC using its result secret, validates the expected request binding and money, deduplicates eventId, applies revisions monotonically under a database transaction, and returns HTTP 2xx JSON `{ "eventId": "received-id", "accepted": true }` only after durable receipt. Do not interpret this acknowledgement as a provider approval. Ordering is not guaranteed; consumers must compare revisions.

A worker claims with leases/fencing, uses bounded HTTP timeouts and no redirects, retries identical bytes with fresh signatures, and records exhaustion after configured attempts. Lost acknowledgements can cause duplicate delivery. Disabling a source stops sending but consumes bounded attempts; restore/rotation procedures must account for saved signing-secret references. Callbacks contain no launch bearer URL or customer card data.

## Normal configuration

1. Create a dedicated test connection in Prime through Connections. Verify actual provider test mode; a lab boolean is only an attestation. Grant the actual ECOM/MOTO routes and staff actions. The lab remains staging-only.
2. Install the existing `PAY_LAB_CONNECTIONS` configuration and Prime signing secret server-side. Each v2 source needs a dedicated lab connection/Prime integration. Set its callbackUrl to the lab receiver; keep source callback configuration separate.
3. Add the source to `PAY_LAB_SOURCES`, an array validated by `lib/session-gateway/config.ts`. Required properties:
   - id, connectionId, hosts, enabled.
   - requestSecretEnv, resultSecretEnv, callbackUrl, returnUrls, embeddingOrigins.
   - modes, presentations, routes (currency → explicit ecom/vt/pbl route references).
   - maxSessionSeconds.
   - delivery: maxAttempts, retrySeconds, timeoutSeconds, leaseSeconds (greater than timeout).
4. Configure the isolated lab `PAY_LAB_DATABASE_URL` and run `npm run db:pay-lab` before activating this release. This adds external request identity and source outbox tables; never edit merchant/payment rows to manufacture configuration.
5. Install `PAY_LAB_WORKER_SECRET`, and schedule authenticated POSTs to `/api/session/worker` through the approved scheduler. The included `npm run worker:session-gateway` uses PAY_LAB_WORKER_URL and the secret. Each invocation handles at most one event; choose cadence/concurrency for expected volume and monitor exhausted entries and queue latency. This worker is separate from Prime's notification worker. No scheduler is automatically installed.
6. Ensure service APIs and both callback legs are reachable through hosting protection while keeping HMAC and staff access intact. Do not place secret bypass tokens in callback URLs or broadly unprotect unrelated legacy interfaces.

Stored source policy freezes original callback/route choices. Changing configuration is not migration of existing requests. Do not remove old credentials until outstanding deliveries are resolved. Automatic exhausted-event replay/administration UI is not included; define an audited operational replay procedure before commercial operation. Signed status remains available for source reconciliation.

## Acceptance and limitations

This candidate adds no new payment form and no provider executor. Payment UI comes from Prime. Events/Anytime app buttons, deployed source provisioning, the scheduler and provider acceptance are separate remaining integration steps.

Local tests exercise authentication, explicit mode restrictions, immutable concurrent retries, lost creation recovery, per-source scope, changed currency, embed policy, duplicate/stale callbacks, lost acknowledgement, lease recovery and bounded exhaustion. They simulate Prime/provider responses and do not certify MOTO fields, 3DS, wallets or cross-origin browser operation.

Run against the isolated disposable test database only:

```sh
PAY_LAB_DATABASE_URL=postgresql://kevinsmith@127.0.0.1:55459/postgres npm run db:pay-lab
PAY_LAB_DATABASE_URL=postgresql://kevinsmith@127.0.0.1:55459/postgres npm run test:session-gateway
PAY_LAB_DATABASE_URL=postgresql://kevinsmith@127.0.0.1:55459/postgres npm run test:pay-lab
npx tsc --noEmit
npm run build -- --webpack
```

That database address is a test-only execution guard, not merchant configuration. Follow the project release process for staging. No production promotion, live payment, Events source change or Prime change is part of this local candidate.
