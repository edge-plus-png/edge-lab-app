# GetEdge developer onboarding and support playbook

Deployment readiness: see [4 October continuation](BUILD-STATUS-2026-10-04.md). External sandbox onboarding is not yet accepted; the staging access gates remain open.
3 October 2026 — Phase 2 candidate. Use with DEVELOPER-GUIDE.md and the acceptance record. Do not describe local simulated-processor evidence as NMI sandbox acceptance.

## The call in nine answers

| Developer asks | GetEdge answer |
|---|---|
| What do I give you? | Your callback URL, exact browser return URL, embedding origin if needed, intended merchant, currencies/products, expiry needs and order/reference model. |
| What do you give me? | Assigned session endpoint and source ID, two distinct server-side signing secrets, approved checkout origins, enabled capabilities and the developer guide/example. No NMI keys. |
| What endpoint do I call? | Server-side POST to the assigned canonical `/api/session`; recover with POST `/api/session/status`. Confirm the deployment before quoting a working URL. |
| What happens after that? | Lab authenticates and saves the request. Prime owns the payment and returns its checkout. NMI processes the payment. Prime notifies Lab; Lab sends you a separately signed event. |
| What do I store? | Original request and requestKey/obligationId, your order mapping, Lab requestId, Prime sessionId/saleId, revision/state, event receipts, provider reference. |
| How do I know it succeeded? | A verified `approved` result matching your saved order, applied once in a database transaction. Not the browser return or callback HTTP status. |
| What if either system is unavailable? | Persisted request identities allow safe retry/status recovery; both callback hops retain results. Exhausted deliveries are inspected/replayed, never replaced with another charge. |
| How do we diagnose failure? | Follow one obligation through both databases/callback hops using IDs and revisions. Separate payment outcome from delivery outcome. |
| How do we go live? | Separate reviewed rollout with live credentials, destinations and Prime routes after acceptance. Phase 2 itself is staging-only. |

## Provision in this order

1. **Confirm release/environment.** Record Events, Lab and Prime SHAs and aliases. Use the canonical Lab deployment profile `vercel.phase2.json`; do not deploy this acceptance profile as Production. Its root response identifies `session-v2`, processing `Prime`. Ordinary legacy production remains a separately selected compatibility deployment.
2. **Prime merchant connection.** Sign in to Prime staging and use the existing merchant gateway configuration. Confirm account test mode and the exact ECOM processor route; a “Production” endpoint label is not account-mode evidence. Record verification evidence. Do not place NMI keys in Lab or Events.
3. **Prime integration.** Use normal merchant Connections onboarding. Assign a dedicated integration/source to the developer with its exact return destination and the **Lab** callback `<canonical Lab>/api/session/callback`. Grant only required routes/currencies. Activate only after credentials and destinations agree. Export/install the integration signing credential through the authorised secret process, never chat.
4. **Lab connection/source.** Install `PAY_LAB_CONNECTIONS` and `PAY_LAB_SOURCES`, distinct source request/result secrets, worker/support secrets, `PAY_LAB_DATABASE_URL` and exact host list. Freeze destinations per request. Secrets belong to the named staging/preview deployment only. Existing old NMI variables inherited by the legacy project are not canonical credentials; exclude them from the canonical deployment configuration.
5. **Events.** Install `EVENTS_LAB_SESSION_CONNECTIONS`, the two source secrets and `EVENTS_LAB_SESSION_ENABLED=true` only in staging. Use the reference adapter, not a direct-NMI route. Its current return route is `/payment/lab-return`; callback is `/api/getedge-pay/lab-callback`.
6. **Workers/reachability.** Configure Prime notification recovery policy and scheduler, Lab worker scheduler and monitored failure alerts. Prove public machine POSTs reach application signature validation without interactive Vercel SSO. Do not use a developer's browser login as callback reachability evidence.
7. **Acceptance.** Real Events test booking → signed Lab → Prime → actual sandbox NMI → both signed deliveries → correct booking. Record IDs, provider evidence and delivery acknowledgements. Repeat decline/recovery/duplicate cases, then inline with real authentication.

## Configuration checklist

Canonical Lab:

