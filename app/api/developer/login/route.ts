import { consumerConfiguration } from '@/lib/developer-ecom/consumer-config';
import { developerSource,loginCookie } from '@/lib/session-gateway/developer';
import { sameOrigin } from '@/lib/pay-lab/config';
import { readBounded } from '@/lib/pay-lab/transport';
import { z } from 'zod';
export async function POST(req:Request){try{
 sameOrigin(req);
 const value=z.object({username:z.string().min(1).max(120),password:z.string().min(1).max(256)}).strict().parse(JSON.parse(await readBounded(req)));
 const headers=new Headers(req.headers);headers.set('authorization','Basic '+Buffer.from(`${value.username}:${value.password}`).toString('base64'));
 const c=consumerConfiguration();
 const source=c?developerSource(headers,[{source:c.source,staffUser:c.staffUser,staffPasswordEnv:c.staffPasswordEnv}]):developerSource(headers);if(!source)return Response.json({error:'Check the Lab credentials supplied by GetEdge.'},{status:401});
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`__Host-getedge-lab=${loginCookie(source,c?.staffPasswordEnv)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400`}});
}catch{return Response.json({error:'Unable to sign in.'},{status:400})}}
