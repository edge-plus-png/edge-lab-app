# Build 2 — Hosted MOTO developer lab

## Current status

**VERIFIED — 5 October 2026.** Build 2 is deployed at https://staging.edge-lab.uk/developer/moto from Lab commit `3669ad292cccf65e395a2be3ebb38ddd518d3c10`, deployment `dpl_FMecTgY7kgnq8QdEwwb7mWRU8BnR`. The dedicated Lab connection now grants Hosted MOTO alongside Hosted ECOM. Payment Links and embedding remain disabled.

The new Developer-Lab-originated request `LAB-MOTO-BUILD2-20261005` for 4999 GBP minor units completed NMI test-mode payment **12639965940**. GetEdge request `55549476-fd21-4843-9436-47cb1a7a462d`, Prime payment/session `cmuuhx425000ejx0407joewpp`, sale `cmuuhx425000fjx04s7gofwpf`. Prime persisted channel `MOTO`, presentation `operator_card`; reporting shows route `moto`, 3DS `N/A`, Approved / Test payment. NMI-hosted fields were used, without customer 3DS.

Prime → Lab and Lab → developer consumer callbacks both delivered on their first recorded attempt. Signed event `9e08f79c-c59f-4b11-ad0c-4b430e0804da` revision 3 was verified and persisted by the consumer. Reopening the Lab retained the actual request, original response, approval and callback. Published Node status and cURL repeated creation verified the same payment with no new charge.

Hosted ECOM regression: the existing approved Build 1 payment remained recoverable through signed Node/cURL on Build 2; the UI retained its actual result. A fresh request `LAB-ECOM-BUILD2-REGRESSION-20261005`, request ID `5de59a64-fed0-4fc7-8444-5654a1b6c554`, session `cmuui45a40002k0042uw2bglv`, created normally and loaded NMI-hosted ECOM card fields. That additional ECOM request was not charged; it is not new provider-approval evidence.

30 automated tests, TypeScript, targeted lint and webpack build passed before deployment; the Vercel deployment build also passed. Real provider evidence here covers the MOTO approval, callback and recovery journey, not new decline/cancellation or delivery-outage runs. No Events configuration/credentials/transactions or changes were used. Prime payment code was not changed or redeployed.

## Internal onboarding playbook

1. Explain the journey: the software's MOTO button creates a signed request; GetEdge returns a private staff launch URL; the operator enters telephone/mail-order details in NMI-hosted fields; signed results update the original order.
2. Get the merchant/account, currencies, expiry policy, stable operator IDs and real staff authentication method. Obtain a public HTTPS result endpoint and exact browser return URL. The two destinations have different purposes.
3. Give the developer the assigned `/api/session` URL, source ID, separate request/result signing credentials privately, enabled modes/currencies/lifetime, Node/cURL files and test procedure. Give Lab login separately. Developers never need NMI keys.
4. Provision only the merchant's granted MOTO route and existing hosted telephone collection capability. Do not grant Payment Links or embedding merely because the same service supports them. Preserve existing ECOM grant, callback and default return.
5. Explain operator attestation: mode `vt`, presentation `hosted`, stable `operator.id`, and the actual recent `operator.authenticatedAt`. New requests require authentication within five minutes. The Lab rechecks its configured account password and generates the timestamp after success. External software uses its own staff authentication; never advise substituting the current time without authentication.
6. Ask the developer to save the request before sending. On response, save GetEdge request ID and payment/session/sale IDs when present. The initial staff collection response can have no payment yet. A URL is not success.
7. Complete the hosted staff journey. Raw card details stay in NMI-hosted fields. GetEdge processes the returned token through the existing MOTO engine and NMI v5. No normal customer 3DS journey is introduced.
8. Verify callback raw bytes, source/order/amount/payment identity and event/revision. Persist receipt and booking update before acknowledging. Duplicate delivery is normal; use event IDs and monotonic revisions.
9. When either side is unavailable, recover the same request, never create another obligation for an uncertain payment. Callback outboxes persist retries. Inspect correlation IDs and delivery attempts; reconcile unknown status before trying another charge.
10. Moving live is separate provisioning and acceptance: merchant MOTO permissions, live processing configuration, separate keys/destinations and verified staff authorisation. This Lab is staging-only.

## Dedicated Lab configuration

