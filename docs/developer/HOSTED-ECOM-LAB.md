# Build 1 — Hosted ECOM lab operations

Scope: Hosted ECOM only. No payment-engine or Events changes. The developer page and its receiver act as a consumer of the existing signed session-v2 HTTP contract.

## Current Portal-created consumer setup — 5 October 2026

The Developer Lab consumer uses the external Source ID and two signing secrets issued by Portal. Install these server-only variables on Preview branch `codex/phase2-canonical`:

- `PAY_LAB_ECOM_TRY_SOURCE_ID`
- `PAY_LAB_DEVELOPER_REQUEST_SECRET`
- `PAY_LAB_DEVELOPER_RESULT_SECRET`

`PAY_LAB_PUBLIC_SESSION_URL` points to `https://pay.staging.getedgeportal.app/api/session`. Lab-owned `PAY_LAB_DEVELOPER_APP_CONFIG` holds the UI origin, explicitly enabled demo products/currencies, editable sample catalog, lifetime and existing independent Lab login reference. API signing keys never serve as login credentials.

The consumer requires no `PAY_LAB_SOURCES`, `PAY_LAB_CONNECTIONS`, Prime integration secret, route identifiers or registry access. Existing provider-side registry behaviour is unchanged. The sample catalog is consumer request data; the public API still enforces the connection's authoritative permissions, destinations, currencies and expiry policy. Portal activation is performed by Kevin. Saving credentials or opening the Lab does not send a payment request.

The Lab consumer exposes Hosted ECOM (`ecom`), Hosted MOTO (`vt`) and Payment Links (`pbl`) independently. All use the configured, registered consumer return URL, `https://staging.edge-lab.uk/developer`. Staff journeys authenticate the existing signed-in Lab session on the server before creation; API capabilities remain enforced by the user-owned Portal connection. Payment Links return the customer checkout URL directly.

Only authenticated Create and explicit recovery actions use public HTTPS session endpoints. Callback verification uses the installed result secret and persisted request identity. The same existing consumer tables retain requests, responses and callback receipts; no schema migration is required.

## Historical Build 1 provisioning (superseded for the current consumer)

Use Prime staging's existing connection-management screen to create a dedicated integration with the configured ECOM test route only. Do not reuse or alter the Events integration. Register Prime's result destination as `https://staging.edge-lab.uk/api/session/callback`, and its browser return as `https://staging.edge-lab.uk/developer`. Accept and activate the integration using existing controls. Confirm NMI account test mode before provider acceptance.

Add a dedicated entry to existing `PAY_LAB_CONNECTIONS` and `PAY_LAB_SOURCES` configuration, using the issued integration/route/source identities. The source must enable only `ecom` and `hosted`; callbackUrl must be `https://staging.edge-lab.uk/api/developer/callback`; returnUrls includes exactly `https://staging.edge-lab.uk/developer`. Configure sample reference/amount/currency/lifetime as editable sample catalog values. Do not copy consumer/merchant identity from Events.

Set `PAY_LAB_ECOM_TRY_SOURCE_ID` to that source's ID. Install a separate Lab login credential, request-signing secret, result-signing secret and Prime integration secret via private staging environment variables. No credentials belong in this document or browser bundle. Preserve existing connection/source entries unchanged. The Lab's Basic login maps to its dedicated source and is separate from the private API credentials given to an external developer.

Apply `scripts/developer-ecom.sql` to the isolated Lab staging database. It adds consumer-example request/response and callback receipt tables only; it does not alter canonical payment tables. The receiver uses the same database service but distinct tables and cannot confirm itself through direct service calls: the outgoing request uses HTTPS `/api/session`; the callback arrives through the signed public result path.

Deploy only the canonical staging Lab release. Existing production domain aliases and Prime payment code stay unchanged. The new routes are `/api/developer/ecom` (authenticated GET/POST, same-origin mutation) and `/api/developer/callback` (signed callback receiver). Limits allow ten new examples per configured source per hour; reopening/retrying preserves request identity. The canonical engine's own constraints remain in force.

