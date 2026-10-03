import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signature as sampleSignature, verify, verifyEvent } from '../../examples/session-v2/client.mjs';
import { signature, signedHeaders } from '../../lib/session-gateway/auth';
import type { Source } from '../../lib/session-gateway/config';
test('standalone developer signing is byte-compatible with the running Lab contract', () => {
  const secret = 'example-test-secret-not-for-deployment', sourceId = 'second-source', timestamp = String(Math.floor(Date.now()/1000));
  const raw = JSON.stringify({ reference: 'Unicode £ booking', amountMinor: 1987 });
  assert.equal(sampleSignature(secret, timestamp, 'session.create', sourceId, raw), signature(secret, timestamp, 'session.create', sourceId, raw));
  process.env.EXAMPLE_RESULT_SECRET = secret;
  const headers = new Headers(signedHeaders({ id: sourceId, resultSecretEnv: 'EXAMPLE_RESULT_SECRET' } as Source, 'session.create.response', raw));
  assert.deepEqual(verify(raw, headers, 'session.create.response', { resultSecret: secret, sourceId }), JSON.parse(raw));
  assert.throws(() => verify(raw + ' ', headers, 'session.create.response', { resultSecret: secret, sourceId }));
});
test('developer callback example checks signature, order money and event identity', () => {
  const config = { sourceId: 'example', resultSecret: 'example-test-secret-not-for-deployment' };
  process.env.EXAMPLE_RESULT_SECRET = config.resultSecret;
  const saved = { requestKey: 'request', obligationId: 'obligation', reference: 'booking', mode: 'ecom', amountMinor: 1500, currency: 'GBP' };
  const event = { ...saved, version: '2', type: 'payment.updated', requestId: 'lab-id', eventId: 'event', payment: { sessionId: 'prime-session', saleId: 'sale', revision: 3, state: 'approved', sessionState: 'closed', providerReference: 'fixture-provider' } };
  const raw = JSON.stringify(event), headers = new Headers(signedHeaders({ id: config.sourceId, resultSecretEnv: 'EXAMPLE_RESULT_SECRET' } as Source, 'result', raw)); headers.set('x-getedge-event-id', event.eventId);
  assert.deepEqual(verifyEvent(raw, headers, config, saved), event);
  assert.throws(() => verifyEvent(raw, headers, config, { ...saved, amountMinor: 1 }));
  headers.set('x-getedge-event-id', 'different'); assert.throws(() => verifyEvent(raw, headers, config, saved));
});
