import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { canonicalBoundary, rejectLegacyPayment } from "../../lib/session-gateway/deployment";
const original = { ...process.env };
afterEach(() => { for (const k of ["PAY_LAB_DEPLOYMENT_MODE", "PAY_LAB_ENVIRONMENT", "PAY_LAB_CANONICAL_HOSTS", "VERCEL_ENV"]) { if (original[k] === undefined) delete process.env[k]; else process.env[k] = original[k]; } });
function configure() { process.env.PAY_LAB_DEPLOYMENT_MODE = "canonical"; process.env.PAY_LAB_ENVIRONMENT = "staging"; process.env.PAY_LAB_CANONICAL_HOSTS = '["lab.example"]'; process.env.VERCEL_ENV = "preview"; }
test("canonical deployment exposes only the signed API and never legacy card pages", () => {
  configure();
  for (const path of ["/api/pay", "/api/charge", "/api/result-resend", "/pay", "/checkout", "/collect", "/api/webhook-sink", "/store", "/api/session/anything"])
    assert.equal(canonicalBoundary("lab.example", path, "POST")?.status, 404, path);
  assert.equal(rejectLegacyPayment()?.status, 410);
  for (const path of ["/api/session", "/api/session/status", "/api/session/callback", "/api/session/worker", "/api/session/delivery"]) {
    assert.equal(canonicalBoundary("lab.example", path, "POST"), null);
    assert.equal(canonicalBoundary("lab.example", path, "GET")?.status, 405);
  }
});
test("unknown hosts and invalid environments fail closed", () => {
  configure(); assert.equal(canonicalBoundary("other.example", "/api/session", "POST")?.status, 421);
  process.env.VERCEL_ENV = "production"; assert.equal(canonicalBoundary("lab.example", "/api/session", "POST")?.status, 503);
  process.env.PAY_LAB_DEPLOYMENT_MODE = "typo"; assert.equal(rejectLegacyPayment()?.status, 503);
});
test("existing production release is unchanged unless canonical is explicitly selected", () => {
  delete process.env.PAY_LAB_DEPLOYMENT_MODE;
  assert.equal(canonicalBoundary("existing.example", "/api/pay", "POST"), null);
  assert.equal(rejectLegacyPayment(), null);
});

test('staging API alias and historical host are accepted while production hostname is rejected',()=>{configure();process.env.PAY_LAB_CANONICAL_HOSTS=JSON.stringify(['pay.staging.getedgeportal.app','staging.edge-lab.uk']);for(const host of ['pay.staging.getedgeportal.app','staging.edge-lab.uk'])for(const path of ['/api/session','/api/session/status','/api/session/callback'])assert.equal(canonicalBoundary(host,path,'POST'),null);assert.equal(canonicalBoundary('pay.getedgeportal.app','/api/session','POST')?.status,421);});
