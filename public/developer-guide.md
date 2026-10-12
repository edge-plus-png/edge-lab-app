# GetEdge Pay — Hosted ECOM

Current developer path: https://staging.edge-lab.uk/developer
Session endpoint: POST https://pay.staging.getedgeportal.app/api/session
Status endpoint: POST https://pay.staging.getedgeportal.app/api/session/status

Your software sends payment details, receives a hosted checkout URL and sends the customer there. GetEdge sends a signed result to your server. GetEdge handles its provider integration; your software does not call NMI.

## What GetEdge supplies

Assigned test endpoint and Source ID; separate request and result signing secrets supplied privately; allowed currency, maximum session lifetime and registered destinations; the signing client, executable Node/cURL example and NMI test instructions. Lab login is separate from payment credentials. Provisioning currently requires GetEdge: there is no self-service credential creation.

## What you supply

Merchant/account context, desired currency/lifetime, machine-reachable HTTPS test callback URL and exact HTTPS browser return URL. GetEdge allowlists the return URL. Callback servers cannot require an interactive browser login. Test and live settings/credentials are separate. A canonical live endpoint is not currently claimed as proven.

## Create a payment

Required business values: reference (booking/order/invoice identifier), amountMinor (positive integer; 49.99 GBP is 4999), currency (enabled uppercase three-letter code).

Client-generated required values: requestKey, obligationId (persist both before sending), expiresAt (future ISO time within configured lifetime), mode=ecom, presentation=hosted. Include the registered returnUrl for the customer return. The sample generates current IDs/expiry and saves getedge-request.json. Reuse the saved request after a timeout; use a new file only for a genuinely new payment obligation.

Optional: description, supported customer data, customerCollection policy. Customer fields include customerName, firstName, lastName, businessName, phone, email, billingAddress and shippingAddress. Address fields are address1, address2, city, state, postcode and country. Supply only known information. Never send raw card numbers, security codes or NMI credentials.

The numbered lab shows a real request and response after creation. Download developer-client.mjs and hosted-ecom-example.mjs beside each other on your server. Set the environment variables shown in the lab, then run:

```sh
node hosted-ecom-example.mjs
```

For cURL, using the exact same signer:

```sh
node hosted-ecom-example.mjs prepare-curl
curl --fail-with-body --silent --show-error --request POST "$GETEDGE_SESSION_URL" \
  --header @getedge-curl-headers.txt --data-binary @getedge-curl-body.json \
  --dump-header getedge-response-headers.txt --output getedge-response.json
node hosted-ecom-example.mjs verify-curl
```

Send within five minutes of preparation; regenerate the signature if delayed. No expired static timestamp is shipped. Header/body files contain temporary signed request material; keep them private. Node 20+ and cURL are required for this combined example.

## Authentication

HMAC-SHA256, lowercase hexadecimal, signing UTF-8 bytes:

```
2\n<TIMESTAMP>\n<OPERATION>\n<SOURCE_ID>\n<EXACT_RAW_JSON_BODY>
```

Here \n denotes a newline. Headers: x-getedge-version:2, x-getedge-source, x-getedge-timestamp (Unix seconds), x-getedge-signature. Operations: session.create, session.status, session.create.response, session.status.response and result. Requests use the request secret; responses/events use the result secret. Verify the raw body before acting. A five-minute clock window applies. The downloadable client implements signing, bounded reads and verification.

## Immediate response

The actual response contains version, requestId, requestKey, obligationId, reference, mode, presentation, amountMinor, currency, expiresAt, launch, payment and delivery. `launch.url` is the hosted checkout URL. `payment` may be null or contain sessionId, saleId, revision, state, sessionState and providerReference. Preserve your request identities and returned requestId, sessionId and saleId when available. A creation response is not proof of approval.

## Checkout and test payment

Open launch.url. NMI's secure component owns card entry and authentication. GetEdge receives a token, not PAN/CVV. For the configured gateway account in test mode, the published 3DS success test card is 4000000000002701, with a future expiry and security code 999. See https://docs.nmi.com/docs/testing . Do not use real cards; separate sandbox-host test cards differ.

## GetEdge callback

Your system receives a signed `payment.updated` event with version, eventId, requestId, requestKey, obligationId, reference, mode, amountMinor, currency and payment {sessionId,saleId,revision,state,sessionState,providerReference}. The lab displays the actual accepted callback once one arrives. This is a GetEdge result, not a direct NMI webhook.

```js
import {verifyEvent, acknowledgement} from './developer-client.mjs';
const event = verifyEvent(rawBody, request.headers, config, savedRequest);
// Persist in your own database transaction: match bound request/session/sale IDs,
// reject eventId/content conflicts, deduplicate eventId, enforce revisions and
// approval non-regression, and update the matching order. Commit before reply.
return Response.json(acknowledgement(event));
```

The verification call is executable; the database transaction is deliberately owned by your application and must be implemented before production use. Acknowledge {eventId,accepted:true} after durable commit. Duplicates must not repeat fulfilment. Only approved payment state authorises paid fulfilment; declined/cancelled/expired do not. Unknown/processing outcomes require recovery, not an automatic new charge.

## Retry and recovery

GetEdge stores payment results and callback delivery records, retries unacknowledged events under the configured policy, and retains exhausted deliveries for support. Use the same saved request identity after an uncertain request. To query status:

```sh
node hosted-ecom-example.mjs status
```

Conflicting data under the same identity returns 409. Browser return is navigation only and cannot confirm payment. Supply requestKey/reference, GetEdge requestId, sessionId/saleId and eventId to support, never credentials or card data.

## Lab access and scope

The interactive example needs a dedicated Hosted ECOM source with its own callback receiver and login. It calls the public signed API over HTTP and retains its real immediate response and verified callback separately. It cannot reuse a differently configured consumer connection. No Events repository or Events UI is needed. MOTO, Links, inline, terminals, Vault and recurring are outside Build 1.


## Automatic browser return and authoritative payment result

Hosted flow: send payment details → open `launch.url` → complete payment → automatically return to your registered `returnUrl` after a confirmed approval or decline. Hosted MOTO returns the staff member; ECOM and Payment Link return the customer. The saved, permitted return URL is used unchanged. A manual return link remains available. Without a return URL, the result stays on the hosted page. Embedded consumers retain control of their own navigation.

The browser return does not report or prove approval. GetEdge sends the signed callback independently; it can arrive before or after the browser returns. Your return page must find its saved request/order, read the verified stored result and show approval or decline accordingly. While the result is absent or pending, show **Confirming payment**, then use the signed Session Status operation with the original requestKey to recover the result. Never create a replacement payment to resolve a delayed response. Verify recovered responses just as the supplied client demonstrates.

Awaiting, processing, pending and unknown states do not trigger automatic return. Cancellation or expiry is not approval. Callback retries and duplicate/revision handling remain unchanged; acknowledge only after persisting the verified event. A manual return click must not mark the order paid.

Payment Links may be completed later or in another browser. Persist the request-to-order mapping on your server; do not depend on the original browser session for reconciliation. Your application can apply verified results automatically, or staff can check confirmed payment and record it manually. Sending the link does not mean it has been paid.
