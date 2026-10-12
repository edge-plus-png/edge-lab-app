import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {database} from '../../lib/pay-lab/db';
import {paymentRequest,createExample,receiveExample,recoverExample,demoConfiguration} from '../../lib/developer-ecom/service';
import {signature} from '../../lib/session-gateway/auth';
import {loginCookie} from '../../lib/session-gateway/developer';
import {Source} from '../../lib/session-gateway/config';
if(process.env.PAY_LAB_DATABASE_URL!=='postgresql://kevinsmith@127.0.0.1:55459/postgres')throw Error('Use isolated test database');
const s:Source={id:'ecom-test',connectionId:'ecom-test',hosts:['lab.test'],enabled:true,requestSecretEnv:'ECOM_TEST_REQ',resultSecretEnv:'ECOM_TEST_RES',callbackUrl:'https://lab.test/api/developer/callback',returnUrls:['https://lab.test/developer'],embeddingOrigins:[],modes:['ecom'],presentations:['hosted'],routes:{EUR:{ecom:'route'}},maxSessionSeconds:600,delivery:{maxAttempts:3,retrySeconds:1,timeoutSeconds:1,leaseSeconds:2}};
process.env.ECOM_TEST_REQ='test-request-secret-with-32-characters';process.env.ECOM_TEST_RES='test-result-secret-with-32-characters';process.env.PAY_LAB_ECOM_TRY_SOURCE_ID=s.id;
process.env.PAY_LAB_CONNECTIONS=JSON.stringify([{id:s.id,name:'Editable test source',hosts:s.hosts,origin:'https://prime.test',integrationId:'ecom-int',merchantId:'merchant',pairingId:'pair',environment:'staging',sourceId:'sample',sourceType:'test',signingSecretEnv:'ECOM_TEST_REQ',staffPasswordEnv:'ECOM_TEST_RES',staffUser:'test',routeRefs:['route'],callbackUrl:'https://lab.test/api/session/callback',returnUrls:s.returnUrls,collectScriptUrl:'https://secure.nmi.com/token/Collect.js',providerTestModeConfirmed:true,sample:{reference:'EDITABLE',amount:'8.75',currency:'EUR',sessionSeconds:300}}]);
const originalFetch=global.fetch;
after(async()=>{global.fetch=originalFetch;await database().end()});
test('hosted ECOM consumer validates configuration, uses HTTP signing, persists actual response and verifies/replays callbacks',async()=>{
 await database().query(readFileSync('scripts/developer-ecom.sql','utf8'));
 const input={submissionId:randomUUID(),reference:'SECOND-SOURCE',amount:'17.23',currency:'EUR'};
 const r=paymentRequest(s,input);assert.equal(r.request.amountMinor,1723);assert.equal(r.request.mode,'ecom');assert.equal(r.request.presentation,'hosted');assert.ok(Date.parse(r.request.expiresAt)>Date.now());
 assert.throws(()=>paymentRequest(s,{...input,currency:'GBP'}));assert.throws(()=>paymentRequest(s,{...input,amount:'0.00'}));assert.throws(()=>demoConfiguration({...s,presentations:['hosted','inline']}));
 let sent:Record<string,unknown>|null=null,calls=0;
 global.fetch=async(url,init)=>{assert.equal(String(url),'https://lab.test/api/session');calls++;const h=new Headers(init?.headers),raw=String(init?.body);assert.equal(h.get('x-getedge-signature'),signature(process.env.ECOM_TEST_REQ!,h.get('x-getedge-timestamp')!,'session.create',s.id,raw));sent=JSON.parse(raw);const response=JSON.stringify({...sent,version:'2',requestId:input.submissionId,launch:{url:'https://prime.test/getedge-pay/checkout/fixture',audience:'customer',presentation:'hosted'},payment:null});const timestamp=String(Math.floor(Date.now()/1000));return new Response(response,{headers:{'x-getedge-version':'2','x-getedge-source':s.id,'x-getedge-timestamp':timestamp,'x-getedge-signature':signature(process.env.ECOM_TEST_RES!,timestamp,'session.create.response',s.id,response)}})};
 const saved=await createExample(s,input);assert.ok(sent);assert.deepEqual(saved.request,sent);assert.equal(saved.response.requestId,input.submissionId);
 await createExample(s,input);assert.equal(calls,1);await assert.rejects(createExample(s,{...input,amount:'18.00'}));
 const event={...saved.request,type:'payment.updated',version:'2',eventId:randomUUID(),requestId:input.submissionId,payment:{state:'approved',sessionId:'session',saleId:'sale',revision:3,sessionState:'closed',providerReference:'simulated-provider-fixture'}};
 const sign=(v:unknown)=>{const raw=JSON.stringify(v),stamp=String(Math.floor(Date.now()/1000));return {raw,headers:new Headers({'x-getedge-version':'2','x-getedge-source':s.id,'x-getedge-event-id':event.eventId,'x-getedge-timestamp':stamp,'x-getedge-signature':signature(process.env.ECOM_TEST_RES!,stamp,'result',s.id,raw)})}};
 const good=sign(event);await assert.rejects(receiveExample(s,good.raw+' ',good.headers));await assert.rejects(receiveExample(s,...Object.values(sign({...event,amountMinor:1})) as [string,Headers]));
 assert.deepEqual(await receiveExample(s,good.raw,good.headers),{eventId:event.eventId,accepted:true});await receiveExample(s,good.raw,good.headers);
 const receipts=await database().query('SELECT count(*)::int AS n FROM pay_lab_developer_receipts WHERE source=$1 AND example_id=$2',[s.id,input.submissionId]);assert.equal(receipts.rows[0].n,1);
 const conflict=sign({...event,payment:{...event.payment,providerReference:'other'}});await assert.rejects(receiveExample(s,conflict.raw,conflict.headers));
 await assert.rejects(recoverExample({...s,id:'other'},input.submissionId));
});

