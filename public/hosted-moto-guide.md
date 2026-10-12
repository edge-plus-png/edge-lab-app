# Hosted MOTO — GetEdge Pay Developer Lab

Hosted MOTO is a staff-operated telephone/mail-order payment. Your server calls the same signed GetEdge session interface as hosted ECOM, with `mode: "vt"`, `presentation: "hosted"` and authenticated operator context. Your developer integrates with GetEdge, not NMI. A returned staff URL delegates payment authority until expiry; never send it to a customer or expose it publicly.

## What GetEdge provides

- Test session endpoint: `https://pay.staging.getedgeportal.app/api/session`.
- Test status endpoint: `https://pay.staging.getedgeportal.app/api/session/status`.
- Private source ID, request-signing credential and separate result-verification credential. Lab website login is separate from those credentials.
- Granted Hosted MOTO currency/routes, maximum lifetime, registered result/return destinations and test-mode instructions.
- Downloadable `developer-client.mjs` and `hosted-moto-example.mjs`, the same interface used by this Lab.

The dedicated demonstration source is `developer-lab-ecom` (its existing identifier is retained to preserve Build 1). Its test operator is the privately provisioned Lab account, shown in the form. External integrations receive their own source, keys and configuration.

## What we need from your software

Your merchant/account, required currencies, maximum request lifetime, stable operator identifiers and staff authentication method. Your server must authorise the staff member to take MOTO payments.

Supply a publicly reachable HTTPS callback endpoint without interactive browser authentication, and the exact HTTPS browser return URL. The callback is the authoritative server-to-server payment result; the browser return only navigates staff back to your software. The Lab uses `https://staging.edge-lab.uk/api/developer/callback` as its consumer callback and `https://staging.edge-lab.uk/developer/moto` as its MOTO browser return. Your system supplies its own destinations. Prime's `/api/session/callback` destination is internal to GetEdge; do not implement that endpoint yourself.

## Required creation fields

| Field | Meaning |
|---|---|
| requestKey | Stable identity for this exact request; persist before sending. |
| obligationId | Stable identity for this intended payment obligation. |
| reference | Your booking/order reference, returned unchanged. |
| amountMinor | Positive integer in currency minor units; 4999 = GBP 49.99. |
| currency | Enabled three-letter currency code. |
| mode | `vt` for MOTO. |
| presentation | `hosted`. |
| expiresAt | Fresh ISO expiry within your configured lifetime. |
| operator.id | Your authenticated staff member's stable ID. |
| operator.authenticatedAt | ISO timestamp of actual staff authentication, within five minutes for a new request. |

`returnUrl` is optional in the API but used by the Lab/example and must be registered. Optional `description`, supported customer fields and `customerCollection` follow the shared session-v2 contract. Do not manufacture customer data or include PAN/CVV. MOTO processing requirements are distinct from optional merchant business collection.

The Lab validates its existing signed-in operator session on each new MOTO request and attests that server-side authentication check. It does not ask for the password again. It does not accept a browser-supplied operator identity or authentication timestamp. Your production software must derive these from its own authenticated staff session; an arbitrary timestamp is not authentication. The sample generates request IDs/expiry, but intentionally requires you to provide the genuine operator authentication time.

## Run the real example

Download both MJS files from the authenticated Lab to your server. Requires Node 20+. Configure the environment values shown in the Lab, including `GETEDGE_OPERATOR_ID` and `GETEDGE_OPERATOR_AUTHENTICATED_AT`. These are actual staff-authentication values, not secrets. Never expose signing keys in browser code.

Run `node hosted-moto-example.mjs`. It saves `getedge-moto-request.json` before calling the API. The response includes `requestId`, original request identities/reference/amount, `launch.url` and `launch.audience: "staff"`. `payment` may initially be null until the operator starts payment; do not mark the booking paid when you receive a launch URL.

For cURL, run `node hosted-moto-example.mjs prepare-curl`, then use the exact cURL command shown in the Lab, then `node hosted-moto-example.mjs verify-curl`. It signs the identical saved body and verifies the actual response with the shared client. Use the prepared headers within five minutes. The request's operator attestation must also be recent on first creation.

Open `launch.url` only for the authorised operator. NMI-hosted secure fields collect card details; GetEdge handles the token and runs the existing MOTO path. This is not the normal customer ECOM/3DS journey. The screen may request missing provider-required customer information; enter legitimate test data for sandbox testing, never fake defaults in an integration.

## Status, signed callbacks and recovery

Persist `requestKey`, `obligationId`, `reference`, `requestId`, and returned payment `sessionId`/`saleId` when present. Keep each original request immutable. Reuse its saved file after transport failure. For a new business payment use a new request file/identity. Do not create a second obligation merely because a response was delayed.

`node hosted-moto-example.mjs status` queries the saved request. An expired authentication timestamp does not invalidate recovery of an already-created identical request. A request never accepted before its authentication/expiry window cannot be silently refreshed; reconcile status first and authenticate again for genuinely new work.

Callbacks use signed `payment.updated` events with the shared version-2 format, `mode: "vt"`, original order/request identifiers, amount/currency and `payment` state/revision/provider reference. Verify raw bytes with `verifyEvent`, bind request/payment IDs, reject conflicting IDs/content, deduplicate `eventId`, and apply only newer revisions. Persist the receipt and order update transactionally before returning `{eventId, accepted: true}`. See the executable shared client and Lab's actual accepted event.

A returned browser is not payment success. Mark paid only after a verified `approved` payment with its provider reference. Other states must remain distinguishable. Callback delivery is persisted and retried according to the provisioned policy; status recovery remains available. Use request/session/provider IDs with GetEdge support if delivery is exhausted or state is unknown. Never retry an uncertain charge as a new payment.

## Test and live

Use only the test-card instructions shown for the configured NMI test-mode account. Do not infer sandbox safety from a hostname. Build 2 is verified only when a new Lab-originated test payment is recorded in the acceptance evidence; simulated automated tests are not provider acceptance. Real decline/cancellation/outage testing is separate from an approval test.

Live requires separately provisioned credentials, merchant MOTO approval/routes, confirmed processing environment, staff authorisation, registered live destinations and live acceptance. This Lab is staging-only; changing the URL or reusing test keys does not make it live.
