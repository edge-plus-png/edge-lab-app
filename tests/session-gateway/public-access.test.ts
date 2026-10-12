import {after} from "node:test";
import {database} from "../../lib/pay-lab/db";
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicEcomConfiguration,publicExampleIds,publicExampleCookie} from '../../lib/developer-ecom/public-access';
const secret='test-only-demo-cookie-key-over-32-characters';
const id='0371a708-e8c1-4686-ad0d-b107715ab446';
test('public demo retains only signed browser-owned example IDs',()=>{
 const cookie=publicExampleCookie('source-a',[id],secret);
 const headers=new Headers({cookie});
 assert.deepEqual(publicExampleIds(headers,'source-a',secret),[id]);
 assert.deepEqual(publicExampleIds(headers,'source-b',secret),[]);
 assert.deepEqual(publicExampleIds(headers,'source-a','different-key'),[]);
 assert.deepEqual(publicExampleIds(new Headers(),'source-a',secret),[]);
 const tampered=cookie.replace(/=./,'=X');
 assert.deepEqual(publicExampleIds(new Headers({cookie:tampered}),'source-a',secret),[]);
 assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);
});
test('passwordless ECOM is explicitly enabled only for the configured staging consumer host',()=>{
 Object.assign(process.env,{PAY_LAB_DEPLOYMENT_MODE:'canonical',PAY_LAB_ENVIRONMENT:'staging',VERCEL_ENV:'preview',PAY_LAB_PUBLIC_ECOM:'true',PAY_LAB_ECOM_TRY_SOURCE_ID:'source-a',PAY_LAB_PUBLIC_SESSION_URL:'https://api.example.test/api/session',PAY_LAB_DEVELOPER_REQUEST_SECRET:secret,PAY_LAB_DEVELOPER_RESULT_SECRET:secret,PAY_LAB_DEVELOPER_APP_CONFIG:JSON.stringify({origin:'https://demo.example.test',modes:['ecom'],currencies:['EUR'],sample:{reference:'TEST',amount:'2.00',currency:'EUR',sessionSeconds:600},staffUser:'operator',staffPasswordEnv:'DEMO_PASSWORD'})});
 const headers=new Headers({host:'demo.example.test'});
 assert.equal(publicEcomConfiguration(headers)?.source.id,'source-a');
 assert.equal(publicEcomConfiguration(new Headers({host:'api.example.test'})),null);
 process.env.VERCEL_ENV='production';assert.equal(publicEcomConfiguration(headers),null);
 process.env.VERCEL_ENV='preview';process.env.PAY_LAB_PUBLIC_ECOM='false';assert.equal(publicEcomConfiguration(headers),null);
});

test('public HTTP exposes no historical records and cannot authenticate MOTO or recover another browser payment',async()=>{
 process.env.PAY_LAB_PUBLIC_ECOM='true';process.env.DEMO_PASSWORD=secret;
 const {handlers}=await import('../../lib/developer-ecom/http');
 const {readFileSync}=await import('node:fs');
 const db=database();await db.query(readFileSync('scripts/developer-ecom.sql','utf8'));
 await db.query("INSERT INTO pay_lab_developer_ecom(source,id,input,request) VALUES($1,$2,'{}',$3) ON CONFLICT DO NOTHING",['source-a',id,{mode:'ecom',reference:'PRIVATE-FIXTURE'}]);
 const request=(path:string,cookie='')=>new Request('https://demo.example.test'+path,{headers:{host:'demo.example.test',cookie}});
 const empty=await handlers('ecom').GET(request('/api/developer/ecom'));
 assert.equal(empty.status,200);assert.deepEqual((await empty.json()).examples,[]);
 const own=await handlers('ecom').GET(request('/api/developer/ecom',publicExampleCookie('source-a',[id],secret)));
 assert.deepEqual((await own.json()).examples.map((e:{id:string})=>e.id),[id]);
 for(const mode of ['vt','pbl'] as const)assert.equal((await handlers(mode).GET(request('/api/developer/moto'))).status,401);
 const recover=await handlers('ecom').POST(new Request('https://demo.example.test/api/developer/ecom',{method:'POST',headers:{host:'demo.example.test',origin:'https://demo.example.test'},body:JSON.stringify({action:'recover',id})}));
 assert.equal(recover.status,403);
 const claim=await handlers('ecom').POST(new Request('https://demo.example.test/api/developer/ecom',{method:'POST',headers:{host:'demo.example.test',origin:'https://demo.example.test'},body:JSON.stringify({action:'create',input:{submissionId:id}})}));
 assert.equal(claim.status,403);assert.equal(claim.headers.get('set-cookie'),null);
});
test('public staging staff demos expose only owned records of the requested enabled mode',async()=>{
 process.env.PAY_LAB_PUBLIC_DEMO='true';process.env.PAY_LAB_CANONICAL_HOSTS=JSON.stringify(['demo.example.test']);
 const config=JSON.parse(process.env.PAY_LAB_DEVELOPER_APP_CONFIG!);config.modes=['ecom','vt','pbl'];process.env.PAY_LAB_DEVELOPER_APP_CONFIG=JSON.stringify(config);
 const {handlers}=await import('../../lib/developer-ecom/http');
 const headers={host:'demo.example.test',cookie:publicExampleCookie('source-a',[id],secret)};
 const {default:proxy}=await import('../../proxy');const {NextRequest}=await import('next/server');
 for(const path of ['/developer','/developer/moto','/developer/payment-links','/hosted-moto-example.mjs','/payment-link-example.mjs']){const response=proxy(new NextRequest('https://demo.example.test'+path,{headers}));assert.equal(response.headers.get('x-middleware-next'),'1');assert.equal(response.headers.get('location'),null);}
 for(const mode of ['vt','pbl'] as const){
  assert.ok(publicEcomConfiguration(new Headers(headers),mode));
  const response=await handlers(mode).GET(new Request('https://demo.example.test/api/developer/moto',{headers}));
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.config.publicDemo,true);assert.deepEqual(body.examples,[]);
  const recovery=await handlers(mode).POST(new Request('https://demo.example.test/api/developer/moto',{method:'POST',headers:{host:'demo.example.test',origin:'https://demo.example.test'},body:JSON.stringify({action:'recover',id})}));
  assert.equal(recovery.status,403);
 }
 process.env.VERCEL_ENV='production';assert.equal(publicEcomConfiguration(new Headers(headers),'vt'),null);process.env.VERCEL_ENV='preview';
 config.modes=['ecom'];process.env.PAY_LAB_DEVELOPER_APP_CONFIG=JSON.stringify(config);assert.equal(publicEcomConfiguration(new Headers(headers),'pbl'),null);
 delete process.env.PAY_LAB_PUBLIC_DEMO;
});
after(async()=>{await database().end()});
