import test from "node:test";
import assert from "node:assert/strict";
import { publicSessionBoundary as boundary } from "../../lib/session-gateway/public-boundary";
const config = JSON.stringify(["configured.example", "second.example"]);
test("configured public domains cannot dispatch legacy routes or unsigned sessions", () => {
  for (const host of ["configured.example", "second.example"]) {
    for (const path of ["/api/charge", "/api/pay", "/api/result", "/api/result-resend", "/api/webhook-sink", "/api/return-url-test", "/pay/session", "/store", "/api/session/unknown"]) {
      assert.equal(boundary(host,path,"POST",null,config),404);
    }
    assert.equal(boundary(host,"/api/session","POST",null,config),401);
    assert.equal(boundary(host,"/api/session","GET","2",config),401);
    assert.equal(boundary(host,"/api/session","POST","1",config),401);
  }
});
test("only expected signed and staff handlers pass through for their own authentication", () => {
  assert.equal(boundary("configured.example","/api/session","POST","2",config),null);
  for (const path of ["/api/session/callback","/api/session/worker","/api/session/status"]) {
    assert.equal(boundary("configured.example",path,"POST",null,config),null);
    assert.equal(boundary("configured.example",path,"GET",null,config),405);
  }
  assert.equal(boundary("configured.example","/collect","GET",null,config),null);
  assert.equal(boundary("configured.example","/api/pay-lab/settings","GET",null,config),null);
  assert.equal(boundary("configured.example","/_next/static/chunk.js","GET",null,config),null);
  assert.equal(boundary("configured.example","/_next/static/chunk.js","POST",null,config),404);
});
test("other hosts retain their existing behavior and malformed config fails closed", () => {
  assert.equal(boundary("legacy.example","/api/session","POST",null,config),null);
  assert.equal(boundary("configured.example","/api/charge","POST",null,""),null);
  for(const raw of ["invalid", "{}", '["https://example.com"]']) assert.equal(boundary("configured.example","/api/session","POST","2",raw),503);
});