Reuse the dedicated Build 1 **Lab** integration `cmuu4ofog0001jn04mrya039t`, never Events. Its source identifier `developer-lab-ecom` is retained for compatibility. Add only its actual granted MOTO route (`vt`) and allow the MOTO return URL, `https://staging.edge-lab.uk/developer/moto`. Keep existing ECOM route/defaults and the source callback `https://staging.edge-lab.uk/api/developer/callback`. Prime continues to call `https://staging.edge-lab.uk/api/session/callback`.

The Lab demo operator is its existing privately provisioned `staffUser`, verified with that connection's separate Lab login credential. No Events identity is borrowed. Source/route/currency/sample/expiry policies remain configuration; examples are editable. Keep Prime's existing staff collection security, token authority and MOTO engine. Staff collection policy needs only `telephone_payment` and the Lab return origin; embedding origins stay empty.

The private prepared configuration script reads current deployed source/connection arrays and changes only the dedicated Lab entry after retrieving and verifying its signed route response. It ran after the approved MOTO grant was saved, updating only the dedicated source/connection. No database migration is needed: mode remains in the immutable request and the existing consumer/receipt tables are reused with mode-filtered history.

## Implementation

- Shared existing DeveloperLab presentation gains Hosted ECOM/MOTO navigation, mode-specific explanation/code and MOTO operator reauthentication. ECOM card checkout is unchanged.
- `/developer/moto` and `/api/developer/moto` are Lab consumer UI routes, **not a competing public payment API**. Both demo modes call the canonical signed `/api/session` via the published client.
- Shared consumer storage preserves exact requests, original immediate response, status recovery and verified callbacks. History is filtered by mode. A payment identity cannot be reused across modes.
- Password is verified server-side, never persisted in the example or sent to Prime/NMI. Browser-supplied identity/timestamps are not trusted.
- Public executable MOTO sample generates mechanical IDs/expiry and saves the exact body. It requires genuine authentication context from the source, and signs/verifies using the same client as ECOM.
- No changes to canonical session service, Prime engine, NMI card collection, Events or other payment products.

## Reproduce the demonstration

1. Open https://staging.edge-lab.uk/developer/moto and use the existing private Developer Lab login (kept outside this handover).
2. Choose **New example**, enter a unique reference and amount, and confirm the same Lab operator password. The server derives real authentication context.
3. Choose **Create MOTO payment**, then **Open hosted MOTO**, then **Take telephone payment**.
4. In the NMI-hosted test fields use published test Visa `4111111111111111`, a future expiry, and security code `999`. Submit the telephone payment. Only use the verified test gateway; never real cards.
5. Reopen the Lab MOTO page to see **Approved**, provider reference and verified callback. The hosted staff completion page currently remains on its approval; returning to Lab is manual.
6. Inspect the actual request/response/event or download the Node/cURL examples. Reuse saved request identities for recovery; create a new saved request only for a new payment.

Evidence: `acceptance-evidence.json`, `published-example-evidence.json`, `ecom-recovery-evidence.json`, `moto-reporting.png`, `moto-hosted-fields.png`, `ecom-regression-fields.png`. Timestamps are retained as returned by each database; Prime's timestamp-without-time-zone values should not be compared as clock synchronisation evidence.

## Local verification — 5 October 2026

30 session-gateway/consumer tests passed against the disposable local PostgreSQL database, including MOTO fresh authentication, wrong-password refusal, immutable request replay, signed response/callback verification, mode isolation and the unchanged ECOM tests. TypeScript and targeted lint passed. The webpack production build passed. Local Turbopack failed to bind a subprocess port even with escalation; this was not a TypeScript/application compile failure. Rendered staging MOTO and real provider approval/callback acceptance subsequently passed as recorded above.

Changed files: `app/developer/DeveloperLab.tsx`, `app/developer/developer.css`, `app/developer/moto/page.tsx`, `app/api/developer/{ecom,moto}/route.ts`, `lib/developer-ecom/{service,http}.ts`, `lib/session-gateway/deployment.ts`, `proxy.ts`, `public/hosted-moto-example.mjs`, `public/hosted-moto-guide.md`, this handover, and `tests/session-gateway/{ecom-lab,developer-example}.test.ts`.

## Browser observation

NMI Collect.js logged `Could not create PaymentRequestAbstraction` during MOTO field setup/submission. Hosted card entry and the MOTO approval completed successfully despite this provider-side browser message. No wallet acceptance is claimed. Screenshot `moto-approved.png` shows the reopened Lab result and callback.
