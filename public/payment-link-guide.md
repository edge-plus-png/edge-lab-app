# GetEdge Pay — Integrated Payment Links

Use Payment Links when your customer is not paying immediately. Your software creates a signed payment request and receives the customer checkout URL directly. Your software decides how to display, copy, email or SMS it. GetEdge does not send messages in this integration.

## Access and setup

GetEdge supplies your staging session endpoint, dedicated Source ID, separate request and result HMAC secrets, permitted currencies/routes/lifetime, registered callback and return destinations, and optional private Lab login. The current Lab endpoint is `https://pay.staging.getedgeportal.app/api/session`; the demonstration is `/developer/payment-links`. API secrets belong on your server, never in browser code. Lab login and API signing credentials are different.

Give GetEdge your merchant/account, currencies, required expiry policy, public HTTPS callback endpoint, exact customer return URL, stable operator IDs and staff authentication method. Your callback must be reachable without interactive sign-in. Do not reuse another developer's credentials.

## Create

Use the same signed session-v2 contract as Hosted ECOM/MOTO. Set `mode: "pbl"`, `presentation: "hosted"`. Required: requestKey, obligationId, reference, amountMinor (integer minor units), currency, expiresAt, operator.id and operator.authenticatedAt. Return URL is optional in the API, but when supplied must be registered. New staff requests require a real authentication attestation within five minutes; do not manufacture authentication by assigning a fresh timestamp.

Optional description, supported customer fields and merchant collection choices are passed through. Omit unknown details. No card number, CVV or NMI key belongs in this request. Customer name/email are optional Lab inputs, not mandatory merchant collection.

Example body (illustrative placeholders; executable example generates fresh identities/expiry):

```json
{
  "requestKey": "your-saved-request-identity",
  "obligationId": "your-saved-order-payment-identity",
  "reference": "BOOKING-1234",
  "amountMinor": 4999,
  "currency": "GBP",
  "mode": "pbl",
  "presentation": "hosted",
  "operator": {"id": "your-authenticated-staff-id", "authenticatedAt": "actual-authentication-ISO-time"},
  "expiresAt": "future-ISO-time-within-your-policy",
  "returnUrl": "https://your-test-system.example/payment/complete"
}
```

Download `developer-client.mjs` and `payment-link-example.mjs`. Set GETEDGE_SESSION_URL, GETEDGE_SOURCE_ID, GETEDGE_REQUEST_SECRET, GETEDGE_RESULT_SECRET, GETEDGE_RETURN_URL, GETEDGE_REFERENCE, GETEDGE_AMOUNT, GETEDGE_CURRENCY, GETEDGE_SESSION_SECONDS, GETEDGE_OPERATOR_ID and GETEDGE_OPERATOR_AUTHENTICATED_AT. Run:

```sh
node payment-link-example.mjs
# Or prepare the same signed request for cURL:
node payment-link-example.mjs prepare-curl
curl --fail-with-body --silent --show-error --request POST "$GETEDGE_SESSION_URL" \
  --header @getedge-curl-headers.txt --data-binary @getedge-curl-body.json \
  --dump-header getedge-response-headers.txt --output getedge-response.json
node payment-link-example.mjs verify-curl
```

The script saves `getedge-link-request.json` before sending. Use the same file on retry. Optional customer data can be included in the saved request before its first submission; the API validates supported fields. Never change an already submitted request.

## Immediate response and customer journey

The signed response contains `version`, `requestId`, your original requestKey/obligationId/reference/amount/currency/mode/presentation/expiry, `launch`, `payment` and `delivery`. The customer URL is **`launch.url`**, with **`launch.audience: "customer"`** and `launch.presentation: "hosted"`. This is the payment URL (payUrl) to send to the customer. There is no intermediate staff page or second create-link action.

`payment` contains sessionId, saleId, revision, state, sessionState and providerReference. Initially state is `awaiting`, providerReference is null. Creating the link never means the booking is paid. The customer opens the existing Prime hosted ECOM checkout, uses NMI secure fields and the applicable 3DS flow. No separate card form is introduced.

Save the exact request, requestId, sessionId/saleId, customer URL, latest payment revision, and processed event IDs. The session is the canonical payment/link identity; no competing Portal link ID is promised.

## Signed result and recovery

GetEdge sends `payment.updated` with version `2`, eventId, requestId, requestKey, obligationId, reference, mode `pbl`, presentation, amountMinor, currency and payment object. Use `verifyEvent(rawBody, headers, config, savedRequest)` from the supplied client. It checks HMAC/source, timestamp and original request correlation. Check bound session/sale IDs, persist receipt and order update atomically, deduplicate eventId and apply only newer revisions, then acknowledge using `acknowledgement(event)`.

The callback is authoritative; a browser return is not payment success. Mark paid only on verified `approved`. Declined, cancelled, expired, pending/unknown and awaiting are not paid. Never start another obligation to resolve an uncertain charge.

Callbacks are persisted and retried according to your configured delivery policy. GetEdge support can inspect/replay exhausted delivery; status remains recoverable if your endpoint is unavailable. Run `node payment-link-example.mjs status` to verify a signed status response. Repeating create with the same immutable body returns the same saved customer URL/session; conflicting details are rejected. After expiry the saved identity remains recoverable but is not a reusable payable link.

## Testing and support

Use only the verified NMI test-mode gateway. The hosted ECOM test procedure shown in the Lab uses published test Visa `4000000000002701`, a future expiry and CVV `999`. Never use real card details. Separate sandbox-host cards are not interchangeable with this gateway test configuration.

Inspect the actual request, response, payment and signed callback in the Lab. Reopen a saved example or refresh status. Report Source ID, reference, requestId, sessionId and eventId to support; do not send secrets or card data. Missing configuration fails closed. Old two-step staff PBL requests are explicitly rejected by the new integrated route; support must recover those through their original collection rather than create replacement obligations.

Test-to-live requires separate credentials, merchant routing, registered live destinations, provider permissions and acceptance. This build proves staging only. Portal Link Manager visibility/management, messaging, inline, terminals, Vault and recurring are not included. Real provider acceptance is recorded separately in the Build 3 handover; simulated tests alone are not verification.
