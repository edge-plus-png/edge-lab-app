// Node 20+. Download beside developer-client.mjs. Keep credentials server-side.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { call, signature, verify } from './developer-client.mjs';
const required = name => { const value=process.env[name]; if(!value)throw Error(`Set ${name}`);return value; };
const config={endpoint:required('GETEDGE_SESSION_URL'),sourceId:required('GETEDGE_SOURCE_ID'),requestSecret:required('GETEDGE_REQUEST_SECRET'),resultSecret:required('GETEDGE_RESULT_SECRET')};
const path=process.env.GETEDGE_REQUEST_FILE || 'getedge-moto-request.json';
let request;
if(fs.existsSync(path))request=JSON.parse(fs.readFileSync(path,'utf8'));
else {
 const amount=required('GETEDGE_AMOUNT');if(!/^\d+(\.\d{1,2})?$/.test(amount))throw Error('Use a two-decimal amount');
 const [whole,part='']=amount.split('.'); const amountMinor=Number(whole)*100+Number(part.padEnd(2,'0'));
 const lifetime=Number(required('GETEDGE_SESSION_SECONDS'));if(!Number.isInteger(lifetime)||lifetime<1)throw Error('Use the lifetime supplied by GetEdge');
 const authenticatedAt=required('GETEDGE_OPERATOR_AUTHENTICATED_AT');
 if(!Number.isFinite(Date.parse(authenticatedAt))||Math.abs(Date.now()-Date.parse(authenticatedAt))>300000)throw Error('Use the timestamp from actual staff authentication within five minutes; authenticate again if stale.');
 const customer=process.env.GETEDGE_CUSTOMER_FILE?JSON.parse(fs.readFileSync(process.env.GETEDGE_CUSTOMER_FILE,'utf8')):undefined;
 if(customer&&(typeof customer!=='object'||Array.isArray(customer)))throw Error('Customer file must contain a customer JSON object');
 request={...(customer?{customer}:{}),...(process.env.GETEDGE_DESCRIPTION?{description:process.env.GETEDGE_DESCRIPTION}:{}),operator:{id:required('GETEDGE_OPERATOR_ID'),authenticatedAt},requestKey:randomUUID(),obligationId:randomUUID(),reference:required('GETEDGE_REFERENCE'),amountMinor,currency:required('GETEDGE_CURRENCY'),mode:'vt',presentation:'hosted',expiresAt:new Date(Date.now()+lifetime*1000).toISOString(),returnUrl:required('GETEDGE_RETURN_URL')};
 fs.writeFileSync(path,JSON.stringify(request),{flag:'wx',mode:0o600});
}
if(request.mode!=='vt'||request.presentation!=='hosted'||!request.operator)throw Error('Use a separate saved request file for Hosted MOTO.');
const operation=process.argv[2]==='status'?'session.status':'session.create';
const body=operation==='session.status'?{requestKey:request.requestKey}:request;
if(process.argv[2]==='prepare-curl') {
 const raw=JSON.stringify(request),timestamp=String(Math.floor(Date.now()/1000));
 fs.writeFileSync('getedge-curl-body.json',raw,{mode:0o600});
 fs.writeFileSync('getedge-curl-headers.txt',`Content-Type: application/json\nx-getedge-version: 2\nx-getedge-source: ${config.sourceId}\nx-getedge-timestamp: ${timestamp}\nx-getedge-signature: ${signature(config.requestSecret,timestamp,'session.create',config.sourceId,raw)}\n`,{mode:0o600});
 console.log('Prepared signed request. Run cURL within five minutes.');
} else if(process.argv[2]==='verify-curl') {
 const lines=fs.readFileSync('getedge-response-headers.txt','utf8').trim().split(/\r?\n/);const headers=new Headers();
 for(const line of lines){const i=line.indexOf(':');if(i>0)headers.set(line.slice(0,i),line.slice(i+1).trim());}
 console.log(JSON.stringify(verify(fs.readFileSync('getedge-response.json','utf8'),headers,'session.create.response',config),null,2));
} else console.log(JSON.stringify(await call(config,operation,body),null,2));
// Re-run with the same request file to recover; use a new file for a new obligation.