- `PAY_LAB_DEPLOYMENT_MODE=canonical`
- `PAY_LAB_ENVIRONMENT=staging`; `VERCEL_ENV` must not be `production`
- `PAY_LAB_CANONICAL_HOSTS`: JSON array of exact lowercase hostnames (including port in local tests)
- `PAY_LAB_DATABASE_URL`: isolated Lab DB, existing migration applied
- `PAY_LAB_CONNECTIONS`: connection ID/name/hosts, Prime HTTPS origin, merchantId/pairingId/integrationId/sourceId/sourceType, staging environment, signing secret env name, allowed routeRefs, callbackUrl/returnUrls, provider test-mode attestation
- Current shared reference schema also requires `staffUser`, `staffPasswordEnv`, `collectScriptUrl` and editable `sample` metadata. These are configured reference-app fields; canonical ECOM does not expose the old staff/card page and does not use sample amounts for developer requests.
- `PAY_LAB_SOURCES`: source ID, dedicated connectionId, hosts/enabled, requestSecretEnv/resultSecretEnv, developer callbackUrl, returnUrls/embeddingOrigins, modes/presentations, per-currency Prime route references, maxSessionSeconds and delivery policy
- Delivery policy: maxAttempts 1–100, retrySeconds 1–86400, timeoutSeconds 1–30, leaseSeconds 2–600 and greater than timeout
- `PAY_LAB_WORKER_SECRET`, `PAY_LAB_SUPPORT_SECRET`: separate server-side credentials of at least 32 characters

Run `node --import tsx scripts/canonical-preflight.ts` with installed deployment configuration. It prints only configuration status, not secrets. Passing it is not provider acceptance.

Events connection fields: id, portalMerchantId, sourceId, endpoint, requestSecretEnv, resultSecretEnv, presentation, inlineAccepted, returnUrl, embeddingOrigin when inline, launchOrigins, maxSessionSeconds. Both staging environment and enabled flag are required. `inlineAccepted` is an operator attestation: record real browser evidence before enabling it.

## Delivery operations

Lab worker: `POST /api/session/worker` with `Authorization: Bearer <worker secret>`. Existing script `scripts/session-gateway-worker.mjs` reads `PAY_LAB_WORKER_URL` and worker secret. One bounded delivery per invocation; choose scheduler frequency/capacity to meet the assigned policy. A manually invoked worker is not a production scheduler.

Internal inspection: `POST /api/session/delivery` with the separate support bearer secret and:

```json
{"action":"inspect","requestId":"<Lab request UUID>"}
```

After correcting the receiver, replay an exhausted delivery:

```json
{"action":"replay","eventId":"<event UUID>","reason":"Receiver restored; incident reference"}
```

This restarts one bounded delivery cycle while retaining exact event ID/body/destination. It records the prior attempt count and reason in the audit table. Delivered or actively claimed events cannot be replayed through this operation. Inspection exposes IDs/delivery state, not payload/customer data. Never give this credential to partner developers or browsers.

Prime has its own delivery records/recovery policy. A successful Prime → Lab acknowledgement means Lab durably received the result; it does not mean Events received Lab's separate event. Inspect both hops.

## Troubleshooting sequence

1. Ask for environment, source ID, booking/reference, requestKey/obligationId, Lab requestId, Prime sessionId/saleId, event ID/revision, provider reference and timestamp. Never ask for card data or secrets in chat.
2. No Lab request: verify endpoint/host, raw-body signature, operation, clock and source configuration. HTML redirect usually means deployment protection or the wrong URL.
3. Lab request exists but no Prime session: inspect integration activation, exact route/currency grant, destinations and server credential installation. Retry the saved request, not a new identity.
4. Prime `unknown`/processing: establish actual provider outcome before another payment. Closing a browser does not release an uncertain charge.
5. Prime approved but Lab stale: inspect Prime notification delivery/acknowledgement and Lab receiver correlation.
6. Lab approved but Events unpaid: inspect Lab outbox and Events callback rejection. Match money/source/order/payment IDs. Recover status; replay only when receiver correctness is restored.
7. Events approval after expiry: retain payment evidence and resolve the booking manually according to merchant policy; do not silently issue expired tickets.
8. Inline failure: confirm allowed origin/frame policy and `getedge-pay-embed` message contract; no legacy card-form fallback.

## Readiness and rollout boundary

Do not call Phase 2 complete until actual sandbox processing, both deployed callback hops, unattended worker recovery and browser reopen/inline acceptance have evidence. Local cross-service tests exercise real orchestration and signatures with simulated provider/transport and fixture authentication data. They prove those mechanics, not NMI or 3DS.

Live rollout is separately authorised. Do not weaken production MFA, repoint live aliases, change live merchant routes, enable wallets without acceptance, or include Terminal/Card Present changes in this phase.
