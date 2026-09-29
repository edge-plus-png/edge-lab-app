// Server-side example. Never bundle signing secrets into browser code.
import {createHmac,timingSafeEqual} from 'node:crypto';
export function signature(secret,timestamp,operation,source,raw){
 return createHmac('sha256',secret).update(`2\n${timestamp}\n${operation}\n${source}\n${raw}`).digest('hex');
}
export function verifyResult({secret,source,operation,raw,headers}){
 const time=headers.get('x-getedge-timestamp')||'',sig=headers.get('x-getedge-signature')||'';
 if(headers.get('x-getedge-version')!=='2'||headers.get('x-getedge-source')!==source||!/^\d{10}$/.test(time)||Math.abs(Date.now()/1000-Number(time))>300||!/^[a-f0-9]{64}$/.test(sig)||!timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(signature(secret,time,operation,source,raw),'hex')))throw Error('Invalid GetEdge Pay lab signature');
 return JSON.parse(raw);
}
export async function requestSession({endpoint,source,requestSecret,resultSecret,body,status=false}){
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Use the registered HTTPS endpoint');
 if(status)url.pathname=url.pathname.replace(/\/$/,'')+'/status';
 const operation=status?'session.status':'session.create',raw=JSON.stringify(body),timestamp=String(Math.floor(Date.now()/1000));
 const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json','x-getedge-version':'2','x-getedge-source':source,'x-getedge-timestamp':timestamp,'x-getedge-signature':signature(requestSecret,timestamp,operation,source,raw)},body:raw});
 const text=await response.text();
 if(!response.ok)throw Error(`Lab returned HTTP ${response.status}; recover with the same request key`);
 return verifyResult({secret:resultSecret,source,operation:`${operation}.response`,raw:text,headers:response.headers});
}
// Callback receivers use verifyResult with operation "result" and exact raw bytes.
// Verify expected request/reference/money and monotonic revision before applying once.
// Commit that application durably before replying {eventId: event.eventId, accepted:true}.
