# Phase 2 acceptance evidence

Status: **Not provider accepted, not complete.** Latest deployment/access status: [4 October continuation](BUILD-STATUS-2026-10-04.md). Local results below remain simulation-qualified.

## Proven locally

- Lab canonical deployment routing blocks legacy payment/card pages; unsigned v2 requests do not fall back.
- Lab PostgreSQL acceptance covers signatures/source matching, immutable requests, concurrent retries, two configured sources/currencies, callback failure/retry/exhaustion, duplicate events, declined/cancelled states, approved non-regression and audited replay.
- Actual Events, Lab and Prime service code runs against three independent disposable databases. Events prepares a saved test booking request; Lab calls Prime's authenticated public handlers; Prime creates/reserves a payment and passes the request through the v5 adapter. Prime's durable signed notification is verified/persisted by Lab; Lab's signed event is verified/applied by Events.
- Approval, decline, authorised cancellation, receiver outage and acknowledgement loss pass across that chain. Repeated submission does not create a second provider dispatch. Events confirms the correct order once.
- Standalone developer signing/callback examples are tested against Lab's actual contract.

## Explicit simulation boundaries

The cross-service suite replaces provider HTTP with deterministic v5-shaped responses and fixture token/3DS evidence. Public DNS and HTTPS transport are replaced with loopback/in-process delivery to avoid external calls. Booking fixtures are created in the actual Events schema and exercised through its payment service; the customer booking UI and real NMI component are not exercised by this suite.

`tests/phase2/journey.test.ts` in Prime imports the adjacent Lab checkout. `tests/phase2/bridge.test.ts` in Events exposes a loopback-only authenticated test bridge. Neither is a deployed product API. They require explicit enable flags and exact disposable database URLs.

## Still required

- Install canonical staging source/connection credentials, route configuration and worker/support secrets.
- Activate the existing staging Lab integration and confirm v5 release routing. Prime’s signed-in dashboard reports NMI test mode; actual provider processing still requires transaction evidence.
- Run a genuine Events staging booking through actual NMI sandbox tokenisation/authentication/payment.
- Prove publicly reachable application-authenticated callbacks and scheduled delivery recovery.
- Browser hosted/inline authentication, iframe sizing and refresh/reopen acceptance.
- Record the deployed SHAs, provider transaction IDs and both delivery acknowledgements; replace this pending status only with that evidence.

## Isolation

Legacy production behaviour is preserved in a separately selected deployment profile. Canonical staging exposes only the documented signed session API, authenticated worker/support operations and service identity; its direct legacy charge routes reject execution. No terminal changes are introduced relative to current Prime staging.

## Validation results for this candidate

- Lab: **23/23** session-gateway/contract/database/example tests pass.
- Prime: **670** targeted Pay/v5 tests pass; **69** optional tests skipped in that command. Separate cross-service runner: **6/6** cases pass plus its Events bridge lifecycle.
- Events: **275** default unit tests pass; **14** opt-in tests skipped there. Separate PostgreSQL Lab acceptance: **13/13** pass.
- Browser component: **1/1** Playwright scenario passes (actual Events panel, simulated API/iframe). Correct resizing, legacy identifier rejection, untrusted approval rejection, server-status-only confirmation. Screenshot: `events-embed-fixture.png`.
- Typechecks pass for all three projects. Webpack production builds pass with explicit non-secret fixture environment values where required. Initial builds correctly refused missing application identity/database configuration; no validation guard was bypassed in source.
- Targeted lint for new/edited modules passes. This is not a claim that unchanged legacy repository lint is clean.

The in-app browser blocked the localhost fixture (`ERR_BLOCKED_BY_CLIENT`); the project's automated Playwright runner provided the component evidence. There is no deployed-browser/provider acceptance claim.

## Current staging evidence

Read-only Vercel metadata shows Lab has its staging database but no `PAY_LAB_SOURCES`, `PAY_LAB_CONNECTIONS`, source signing secrets or worker/support credentials installed. Legacy NMI keys are assigned to Production/Preview/Development; they must not become canonical integration credentials. Canonical route isolation is implemented, but configuration removal/isolation in deployed environments is outstanding. Lab protection is `all_except_custom_domains`; public callback reachability still needs an application-level POST test on the chosen canonical domain. Prime staging is now signed in and its dashboard reports NMI test mode. Its deployed release is `7814f5a89dfa48b308cfa34fadf3e332cf51a05e`. The existing “GetEdge Pay Lab · Events staging” connection is inactive, has ECOM/MOTO routes selected and has the intended Lab callback and Events return destinations. Action-time confirmation to mark readiness and enable this connection is pending; no connection access has been changed.

Canonical Lab has now been deployed to staging; see the dated continuation for deployment and access blockers. No actual provider payment was submitted by this implementation run. Existing production aliases and terminal code were not changed.
