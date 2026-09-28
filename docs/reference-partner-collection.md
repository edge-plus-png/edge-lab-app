# Public partner collection reference

This candidate extends the existing `/collect` lab. The service implementation is the matching `codex/pay-partner-reference` branch in Prime. Do not deploy this consumer before that service release. The original direct-NMI lab root is legacy and is not the reference partner checkout; use `/collect` and its customer/staff journeys.

## Configuration and migration

Staging preparation on 28 September found the existing `edge-lab-app` project has
no `PAY_LAB_DATABASE_URL`, `PAY_LAB_CONNECTIONS` or new partner signing/staff secrets.
Its legacy direct-NMI credentials are not a substitute. The candidate review branch
does not auto-deploy; provision a separate staging host and database, apply the
normal lab schema migration, and install configuration before deploying the matching
service/partner release. Existing shared production aliases must remain unchanged.

The supplied Opayo example maps `PAYMENT` / `M` to one-off MOTO,
`MOTO-2026-09-08-9999` to the saved source reference and `49.99 GBP` to 4999 minor
units in GBP. Preserve the actual supplied billing/delivery fields in the public
customer shape; never copy a missing address or invent a name. The sample
NotificationURL is a placeholder, not an enrolled callback endpoint.

Use the existing `PAY_LAB_CONNECTIONS` catalog and secret-store references from `docs/anytime-collection-lab.md`. Add optional `staffCollection` to each independently configured connection:

```js
{
  ...existingConnection,
  staffCollection: {
    embeddingOrigin: actualBackOfficeHttpsOrigin, // omit for hosted-only staff
    routes: {
      [configuredCurrency]: {
        telephone_payment: signedRoutesMotoRef, // omit when not granted/intended
        payment_link: signedRoutesEcomRef,
      },
    },
  },
}
```

These are real configuration values, not placeholders to submit. Both the merchant's service policy and the partner's request must permit an action. Explicit route mappings must be returned by the signed routes API and appear in the connection's `routeRefs` list. No first-route or source-name fallback is used.

Keep signing and staff-login secrets server-side. `origin` is the Pay service origin. `hosts` binds the partner's own host. `embeddingOrigin` is the partner back-office origin; the Pay merchant policy must explicitly allow it. Configure the callback before creating records, and use exact real return destinations in `returnUrls`.

Run `npm run db:pay-lab` against the lab's isolated PostgreSQL database. The additive migration adds `collection` JSON to the existing booking table. This is a normal application schema migration, not a special edit to Pay's merchant/session data. The lab never accesses Pay's database.

Confirm dedicated provider test mode through normal merchant/provider onboarding, then set the lab's `providerTestModeConfirmed` attestation. The flag itself is not evidence of provider mode. A dedicated staging connection and actual provider acceptance were not supplied during this implementation.

## Journeys

- **Customer:** select the customer journey, save a booking and its route; the partner calls signed `sessions` and `links`, verifies the saved snapshot, then opens Pay's hosted customer URL.
- **Staff:** save a booking, choose **Prepare hosted staff collection**. The partner persists an immutable `collections` request before sending it. The response supplies Pay's staff URL, not a partner-generated collection URL. The hosted service shows telephone/payment-link choices permitted by the merchant and request.
- **Inline staff:** when configured, the partner embeds the signed response's `embedUrl`. The same Pay-owned page renders card entry or link creation. The service enforces frame ancestors and payment authority. No Pay signing key or private provider key is sent to the browser.
- **Native operator alternative:** the pre-existing signed setup/token/pay adapter remains in the lab for connections without the hosted-collection feature. It is a separate integration mode, not a fallback that bypasses a rejected collection capability.

The partner persists source references and exact integer money. `customerCollection` can be supplied on the booking API as a complete optional field-policy map. Omission leaves business fields hidden. Saved customer data is reused; no dummy name, postcode or country is generated.

## Results and recovery

The lab exposes no endpoint that accepts an unsigned paid state. Browser navigation and link creation do not update payment status. `launchCollection` verifies signed scope and launch/snapshot identity before saving. Callback receipt verifies HMAC, event identity, saved source/merchant/session/sale, amount/currency/expiry and the permitted immutable route.

The first verified collection payment result binds the previously unselected route; later results must match it. Callback IDs and body hashes are persisted under a database row lock. Duplicate receipt returns success without a second application. Revisions cannot roll payment state backwards. Time-derived session expiry can change without a payment revision; that does not conflict with or reverse an approved payment.

The lab records payment evidence for its local booking; it does not write into a real external booking system or claim actual reservation fulfilment. Production consumers must apply their inventory/booking rules and durable fulfilment outbox in the same transaction.

An interrupted creation retries the saved request/key. A collection refresh uses `collections/status`; an existing request can recover despite changed callback configuration or the lab's current test attestation. A new booking still requires configuration/test-mode checks. Provider tokens and raw card data are never persisted by the lab.

## Verification

The matching service's `staff-collections.postgres.test.ts` can import this adapter via `PAY_PARTNER_LAB_PATH`. Its local two-application scenario uses actual HTTP, real separate PostgreSQL stores, normal service provisioning functions and signed requests/results. Provider responses and the local HTTPS-to-loopback transport mapping are explicitly simulated. It tests a committed partner callback followed by a lost acknowledgement and duplicate retry; exactly one receipt remains saved.

The existing ten partner recovery tests also pass. Typecheck, targeted lint and `npm run build -- --webpack` pass. Two legacy pages needed Promise-typed Next.js route parameters for this build. The default Turbopack build encountered a local process/port restriction; webpack is a supported alternative, not a provider test.

Not proven: deployed partner onboarding, actual provider test-mode payments, hosted card fields inside a cross-origin iframe, MOTO tokenization, ECOM 3DS challenge/frictionless authentication, wallets, or autonomous scheduled staging delivery. Keep these explicit release gates.
