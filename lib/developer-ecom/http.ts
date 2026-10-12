import { developerSource,developerChallenge } from '../session-gateway/developer';
import { consumerConfiguration } from './consumer-config';
import { demoConfiguration,listExamples,createExample,recoverExample,DemoMode } from './service';
import { sameOrigin } from '../pay-lab/config';
import { failure } from '../session-gateway/http';
import { readBounded } from '../pay-lab/transport';
export function handlers(mode:DemoMode){
 function access(headers:Headers){const c=consumerConfiguration();return c?developerSource(headers,[{source:c.source,staffUser:c.staffUser,staffPasswordEnv:c.staffPasswordEnv}]):developerSource(headers);}
 async function GET(req:Request){try{const s=access(req.headers);if(!s)return developerChallenge();return Response.json({config:demoConfiguration(s,mode),examples:await listExamples(s,mode)},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
 async function POST(req:Request){try{
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
