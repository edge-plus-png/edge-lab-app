import { publicEcomConfiguration, publicExampleIds, publicExampleCookie } from './public-access';
import { database } from '../pay-lab/db';
import { LabError } from '../pay-lab/config';
import { z } from 'zod';
import { developerSource,developerChallenge } from '../session-gateway/developer';
import { consumerConfiguration } from './consumer-config';
import { demoConfiguration,listExamples,createExample,recoverExample,DemoMode } from './service';
import { sameOrigin } from '../pay-lab/config';
import { failure } from '../session-gateway/http';
import { readBounded } from '../pay-lab/transport';
export function handlers(mode:DemoMode){
 function access(headers:Headers){const c=consumerConfiguration();return c?developerSource(headers,[{source:c.source,staffUser:c.staffUser,staffPasswordEnv:c.staffPasswordEnv}]):developerSource(headers);}
 async function publicResponse(req:Request, ids?:string[]){
  const c=publicEcomConfiguration(req.headers)!;
  const secret=process.env[c.staffPasswordEnv];if(!secret || secret.length<32)throw new LabError('Demo access is not configured.',503);
  const owned=ids ?? publicExampleIds(req.headers,c.source.id,secret);
  const examples=owned.length ? (await database().query("SELECT * FROM pay_lab_developer_ecom WHERE source=$1 AND id=ANY($2::uuid[]) AND request->>'mode'='ecom' ORDER BY created_at DESC",[c.source.id,owned])).rows : [];
  return Response.json({config:demoConfiguration(c.source,'ecom'),examples},{headers:{'Cache-Control':'no-store',...(ids?{'Set-Cookie':publicExampleCookie(c.source.id,ids,secret)}:{})}});
 }
 async function GET(req:Request){try{if(mode==='ecom'&&publicEcomConfiguration(req.headers))return await publicResponse(req);const s=access(req.headers);if(!s)return developerChallenge();return Response.json({config:demoConfiguration(s,mode),examples:await listExamples(s,mode)},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
 async function POST(req:Request){try{
  const publicConfig=mode==='ecom'?publicEcomConfiguration(req.headers):null;
  if(publicConfig){
   sameOrigin(req);
   const secret=process.env[publicConfig.staffPasswordEnv];if(!secret||secret.length<32)throw new LabError('Demo access is not configured.',503);
   const ids=publicExampleIds(req.headers,publicConfig.source.id,secret),body=JSON.parse(await readBounded(req));
   const id=z.uuid().parse(body.action==='create'?body.input?.submissionId:body.id);
   if(!ids.includes(id)){
    if(body.action!=='create')throw new LabError('This test belongs to another browser session.',403);
    const existing=await database().query('SELECT id FROM pay_lab_developer_ecom WHERE source=$1 AND id=$2',[publicConfig.source.id,id]);
    if(existing.rows.length)throw new LabError('Start a new example in this browser.',403);
    ids.push(id);
   }
   // Grant only this new random example ID, including when the provider call
   // fails, so the same browser can recover its persisted request safely.
   try{
    if(body.action==='create')await createExample(publicConfig.source,body.input,'ecom');
    else if(body.action==='recover')await recoverExample(publicConfig.source,id,'ecom');
    else throw new LabError('Unknown action',400);
    return await publicResponse(req,ids);
   }catch(e){const response=failure(e);response.headers.set('Set-Cookie',publicExampleCookie(publicConfig.source.id,ids,secret));return response;}
  }
  const s=access(req.headers);if(!s)return developerChallenge();sameOrigin(req);
  const body=JSON.parse(await readBounded(req));
  if(body.action==='recover')await recoverExample(s,body.id,mode);
  else if(body.action==='create'){
   // access() has authenticated this request against the signed Lab session (or
   // supplied Basic credentials). Reuse that server-side authentication; never
   // trust a browser-supplied operator or authentication timestamp.
   const authenticatedAt=mode==='ecom'?undefined:new Date().toISOString();
   await createExample(s,body.input,mode,authenticatedAt);
  }else return Response.json({error:'Unknown action'},{status:400});
  return GET(req);
 }catch(e){return failure(e)}}
 return {GET,POST};
}