## User journey

Open `/developer`, sign in with assigned Lab access, read numbered instructions, edit catalog defaults, create the payment, inspect the saved request and actual immediate response, then open the returned checkout. Complete the provider test card in the existing NMI component. Return to the lab, reopen the saved example if needed, and refresh status. Inspect the separately verified callback and received timestamp. A status response is labelled separately from callback receipt.

The copyable example saves a request file before sending. Reuse it after transport failure; for a new business payment choose a new request filename. cURL uses headers/body prepared by the same downloadable signing client and verifies the returned response. Receiver verification code deliberately leaves the consuming application's database transaction to that application.

## Acceptance status — 4 October 2026

**VERIFIED: Build 1 Hosted ECOM only**, using a new Developer Lab-originated payment through the documented signed session-v2 HTTP interface. This is not Events evidence.

- Lab: https://staging.edge-lab.uk/developer
- Dedicated Prime connection: GetEdge Pay · Hosted ECOM developer lab (`cmuu4ofog0001jn04mrya039t`). Source: `developer-lab-ecom`.
- Reference: `LAB-ECOM-BUILD1-20261004`; 4999 GBP minor units.
- GetEdge request: `1c5f2576-1127-4ac7-83a1-770c3ef428a6`.
- Prime payment/session: `cmuu4zr800002js04bu8gk0dx`; sale: `cmuu4zr800003js04famozaeu`.
- NMI test-mode transaction: `12639131449`, approved.
- Final Lab callback: `5a65a0a2-5715-4340-829d-04b5b8fde49e`, revision 3, verified and persisted by the example receiver. Final delivery acknowledged on its first attempt.

The browser created this payment, opened the returned hosted checkout, completed NMI's secure test card component and returned to the Lab. Reload retained Approved and the actual callback. Both Prime and Lab persisted successful callback delivery. The downloaded published Node client recovered the signed approved status; the published cURL preparation/verification example repeated the same create request and recovered the same approved identifiers without a second charge.

28 automated tests passed, including signed HTTP consumer requests, returned-response persistence, immutable retries, callback signature/correlation/deduplication, source isolation and example signing. TypeScript and deployed production builds passed. Lint had no errors and one existing intentional login-navigation warning. Automated fixtures are separate from the real provider acceptance above.

No Events changes or credentials were used. Prime payment code was unchanged. Only the dedicated staging integration/configuration was added; the existing short-lived read-only acceptance preflight window was refreshed to confirm actual NMI account test mode. The gateway uses its configured NMI host in test mode; do not infer test mode from a domain name.

This approval transaction does not establish real provider decline/cancellation, callback outage/exhaustion, live processing, wallets or an independent developer's onboarding. MOTO, PBL, inline, Card Present, Vault and recurring remain outside Build 1.

## Reproduce the demonstration

GetEdge supplies private Lab login credentials separately. Open the Lab URL and sign in using its normal sign-in form. Reopen `LAB-ECOM-BUILD1-20261004` to inspect the accepted example, or select **New example**, edit the reference/amount, create a payment and open its hosted checkout. Use the published test card instructions shown in step 6, never a real card. Return to step 7 for payment state and step 8 for the signed callback accepted by the receiver. Refresh status if needed. The configured request lifetime is 900 seconds; a new payment needs a new example after expiry. An approved example must not be repaid.

For your own server, GetEdge must issue a separate source and signing credentials and register your callback and exact return URL. Lab sign-in credentials are not API signing credentials. Follow the downloadable Node/cURL client and developer guide; do not copy the Lab's consumer identity into an external integration.

## Guided test experience

All three journeys put Try it now before technical documentation. ECOM and MOTO navigate to the returned hosted URL in the same tab after successful creation. Payment Links display the returned customer URL for copying and an explicit Try as customer action. The Lab stores only local example/mode identifiers in session storage to reopen the correct saved example after the registered return. Browser navigation never sets the payment state; verified responses/callbacks remain authoritative. The session API and connection permissions are unchanged. The hosted staff page offers the validated return destination frozen with the original request.
