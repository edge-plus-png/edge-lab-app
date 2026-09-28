# Anytime GetEdge Pay collection lab

Prepared 28 September 2026. Candidate extension to `edge-lab-app`; not deployed or provider-payment accepted.

## User journeys

Existing `/` and its direct NMI customer checkout remain available. A link opens `/collect`, an authenticated GetEdge Pay reference application:

- Customer checkout prepares a saved booking and opens the configured ECOM hosted checkout directly.
- Staff collection prepares a booking, then offers the configured payment-link and telephone routes. No source-name routing is used.
- Payment links are requested from Pay and can be copied or opened. Sending email/SMS is not implemented; use the partner's delivery system.
- Telephone payment uses the signed operator setup API and provider-hosted card fields, then the signed operator pay API. It does not redirect into Bolt or assume that Bolt already exposes a portable hosted launch URL.
- Signed status is checked against the saved booking. Signed callbacks to the lab are persisted and deduplicated transactionally. The lab never converts browser navigation or callback acknowledgement into payment approval.

Staff collection is a product workflow label. Creating a customer payment link does not change that customer checkout into a card-scheme merchant-initiated/card-on-file transaction.

## Source and isolation

Base commit: `421bcbe`, isolated branch `codex/anytime-staff-collection`. The original checkout has unrelated layout/favicon work; it was not copied, reverted or edited.

The domain inspection found `anytime.edge-lab.uk`, `artisio.edge-lab.uk`, `demo.edge-lab.uk`, `nuco.edge-lab.uk` and other aliases on the SAME Vercel production deployment, `dpl_yq64mZHuPwVcj4ak9i6UvguyZGDe`. Do not promote this candidate to that deployment until the intended connection and acceptance are established. Preview first. Prime and Bolt source were read only.

## Configuration

1. Provision an isolated PostgreSQL database for the lab. Set `PAY_LAB_DATABASE_URL`; run `node --import tsx scripts/pay-lab-migrate.ts` as a controlled deployment step. Runtime does not automatically run DDL.
2. Copy and edit `config/pay-lab.example.json`. Store its JSON as `PAY_LAB_CONNECTIONS`. Host bindings are exact, including local ports and preview hosts. Multiple separately configured connections are supported; unknown or ambiguous hosts fail closed.
3. Supply generated integration scope, verified source identity, and explicit route refs from the merchant's GetEdge Pay staging connection. Private signing credentials live only in the named server environment variable. Do not copy provider private keys into this app.
4. Set the named staff password environment variable (at least 24 characters) and operator name. This is an intentionally simple, protected staging lab, not merchant SSO. Basic authentication protects `/collect` and its APIs; external partner authentication/SSO is separate production work.
5. Register the callback in the merchant connection BEFORE creating sessions. The lab reads the signed configuration and refuses to create sessions if it differs from its expected callback. It does not silently alter the merchant connection or retrofit historical sessions.
6. For lab-owned receipt evidence, use `https://<lab-host>/api/pay-lab/callback`. Alternatively use the partner's implemented GetEdge Pay receiver; in that mode the lab verifies status but does NOT claim receipt acknowledgement by the partner. No forwarding proxy or automatic Opayo callback translation is provided.
7. Register allowed browser return URLs separately. They are selected from server configuration, not arbitrary browser destinations. A booking can remain on the Pay result page. Save/bookmark the collection URL containing the lab booking ID to resume its record.
8. Set the provider script URL appropriate to the verified MOTO adapter. Current reference flow uses Classic Collect.js. A staging URL alone does not prove test mode. Leave `providerTestModeConfirmed=false` until the actual route/account test mode has been checked. This operator attestation is not provider acceptance evidence.
9. Samples are editable configuration, not payment policy. Amount, currency, reference and explicit expiry are validated and persisted per request. Customer data is optional; never invent names, postcode or country. Provider ECOM authentication may request genuinely missing technical fields.

Dependencies: reachable signed Pay v1 configuration/routes/session/status/link/operator APIs, active scoped route grants, provider-hosted tokenization and configured test-mode MOTO processing. The global existing lab may have independent direct-NMI keys; this addition does not use them.

## Opayo handover mapping

Update for the service-owned collection candidate: the user reconfirmed
`TxType=PAYMENT`, `AccountType=M`, reference `MOTO-2026-09-08-9999`, amount `49.99 GBP`
and supplied billing/delivery fields. Map these to the one-off MOTO action,
`source.reference`, `amountMinor: 4999`, `currency: "GBP"`, and genuine supplied
`customer.billingAddress` / `customer.shippingAddress` values. The sample
NotificationURL is a placeholder and must not be installed as a receiver. Use the
configured signed `/api/pay-lab/callback` endpoint. No customer values are fabricated.
The newer public collection flow returns a service-owned staffUrl/embedUrl; the
older lab-owned URL description below is historical. See
[the current partner guide](reference-partner-collection.md).

The two user-provided images describe Anytime's existing server integration; they are requirements evidence, not instructions to use Opayo endpoints or a guarantee of wire compatibility.