test('MOTO consumer requires authenticated session access, preserves staff context and isolates ECOM evidence',async()=>{
 const {handlers}=await import('../../lib/developer-ecom/http');
 const {listExamples}=await import('../../lib/developer-ecom/service');
 const m:Source={...s,modes:['ecom','vt'],routes:{EUR:{ecom:'route',vt:'moto-route'}},returnUrls:[...s.returnUrls,'https://lab.test/developer/moto']};
 process.env.PAY_LAB_SOURCES=JSON.stringify([m]);process.env.PAY_LAB_DEPLOYMENT_MODE='canonical';process.env.PAY_LAB_ENVIRONMENT='staging';process.env.VERCEL_ENV='preview';
 const input={submissionId:randomUUID(),reference:'MOTO-SECOND-SOURCE',amount:'32.41',currency:'EUR'};
 assert.throws(()=>paymentRequest(m,input,'vt'));assert.throws(()=>paymentRequest(m,input,'vt',new Date(Date.now()-600000).toISOString()));
 const p=paymentRequest(m,input,'vt',new Date().toISOString());assert.equal(p.request.operator?.id,'test');assert.equal(p.request.mode,'vt');assert.equal(p.request.returnUrl,'https://lab.test/developer/moto');assert.equal(p.request.amountMinor,3241);
 let calls=0;
 global.fetch=async(url,init)=>{
  calls++;assert.equal(String(url),'https://lab.test/api/session');const raw=String(init?.body),h=new Headers(init?.headers),r=JSON.parse(raw);
  assert.equal(h.get('x-getedge-signature'),signature(process.env.ECOM_TEST_REQ!,h.get('x-getedge-timestamp')!,'session.create',m.id,raw));
  assert.equal(r.operator.id,'test');assert.equal(r.mode,'vt');assert.ok(Math.abs(Date.now()-Date.parse(r.operator.authenticatedAt))<5000);
  assert.equal('operatorPassword' in r,false);
  const response=JSON.stringify({...r,version:'2',requestId:input.submissionId,launch:{url:'https://prime.test/getedge-pay/collect/fixture',audience:'staff',presentation:'hosted'},payment:null});
  const stamp=String(Math.floor(Date.now()/1000));return new Response(response,{headers:{'x-getedge-version':'2','x-getedge-source':m.id,'x-getedge-timestamp':stamp,'x-getedge-signature':signature(process.env.ECOM_TEST_RES!,stamp,'session.create.response',m.id,response)}});
 };
 const req=(password:string)=>new Request('https://lab.test/api/developer/moto',{method:'POST',headers:{host:'lab.test',origin:'https://lab.test',...(password===process.env.ECOM_TEST_RES?{cookie:'__Host-getedge-lab='+loginCookie(m,'ECOM_TEST_RES')}:{authorization:'Basic '+Buffer.from('test:'+password).toString('base64')}),'content-type':'application/json'},body:JSON.stringify({action:'create',input})});
 assert.equal((await handlers('vt').POST(req('wrong'))).status,401);assert.equal(calls,0);
 assert.equal((await handlers('vt').POST(req(process.env.ECOM_TEST_RES!))).status,200);assert.equal(calls,1);
 const saved=(await listExamples(m,'vt')).find(r=>r.id===input.submissionId);assert.ok(saved);assert.equal(saved.request.operator.id,'test');assert.equal(JSON.stringify(saved).includes(process.env.ECOM_TEST_RES!),false);
 assert.equal((await listExamples(m)).some(r=>r.id===input.submissionId),false);
 await assert.rejects(recoverExample(m,input.submissionId,'ecom'));
 assert.equal((await handlers('vt').POST(req(process.env.ECOM_TEST_RES!))).status,200);assert.equal(calls,1);
 const event={...saved.request,type:'payment.updated',version:'2',eventId:randomUUID(),requestId:input.submissionId,payment:{state:'approved',sessionId:'moto-session',saleId:'moto-sale',revision:3,sessionState:'closed',providerReference:'simulated-moto-fixture'}};
 const raw=JSON.stringify(event),stamp=String(Math.floor(Date.now()/1000)),headers=new Headers({'x-getedge-version':'2','x-getedge-source':m.id,'x-getedge-event-id':event.eventId,'x-getedge-timestamp':stamp,'x-getedge-signature':signature(process.env.ECOM_TEST_RES!,stamp,'result',m.id,raw)});
 await receiveExample(m,raw,headers);await receiveExample(m,raw,headers);
 const result=(await listExamples(m,'vt')).find(r=>r.id===input.submissionId);assert.equal(result.event.payment.state,'approved');assert.equal(result.event.mode,'vt');
});

