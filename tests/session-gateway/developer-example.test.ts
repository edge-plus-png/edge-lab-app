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

test('public client and executable cURL preparation match the canonical signer with fresh saved identity', async () => {
  const {signature:publicSignature}=await import('../../public/developer-client.mjs');
  const {mkdtempSync,readFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join,resolve}=await import('node:path');
  const {execFileSync}=await import('node:child_process');
  const dir=mkdtempSync(join(tmpdir(),'getedge-example-'));
  const script=resolve('public/hosted-ecom-example.mjs');
  const secret='example-test-secret-not-for-deployment';
  const env={...process.env,GETEDGE_SESSION_URL:'https://lab.test/api/session',GETEDGE_SOURCE_ID:'another-source',GETEDGE_REQUEST_SECRET:secret,GETEDGE_RESULT_SECRET:secret,GETEDGE_RETURN_URL:'https://consumer.test/return',GETEDGE_REFERENCE:'EXAMPLE',GETEDGE_AMOUNT:'21.07',GETEDGE_CURRENCY:'EUR',GETEDGE_SESSION_SECONDS:'300'};
  try {
    execFileSync(process.execPath,[script,'prepare-curl'],{cwd:dir,env});
    const raw=readFileSync(join(dir,'getedge-curl-body.json'),'utf8'),r=JSON.parse(raw);
    assert.equal(r.amountMinor,2107);assert.ok(Date.parse(r.expiresAt)>Date.now());assert.equal(r.mode,'ecom');assert.equal(r.presentation,'hosted');
    const headers=new Headers(readFileSync(join(dir,'getedge-curl-headers.txt'),'utf8').trim().split('\n').map(l=>{const i=l.indexOf(':');return [l.slice(0,i),l.slice(i+1).trim()] as [string,string]}));
    assert.equal(headers.get('x-getedge-signature'),signature(secret,headers.get('x-getedge-timestamp')!,'session.create','another-source',raw));
    assert.equal(headers.get('x-getedge-signature'),publicSignature(secret,headers.get('x-getedge-timestamp')!,'session.create','another-source',raw));
    execFileSync(process.execPath,[script,'prepare-curl'],{cwd:dir,env});assert.equal(readFileSync(join(dir,'getedge-curl-body.json'),'utf8'),raw);
  }finally{rmSync(dir,{recursive:true,force:true})}
});

test('published MOTO example requires genuine authentication time and signs immutable MOTO requests',async()=>{
 const {mkdtempSync,readFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'getedge-moto-example-')),script=resolve('public/hosted-moto-example.mjs');
 const env={...process.env,GETEDGE_SESSION_URL:'https://lab.test/api/session',GETEDGE_SOURCE_ID:'independent-moto',GETEDGE_REQUEST_SECRET:'fixture-secret-over-thirty-two-characters',GETEDGE_RESULT_SECRET:'fixture-secret-over-thirty-two-characters',GETEDGE_REFERENCE:'SECOND-OPERATOR',GETEDGE_AMOUNT:'27.36',GETEDGE_CURRENCY:'EUR',GETEDGE_RETURN_URL:'https://consumer.test/moto-return',GETEDGE_SESSION_SECONDS:'300',GETEDGE_OPERATOR_ID:'agent-27',GETEDGE_OPERATOR_AUTHENTICATED_AT:new Date().toISOString()};
 try{
  assert.throws(()=>execFileSync(process.execPath,[script,'prepare-curl'],{cwd:dir,env:{...env,GETEDGE_OPERATOR_AUTHENTICATED_AT:'2000-01-01T00:00:00Z'},stdio:'pipe'}));
  execFileSync(process.execPath,[script,'prepare-curl'],{cwd:dir,env});const raw=readFileSync(join(dir,'getedge-curl-body.json'),'utf8'),r=JSON.parse(raw);
  assert.equal(r.mode,'vt');assert.equal(r.operator.id,'agent-27');assert.equal(r.operator.authenticatedAt,env.GETEDGE_OPERATOR_AUTHENTICATED_AT);assert.equal(r.amountMinor,2736);
  const h=new Headers(readFileSync(join(dir,'getedge-curl-headers.txt'),'utf8').trim().split('\n').map(l=>{const i=l.indexOf(':');return [l.slice(0,i),l.slice(i+1).trim()] as [string,string]}));assert.equal(h.get('x-getedge-signature'),signature(env.GETEDGE_REQUEST_SECRET,h.get('x-getedge-timestamp')!,'session.create',env.GETEDGE_SOURCE_ID,raw));
  execFileSync(process.execPath,[script,'prepare-curl'],{cwd:dir,env:{...env,GETEDGE_OPERATOR_ID:'changed'}});assert.equal(readFileSync(join(dir,'getedge-curl-body.json'),'utf8'),raw);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('published Payment Link example requires genuine authentication time and signs immutable Payment Link requests',async()=>{
 const {mkdtempSync,readFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'getedge-moto-example-')),script=resolve('public/payment-link-example.mjs');
 const env={...process.env,GETEDGE_SESSION_URL:'https://lab.test/api/session',GETEDGE_SOURCE_ID:'independent-moto',GETEDGE_REQUEST_SECRET:'fixture-secret-over-thirty-two-characters',GETEDGE_RESULT_SECRET:'fixture-secret-over-thirty-two-characters',GETEDGE_REFERENCE:'SECOND-OPERATOR',GETEDGE_AMOUNT:'27.36',GETEDGE_CURRENCY:'EUR',GETEDGE_RETURN_URL:'https://consumer.test/moto-return',GETEDGE_SESSION_SECONDS:'300',GETEDGE_OPERATOR_ID:'agent-27',GETEDGE_OPERATOR_AUTHENTICATED_AT:new Date().toISOString()};
 try{
  assert.throws(()=>execFileSync(process.execPath,[script,'prepare-curl'],{cwd:dir,env:{...env,GETEDGE_OPERATOR_AUTHENTICATED_AT:'2000-01-01T00:00:00Z'},stdio:'pipe'}));
  execFileSync(process.execPath,[script,'prepare-curl'],{cwd:dir,env});const raw=readFileSync(join(dir,'getedge-curl-body.json'),'utf8'),r=JSON.parse(raw);
  assert.equal(r.mode,'pbl');assert.equal(r.operator.id,'agent-27');assert.equal(r.operator.authenticatedAt,env.GETEDGE_OPERATOR_AUTHENTICATED_AT);assert.equal(r.amountMinor,2736);
  const h=new Headers(readFileSync(join(dir,'getedge-curl-headers.txt'),'utf8').trim().split('\n').map(l=>{const i=l.indexOf(':');return [l.slice(0,i),l.slice(i+1).trim()] as [string,string]}));assert.equal(h.get('x-getedge-signature'),signature(env.GETEDGE_REQUEST_SECRET,h.get('x-getedge-timestamp')!,'session.create',env.GETEDGE_SOURCE_ID,raw));
  execFileSync(process.execPath,[script,'prepare-curl'],{cwd:dir,env:{...env,GETEDGE_OPERATOR_ID:'changed'}});assert.equal(readFileSync(join(dir,'getedge-curl-body.json'),'utf8'),raw);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