| Existing concept | GetEdge Pay equivalent |
| --- | --- |
| Vendor/account | Registered merchant, pairing and integration scope from the server connection |
| VendorTxCode | Saved source reference; a separate durable obligation UUID prevents ambiguous creation retries |
| Decimal Amount/Currency | Exact conversion to integer minor units and configured currency |
| AccountType E | ECOM route + hosted customer presentation |
| AccountType M | MOTO route + operator card presentation |
| NotificationURL | Registered signed GetEdge Pay callback, distinct from browser return |
| NextURL | Pay checkout URL for ECOM; lab staff collection URL for the reference MOTO journey |
| RedirectURL returned by notification handler | No automatic equivalent: GetEdge Pay browser return is supplied at creation; callback returns a JSON event acknowledgement |
| Status=OK | Receipt acknowledgement only; payment approval comes from verified payment state |

Anytime's Opayo receiver cannot be reused unchanged: it expects a different message and response contract. Implement a GetEdge Pay receiver or an explicitly tested partner adapter. This lab does not pretend to produce Opayo signatures.

The screenshots' `AUTHENTICATE`, damage authorisation, deposit/instalment/card-on-file fields, name fallback to `A`, and copied delivery address are NOT carried into this release. It covers one-off payments only. Reuse genuine supplied customer data and keep technical authentication requirements separate from optional business collection.

## Durability and limits

The booking and immutable creation request are committed before Pay is called. An ambiguous creation retries the same saved request/key. A booking cannot silently switch ECOM/MOTO after route selection: resolve/cancel/replace through the appropriate service lifecycle rather than creating competing collection routes. This first UI does not offer cancel/replace, refunds or voids.

MOTO dispatch is serialized by a PostgreSQL row lock; its key is committed before network dispatch. Concurrent calls cannot dispatch twice. A lost response leaves a durable hold. A newer verified decline can permit a fresh attempt; otherwise the lab blocks another submission. If the process stops after claiming but before dispatch, this conservative hold requires investigation. There is no automatic token replay, and payment tokens/PAN/CVV are not persisted.

Signed results must match integration scope, configured source, reference, obligation, amount, currency, route, expiry, session and sale. Revisions cannot roll the saved result backwards. Event ID/body-hash matching and row locks protect duplicate callback application. This is payment evidence, not commercial fulfilment of an actual Anytime booking.

The callback receiver currently accepts `payment.updated` only; refunds/voids are not enabled by this feature. Service-owned autonomous delivery guarantees depend on the deployed Pay release. A lab status check may trigger pending callbacks; it does not prove autonomous recovery.

## Inline path

MOTO here uses provider-hosted inline fields inside our staff page. This demonstrates the architecture, but a real provider test payment remains required. Embedding the entire page in a third-party iframe, cross-origin staff authentication, iframe CSP and messaging are NOT implemented or certified.

Customer inline Pay setup/pay APIs exist separately. Their exact component/processing/3DS pairing needs a separate proof. This release keeps the hosted path and does not claim customer inline or wallets are accepted.

## Validation

Run `node --import tsx --test tests/pay-lab/recovery.test.ts` with an isolated `PAY_LAB_DATABASE_URL` after migration. Tests use actual PostgreSQL transactions and explicitly simulated, signed Pay transport; no provider payment is represented as real.

For local browser QA only, run `PAY_LAB_DATABASE_URL=... node --import tsx tests/pay-lab/browser-fixture.ts` after build. It injects a fixture staff identity and simulated signed service replies, clearly labelled LOCAL QA. It never performs provider payments. Do not deploy or expose this harness.

Required live acceptance remains: actual MOTO success/decline/lost-response recovery, hosted ECOM checkout and return, configured partner receiver updating the correct booking, callback outage/recovery, source-policy variation and scoped staff access. No live merchant rollout is claimed.

### Results recorded in this task

- Migration applied to a disposable localhost PostgreSQL database, port 55439.
- 10 tests passed: configuration/authentication, exact retries, validation, alternate source/currency/expiry, callback replay/conflict/ordering, concurrent MOTO submission, lost-response hold, signature checks, and HTTP authentication/cross-origin denial. Transport is simulated and signed; database operations are real.
- Release build passed on Next 16.3.6; TypeScript and lint for added/changed service/UI/proxy code passed. Existing Next 16.1.6 had a critical npm advisory; this candidate upgrades Next and compatible dependencies. `npm audit fix` reported zero vulnerabilities.
- CUA in-app browser, `http://127.0.0.1:4198/collect`: page identity, content, no framework overlay, staff save → choices → link, unpaid state, reload recovery, customer tab, and unavailable operator setup error passed. Console query returned no warning/error entries. Screenshots inspected at desktop 1280×720 and mobile 390×844; document width was 390 at the mobile viewport.
- Browser fixture uses actual lab routes and PostgreSQL, with simulated signed Pay transport and a fixture staff identity. No NMI fields or actual payment were claimed tested. Authentication denial was tested separately at the HTTP boundary.
- Browser testing found and fixed a reverse-proxy origin mismatch. Mutations compare Origin against the explicitly registered request Host, requiring HTTPS outside loopback. Cross-origin denial still passes.
- No current Anytime staging merchant connection, gateway mode, installed callback receiver or runtime database has been supplied for this new feature. No deployment or live/provider payment was performed. Existing shared lab deployment is unchanged.
