import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { runtimeConfiguration } from '../pay-lab/runtime-config';
import { configSchema, LabError } from '../pay-lab/config';
import { readBounded } from '../pay-lab/transport';
import { sourceSchema, sources, connectionFor } from './config';
const responseSchema=z.object({nonce:z.string(),source:sourceSchema,connection:configSchema,secrets:z.record(z.string().regex(/^[A-Z][A-Z0-9_]+$/),z.string().min(32))}).strict();
export type RegistryLookup={sourceId:string}|{integrationId:string};
export async function withRegistry<T>(lookup:RegistryLookup,run:()=>Promise<T>):Promise<T>{
 if(('sourceId' in lookup?lookup.sourceId:lookup.integrationId).length===0)return run();
 const existing=sources().some(s=>'sourceId' in lookup?s.id===lookup.sourceId:connectionFor(s).integrationId===lookup.integrationId);
 if(existing)return run();
 const origin=process.env.PAY_LAB_REGISTRY_ORIGIN,key=process.env.PAY_LAB_REGISTRY_SECRET;
 if(!origin&&!key)return run();
 if(!origin||new URL(origin).origin!==origin||!origin.startsWith('https://')||!key||key.length<32||process.env.PAY_LAB_ENVIRONMENT!=='staging'||process.env.VERCEL_ENV==='production')throw new LabError('Connection registry is unavailable.',503);
 const nonce=randomUUID(),raw=JSON.stringify({...lookup,nonce}),timestamp=String(Math.floor(Date.now()/1000));
 const sign=(time:string,body:string)=>createHmac('sha256',key).update(`registry-v1\n${time}\n${body}`).digest('hex');
 const result=await fetch(`${origin}/api/pay/lab-registry`,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','x-getedge-registry-time':timestamp,'x-getedge-registry-signature':sign(timestamp,raw)},body:raw});
 if(result.status===404)throw new LabError('Unknown or disabled source connection.',401);
 if(!result.ok)throw new LabError('Connection registry is unavailable.',503);
 const body=await readBounded(result),stamp=result.headers.get('x-getedge-registry-time')||'',signature=result.headers.get('x-getedge-registry-signature')||'';
 if(!/^\d{10}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>300||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(stamp,body))))throw new LabError('Connection registry authentication failed.',503);
 const v=responseSchema.parse(JSON.parse(body));
 if(v.nonce!==nonce||v.connection.origin!==origin||v.source.connectionId!==v.connection.id||('sourceId' in lookup?v.source.id!==lookup.sourceId:v.connection.integrationId!==lookup.integrationId))throw new LabError('Connection registry scope mismatch.',503);
 const keys=[v.source.requestSecretEnv,v.source.resultSecretEnv,v.connection.signingSecretEnv];
 if(new Set(keys).size!==3||keys.some(k=>!v.secrets[k])||new Set(keys.map(k=>v.secrets[k])).size!==3)throw new LabError('Connection credentials are not independent.',503);
 return runtimeConfiguration.run({sources:[v.source],connections:[v.connection],secrets:v.secrets},run);
}
