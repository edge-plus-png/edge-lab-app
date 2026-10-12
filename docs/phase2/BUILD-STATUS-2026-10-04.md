# BUILD continuation — 4 October 2026

The target now includes developer-facing ECOM, integrated MOTO and Payment Link demonstrations with real NMI sandbox acceptance. Events remains the ECOM reference implementation. Card Present is a separate later readiness item.

## Work performed

- Published the isolated Lab branch `codex/phase2-canonical` at `c6d380d`; no production branch was changed.
- Linked the canonical Lab preview to `staging.edge-lab.uk`. Branch-only configuration uses the existing isolated Lab Neon database. Verified its five expected `pay_lab_*` tables without modifying rows.
- Reconciled the local Prime candidate with the newer deployed `ab8c64a` Hosted Checkout compatibility release. Current local candidate is `80acaf0`. Kept that release's existing payment behaviour; canonical GetEdge Pay customer/operator adapters retain the explicit v5 path. Typecheck and 49 focused adapter tests pass after reconciliation.
- Existing Hosted Checkout compatibility evidence includes actual sandbox payments, but does not establish Events → Lab → Prime acceptance. No actual NMI payment was submitted in this continuation.

Deployment `dpl_G32x5imECv3KiFHom4iAEYCJJ43g` is READY at `https://staging.edge-lab.uk`, application commit `c6d380d`. Authenticated Vercel diagnostics confirm `contract: session-v2`, `processing: Prime`, and rejection of `/api/charge`. Public reachability is still blocked as described below.

## External access blockers

1. The existing Prime “GetEdge Pay Lab · Events staging” connection remains inactive. Its saved callback and return destinations match the intended chain. Confirmation is pending to enable the connection including telephone-payment permission. This is a security-sensitive access grant in the browser.
2. Public requests to `https://staging.edge-lab.uk/api/session` and `/api/session/callback` receive Vercel Authentication HTTP401 before the application runs. Browser login or a developer-only diagnostic bypass does not prove machine callback delivery. A decision is pending on making only this staging domain publicly reachable while retaining application signature authentication. No deployment-protection settings were changed.

After those gates: install source credentials and routes through the documented onboarding process, configure durable notification workers, deploy the reconciled Prime/Events candidates, and record real hosted/embedded ECOM evidence. Then prove MOTO and Payment Link through the same service chain and finish the developer-facing journey inspector/examples. Do not mark any of these journeys complete from simulated tests.

## Card Present

No terminal code, device configuration or receiver authority was changed. Existing receiver/simulator capability is not evidence of a configured physical test terminal or a completed hardware payment. Hardware acceptance remains separate and unproven here.