test('Payment Link consumer requires authenticated session access, preserves staff context and isolates ECOM evidence',async()=>{
 const {handlers}=await import('../../lib/developer-ecom/http');
 const {listExamples}=await import('../../lib/developer-ecom/service');
 const m:Source={...s,modes:['ecom','pbl'],routes:{EUR:{ecom:'route',pbl:'route'}},returnUrls:[...s.returnUrls,'https://lab.test/developer/payment-links']};
 process.env.PAY_LAB_SOURCES=JSON.stringify([m]);process.env.PAY_LAB_DEPLOYMENT_MODE='canonical';process.env.PAY_LAB_ENVIRONMENT='staging';process.env.VERCEL_ENV='preview';
 const input={submissionId:randomUUID(),reference:'LINK-SECOND-SOURCE',amount:'32.41',currency:'EUR'};
 assert.throws(()=>paymentRequest(m,input,'pbl'));assert.throws(()=>paymentRequest(m,input,'pbl',new Date(Date.now()-600000).toISOString()));
 const p=paymentRequest(m,input,'pbl',new Date().toISOString());assert.equal(p.request.operator?.id,'test');assert.equal(p.request.mode,'pbl');assert.equal(p.request.returnUrl,'https://lab.test/developer/payment-links');assert.equal(p.request.amountMinor,3241);
 let calls=0;
 global.fetch=async(url,init)=>{
  calls++;assert.equal(String(url),'https://lab.test/api/session');const raw=String(init?.body),h=new Headers(init?.headers),r=JSON.parse(raw);
  assert.equal(h.get('x-getedge-signature'),signature(process.env.ECOM_TEST_REQ!,h.get('x-getedge-timestamp')!,'session.create',m.id,raw));
  assert.equal(r.operator.id,'test');assert.equal(r.mode,'pbl');assert.ok(Math.abs(Date.now()-Date.parse(r.operator.authenticatedAt))<5000);
  assert.equal('operatorPassword' in r,false);
  const response=JSON.stringify({...r,version:'2',requestId:input.submissionId,launch:{url:'https://prime.test/getedge-pay/checkout/fixture',audience:'customer',presentation:'hosted'},payment:null});
  const stamp=String(Math.floor(Date.now()/1000));return new Response(response,{headers:{'x-getedge-version':'2','x-getedge-source':m.id,'x-getedge-timestamp':stamp,'x-getedge-signature':signature(process.env.ECOM_TEST_RES!,stamp,'session.create.response',m.id,response)}});
 };
 const req=(password:string)=>new Request('https://lab.test/api/developer/payment-links',{method:'POST',headers:{host:'lab.test',origin:'https://lab.test',...(password===process.env.ECOM_TEST_RES?{cookie:'__Host-getedge-lab='+loginCookie(m,'ECOM_TEST_RES')}:{authorization:'Basic '+Buffer.from('test:'+password).toString('base64')}),'content-type':'application/json'},body:JSON.stringify({action:'create',input})});
 assert.equal((await handlers('pbl').POST(req('wrong'))).status,401);assert.equal(calls,0);
 assert.equal((await handlers('pbl').POST(req(process.env.ECOM_TEST_RES!))).status,200);assert.equal(calls,1);
 const saved=(await listExamples(m,'pbl')).find(r=>r.id===input.submissionId);assert.ok(saved);assert.equal(saved.request.operator.id,'test');assert.equal(JSON.stringify(saved).includes(process.env.ECOM_TEST_RES!),false);
 assert.equal((await listExamples(m)).some(r=>r.id===input.submissionId),false);
 await assert.rejects(recoverExample(m,input.submissionId,'ecom'));
 assert.equal((await handlers('pbl').POST(req(process.env.ECOM_TEST_RES!))).status,200);assert.equal(calls,1);
 const event={...saved.request,type:'payment.updated',version:'2',eventId:randomUUID(),requestId:input.submissionId,payment:{state:'approved',sessionId:'link-session',saleId:'link-sale',revision:3,sessionState:'closed',providerReference:'simulated-link-fixture'}};
 const raw=JSON.stringify(event),stamp=String(Math.floor(Date.now()/1000)),headers=new Headers({'x-getedge-version':'2','x-getedge-source':m.id,'x-getedge-event-id':event.eventId,'x-getedge-timestamp':stamp,'x-getedge-signature':signature(process.env.ECOM_TEST_RES!,stamp,'result',m.id,raw)});
 await receiveExample(m,raw,headers);await receiveExample(m,raw,headers);
 const result=(await listExamples(m,'pbl')).find(r=>r.id===input.submissionId);assert.equal(result.event.payment.state,'approved');assert.equal(result.event.mode,'pbl');
});

test('developer consumer uses the configured public API independently of its return and callback origin',()=>{
 process.env.PAY_LAB_PUBLIC_SESSION_URL='https://api.test/api/session';
 try{
  const c=demoConfiguration({...s,hosts:[...s.hosts,'api.test']});
  assert.equal(c.endpoint,'https://api.test/api/session');assert.equal(c.returnUrl,'https://lab.test/developer');
  assert.throws(()=>demoConfiguration(s));
 }finally{delete process.env.PAY_LAB_PUBLIC_SESSION_URL;}
});
