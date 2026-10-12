import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { database, transaction } from '../pay-lab/db';
import { LabError } from '../pay-lab/config';
import { canonical } from '../pay-lab/service';
import { requestSchema } from '../pay-lab/contract';
import { Source, connectionFor, key } from '../session-gateway/config';
import { call, verifyEvent } from '../../public/developer-client.mjs';

const form = z.object({ submissionId:z.uuid(), reference:z.string().trim().min(1).max(200), amount:z.string().regex(/^\d{1,7}(\.\d{1,2})?$/), currency:z.string().regex(/^[A-Z]{3}$/), customer:requestSchema.shape.customer }).strict();
import { consumerConfiguration } from './consumer-config';
export type DemoSource=Pick<Source,'id'|'requestSecretEnv'|'resultSecretEnv'> & Partial<Source>;
export type DemoMode='ecom'|'vt'|'pbl';
export function demoConfiguration(s:DemoSource,mode:DemoMode='ecom') {
  const consumer=consumerConfiguration();
  if(consumer){
    if(s.id!==consumer.source.id||!consumer.modes.includes(mode))throw new LabError('This product is not configured in the Developer Lab.',403);
    return {endpoint:consumer.endpoint,sourceId:s.id,returnUrl:consumer.returnUrl||`${consumer.origin}/developer`,currencies:consumer.currencies,sample:consumer.sample,modes:consumer.modes,operator:mode==='ecom'?null:{id:consumer.staffUser},seconds:consumer.sample.sessionSeconds};
  }
  return legacyConfiguration(s as Source,mode);
}
function legacyConfiguration(s:Source,mode:DemoMode){
  const c=connectionFor(s);
  if (!c.sample || !c.staffUser || !c.staffPasswordEnv) throw new LabError("Demo consumer configuration is unavailable.",503);
  const origin=new URL(s.callbackUrl).origin;
  const returnUrl=`${origin}/developer${mode==='vt'?'/moto':mode==='pbl'?'/payment-links':''}`;
  if(s.id!==process.env.PAY_LAB_ECOM_TRY_SOURCE_ID || !s.modes.includes(mode) || s.modes.some(m=>!['ecom','vt','pbl'].includes(m)) || s.presentations.length!==1 || s.presentations[0]!=='hosted' || !c.providerTestModeConfirmed || new URL(s.callbackUrl).pathname!=='/api/developer/callback' || !s.hosts.includes(new URL(origin).host) || !s.returnUrls.includes(returnUrl)) throw new LabError('GetEdge must provision a dedicated hosted developer lab connection before Try it is available.',409);
  const endpoint=process.env.PAY_LAB_PUBLIC_SESSION_URL||`${origin}/api/session`;
  const api=new URL(endpoint);if(api.protocol!=='https:'||api.pathname!=='/api/session'||api.search||api.hash||api.username||api.password||!s.hosts.includes(api.host))throw new LabError('Public Session API endpoint is not configured.',503);
  return { endpoint, sourceId:s.id, returnUrl, currencies:Object.keys(s.routes).filter(k=>s.routes[k][mode]), sample:c.sample, modes:s.modes.filter(m=>m==='ecom'||m==='vt'||m==='pbl'), operator:mode!=='ecom'?{id:c.staffUser}:null, seconds:Math.min(c.sample.sessionSeconds,s.maxSessionSeconds) };
}
function client(s:DemoSource,mode:DemoMode='ecom') {return {...demoConfiguration(s,mode),requestSecret:key(s.requestSecretEnv),resultSecret:key(s.resultSecretEnv)}}
export function paymentRequest(s:DemoSource,value:unknown,mode:DemoMode='ecom',authenticatedAt?:string) {
 const v=form.parse(value),c=demoConfiguration(s,mode),[whole,fraction='']=v.amount.split('.');
 const amountMinor=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(amountMinor)||amountMinor<1||amountMinor>999999999||!c.currencies.includes(v.currency)) throw new LabError('Enter an amount and currency enabled for this test connection.');
 if(mode!=='ecom'&&(!authenticatedAt||!Number.isFinite(Date.parse(authenticatedAt))||Math.abs(Date.now()-Date.parse(authenticatedAt))>300000))throw new LabError('Authenticate the test operator again before creating a staff payment request.',403);
 return {submissionId:v.submissionId,input:v,request:{requestKey:randomUUID(),obligationId:randomUUID(),reference:v.reference,amountMinor,currency:v.currency,...(mode==='pbl'&&v.customer?{customer:v.customer}:{}),mode,presentation:'hosted',...(mode!=='ecom'?{operator:{id:c.operator!.id,authenticatedAt:authenticatedAt!}}:{}),expiresAt:new Date(Date.now()+c.seconds*1000).toISOString(),returnUrl:c.returnUrl}};
}
export async function createExample(s:DemoSource,value:unknown,mode:DemoMode='ecom',authenticatedAt?:string) {
 const p=paymentRequest(s,value,mode,authenticatedAt);
 const saved=await transaction(async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`developer-ecom:${s.id}`]);
  const old=(await db.query('SELECT * FROM pay_lab_developer_ecom WHERE source=$1 AND id=$2',[s.id,p.submissionId])).rows[0];
  if(old){if(old.request.mode!==mode)throw new LabError('This example belongs to another payment journey.',409);if(canonical(old.input)!==canonical(p.input))throw new LabError('This attempt already belongs to different details. Start a new example.',409);return old;}
  const count=(await db.query("SELECT count(*)::int AS n FROM pay_lab_developer_ecom WHERE source=$1 AND created_at>now()-interval '1 hour'",[s.id])).rows[0].n;
  if(count>=10)throw new LabError('Test creation limit reached. Recover an existing payment or try later.',429);
  return (await db.query('INSERT INTO pay_lab_developer_ecom(source,id,input,request) VALUES($1,$2,$3,$4) RETURNING *',[s.id,p.submissionId,p.input,p.request])).rows[0];
 });
 if(saved.response)return saved;
 // Deliberately go through the public HTTP contract, never an internal service shortcut.
 const response=await call(client(s,mode),'session.create',saved.request);
 validateResponse(saved.request,response);
 return saveResponse(s,saved.id,response);
}
async function saveResponse(s:DemoSource,id:string,response:Record<string,unknown>){
 return transaction(async db=>{
  const row=(await db.query('SELECT * FROM pay_lab_developer_ecom WHERE source=$1 AND id=$2 FOR UPDATE',[s.id,id])).rows[0];
  if(row.event && row.event.requestId!==response.requestId)throw new LabError('Response and callback identities differ.',409);
  if(row.response)return row;
  return (await db.query('UPDATE pay_lab_developer_ecom SET response=$3,responded_at=now() WHERE source=$1 AND id=$2 RETURNING *',[s.id,id,response])).rows[0];
 });
}
function validateResponse(r:Record<string,unknown>,v:Record<string,unknown>) {
 for(const k of ['requestKey','obligationId','reference','amountMinor','currency','mode','presentation'])if(r[k]!==v[k])throw new LabError('The signed response does not match this request.',502);
 if(typeof v.requestId!=='string')throw new LabError('The signed response has no payment identity.',502);
}
export async function listExamples(s:DemoSource,mode:DemoMode='ecom') {
 demoConfiguration(s,mode);
 return (await database().query("SELECT * FROM pay_lab_developer_ecom WHERE source=$1 AND request->>'mode'=$2 ORDER BY created_at DESC LIMIT 30",[s.id,mode])).rows;
}
export async function recoverExample(s:DemoSource,id:string,mode:DemoMode='ecom') {
 const saved=(await database().query('SELECT * FROM pay_lab_developer_ecom WHERE source=$1 AND id=$2',[s.id,z.uuid().parse(id)])).rows[0];
 if(!saved||saved.request.mode!==mode)throw new LabError('Test request not found.',404);
 let response;
 try{response=await call(client(s,mode),'session.status',{requestKey:saved.request.requestKey});}catch(error){if((error as {status?:number}).status!==404)throw error;response=await call(client(s,mode),'session.create',saved.request);validateResponse(saved.request,response);await saveResponse(s,id,response);}
 validateResponse(saved.request,response);
 await database().query('UPDATE pay_lab_developer_ecom SET recovered_response=$3,recovered_at=now() WHERE source=$1 AND id=$2',[s.id,id,response]);
 return listExamples(s,mode);
}
export async function receiveExample(s:DemoSource,raw:string,headers:Headers) {

 // Read untrusted identity only to locate the saved request; no mutation until verification.
 const id=z.string().parse(JSON.parse(raw).requestKey);
 return transaction(async db=>{
  const saved=(await db.query('SELECT * FROM pay_lab_developer_ecom WHERE source=$1 AND request->>\'requestKey\'=$2 FOR UPDATE',[s.id,id])).rows[0];
  if(!saved)throw new LabError('Unknown test request.',404);
  const config=client(s,saved.request.mode);
  const event=verifyEvent(raw,headers,config,saved.request);
  const prior=saved.event;
  const binding=saved.response || saved.recovered_response;
  if(binding?.requestId && binding.requestId!==event.requestId)throw new LabError('Callback request identity mismatch.',409);
  for(const k of ['sessionId','saleId'])if((prior?.payment?.[k]||binding?.payment?.[k]) && (prior?.payment?.[k]||binding?.payment?.[k])!==event.payment[k])throw new LabError('Callback payment identity mismatch.',409);
  const hash=createHash('sha256').update(raw).digest('hex');
  const old=(await db.query('SELECT body_hash FROM pay_lab_developer_receipts WHERE source=$1 AND event_id=$2',[s.id,event.eventId])).rows[0];
  if(old){if(old.body_hash!==hash)throw new LabError('Conflicting event identity.',409);return {eventId:event.eventId,accepted:true};}
  if(prior && prior.payment.revision===event.payment.revision && canonical(prior.payment)!==canonical(event.payment))throw new LabError('Conflicting payment revision.',409);
  await db.query('INSERT INTO pay_lab_developer_receipts(source,event_id,example_id,body_hash,body,headers) VALUES($1,$2,$3,$4,$5,$6)',[s.id,event.eventId,saved.id,hash,raw,Object.fromEntries([...headers.entries()].filter(([k])=>k.startsWith('x-getedge-')))]);
  if(!prior || event.payment.revision>prior.payment.revision){
   if(prior?.payment.state==='approved'&&event.payment.state!=='approved')throw new LabError('Approved payment cannot regress.',409);
   await db.query('UPDATE pay_lab_developer_ecom SET event=$3,received_at=now() WHERE source=$1 AND id=$2',[s.id,saved.id,event]);
  }
  return {eventId:event.eventId,accepted:true};
 });
}
