import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumerConfiguration} from '../../lib/developer-ecom/consumer-config';
import {demoConfiguration,paymentRequest} from '../../lib/developer-ecom/service';
import {developerSource,loginCookie} from '../../lib/session-gateway/developer';
const app={origin:'https://consumer.test',modes:['ecom'],currencies:['EUR'],sample:{reference:'EDITABLE',amount:'12.34',currency:'EUR',sessionSeconds:900},staffUser:'tester',staffPasswordEnv:'CONSUMER_LOGIN'};
test('independent consumer needs no Prime identity, routes, registry or historical configuration',()=>{
 process.env.PAY_LAB_DEVELOPER_REQUEST_SECRET='consumer-request-secret-over-32-characters';process.env.PAY_LAB_DEVELOPER_RESULT_SECRET='consumer-result-secret-over-32-characters';
 process.env.PAY_LAB_DEVELOPER_APP_CONFIG=JSON.stringify(app);process.env.PAY_LAB_ECOM_TRY_SOURCE_ID='fresh-external-source';process.env.PAY_LAB_PUBLIC_SESSION_URL='https://pay.test/api/session';process.env.PAY_LAB_SOURCES='[]';process.env.PAY_LAB_CONNECTIONS='[]';
 const c=consumerConfiguration()!;const config=demoConfiguration(c.source);
 assert.equal(config.endpoint,'https://pay.test/api/session');assert.equal(config.returnUrl,'https://consumer.test/developer');
 assert.equal(c.source.requestSecretEnv,'PAY_LAB_DEVELOPER_REQUEST_SECRET');assert.equal(c.source.resultSecretEnv,'PAY_LAB_DEVELOPER_RESULT_SECRET');
 const request=paymentRequest(c.source,{submissionId:'0371a708-e8c1-4686-ad0d-b107715ab446',reference:'ORDER-2',amount:'27.69',currency:'EUR'}).request;
 assert.equal(request.amountMinor,2769);assert.equal(request.mode,'ecom');assert.equal(request.operator,undefined);
 assert.throws(()=>demoConfiguration(c.source,'pbl'));assert.throws(()=>demoConfiguration({...c.source,id:'another-source'}));
 process.env.PAY_LAB_ECOM_TRY_SOURCE_ID='another-configured-source';assert.equal(demoConfiguration(consumerConfiguration()!.source).sourceId,'another-configured-source');
});
test('consumer login remains separate from API signing and binds cookies to the selected source',()=>{
 process.env.PAY_LAB_DEPLOYMENT_MODE='canonical';process.env.PAY_LAB_ENVIRONMENT='staging';process.env.VERCEL_ENV='preview';process.env.CONSUMER_LOGIN='a-separate-login-secret-over-32-characters';
 const c=consumerConfiguration()!,access=[{source:c.source,staffUser:c.staffUser,staffPasswordEnv:c.staffPasswordEnv}];
 const headers=new Headers({host:'consumer.test',authorization:'Basic '+Buffer.from('tester:'+process.env.CONSUMER_LOGIN).toString('base64')});
 assert.equal(developerSource(headers,access)?.id,c.source.id);
 const cookie=loginCookie(c.source,c.staffPasswordEnv);
 assert.equal(developerSource(new Headers({host:'consumer.test',cookie:'__Host-getedge-lab='+cookie}),access)?.id,c.source.id);
 assert.equal(developerSource(new Headers({host:'other.test',cookie:'__Host-getedge-lab='+cookie}),access),null);
 assert.equal(developerSource(new Headers({host:'consumer.test',cookie:'__Host-getedge-lab='+cookie}),[{...access[0],source:{...c.source,id:'different'}}]),null);
});
test('consumer sends and receives signed public-contract bytes using only its installed credentials',async()=>{
 if(process.env.PAY_LAB_DATABASE_URL!=='postgresql://kevinsmith@127.0.0.1:55459/postgres')throw Error('Use isolated test database');
 const {database}=await import('../../lib/pay-lab/db');const {readFileSync}=await import('node:fs');const {randomUUID}=await import('node:crypto');
 const {createExample,receiveExample,listExamples}=await import('../../lib/developer-ecom/service');const {signature}=await import('../../lib/session-gateway/auth');
 const db=database();await db.query(readFileSync('scripts/developer-ecom.sql','utf8'));
 const c=consumerConfiguration()!,input={submissionId:randomUUID(),reference:'CONSUMER-'+randomUUID(),amount:'18.79',currency:'EUR'},original=global.fetch;let calls=0;
 global.fetch=async(url,init)=>{
  calls++;assert.equal(String(url),'https://pay.test/api/session');const raw=String(init?.body),h=new Headers(init?.headers);
  assert.equal(h.get('x-getedge-source'),c.source.id);assert.equal(h.get('x-getedge-signature'),signature(process.env.PAY_LAB_DEVELOPER_REQUEST_SECRET!,h.get('x-getedge-timestamp')!,'session.create',c.source.id,raw));
  const body=JSON.stringify({...JSON.parse(raw),version:'2',requestId:input.submissionId,payment:null,launch:{url:'https://checkout.test/example',audience:'customer',presentation:'hosted'}}),stamp=String(Math.floor(Date.now()/1000));
  return new Response(body,{headers:{'x-getedge-version':'2','x-getedge-source':c.source.id,'x-getedge-timestamp':stamp,'x-getedge-signature':signature(process.env.PAY_LAB_DEVELOPER_RESULT_SECRET!,stamp,'session.create.response',c.source.id,body)}});
 };
 try{
  const saved=await createExample(c.source,input);assert.equal(saved.response.launch.url,'https://checkout.test/example');await createExample(c.source,input);assert.equal(calls,1);
  const event={...saved.request,type:'payment.updated',version:'2',eventId:randomUUID(),requestId:input.submissionId,payment:{state:'approved',sessionId:'fixture-session',saleId:'fixture-sale',revision:3,sessionState:'closed',providerReference:'SIMULATED-TEST-ONLY'}};
  const raw=JSON.stringify(event),stamp=String(Math.floor(Date.now()/1000)),headers=new Headers({'x-getedge-version':'2','x-getedge-source':c.source.id,'x-getedge-event-id':event.eventId,'x-getedge-timestamp':stamp,'x-getedge-signature':signature(process.env.PAY_LAB_DEVELOPER_RESULT_SECRET!,stamp,'result',c.source.id,raw)});
  await assert.rejects(receiveExample(c.source,raw+' ',headers));await receiveExample(c.source,raw,headers);await receiveExample(c.source,raw,headers);
  assert.equal((await listExamples(c.source)).find(r=>r.id===input.submissionId)?.event.eventId,event.eventId);
  assert.equal((await db.query('SELECT count(*)::int n FROM pay_lab_developer_receipts WHERE source=$1 AND example_id=$2',[c.source.id,input.submissionId])).rows[0].n,1);
 }finally{global.fetch=original;await db.end()}
});
test('page access accepts the same independent consumer cookie as the login API',async()=>{
 const {default:proxy}=await import('../../proxy');const {NextRequest}=await import('next/server');
 process.env.PAY_LAB_CANONICAL_HOSTS=JSON.stringify(['consumer.test']);
 const c=consumerConfiguration()!,cookie=loginCookie(c.source,c.staffPasswordEnv);
 const allowed=proxy(new NextRequest('https://consumer.test/developer',{headers:{host:'consumer.test',cookie:'__Host-getedge-lab='+cookie}}));
 assert.equal(allowed.headers.get('location'),null);assert.equal(allowed.headers.get('x-middleware-next'),'1');
 const denied=proxy(new NextRequest('https://consumer.test/developer',{headers:{host:'consumer.test'}}));
 assert.equal(denied.headers.get('location'),'https://consumer.test/developer/login');
});
test('all three consumer journeys use the registered return and independent signed modes',()=>{
 process.env.PAY_LAB_DEVELOPER_APP_CONFIG=JSON.stringify({...app,modes:['ecom','vt','pbl'],returnUrl:'https://consumer.test/developer'});
 const c=consumerConfiguration()!,input={submissionId:'ee827ff1-57a8-4c72-8813-ff35a0d3e9dd',reference:'STAFF-EXAMPLE',amount:'31.26',currency:'EUR'};
 for(const mode of ['ecom','vt','pbl'] as const){
  const r=paymentRequest(c.source,input,mode,mode==='ecom'?undefined:new Date().toISOString()).request;
  assert.equal(r.mode,mode);assert.equal(r.returnUrl,'https://consumer.test/developer');assert.equal(r.amountMinor,3126);
  assert.equal(r.operator?.id,mode==='ecom'?undefined:app.staffUser);
  if(mode!=='ecom')assert.throws(()=>paymentRequest(c.source,input,mode));
 }
 process.env.PAY_LAB_DEVELOPER_APP_CONFIG=JSON.stringify({...app,returnUrl:'https://other.test/return'});assert.throws(()=>consumerConfiguration());
});
