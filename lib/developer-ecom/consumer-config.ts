import { z } from 'zod';
import { LabError } from '../pay-lab/config';
const https=z.url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash});
const schema=z.object({origin:https,returnUrl:https.optional(),modes:z.array(z.enum(['ecom','vt','pbl'])).min(1),currencies:z.array(z.string().regex(/^[A-Z]{3}$/)).min(1),sample:z.object({reference:z.string().min(1),amount:z.string().regex(/^\d+\.\d{2}$/),currency:z.string(),sessionSeconds:z.number().int().min(60).max(2592000)}),staffUser:z.string().min(1),staffPasswordEnv:z.string().regex(/^[A-Z][A-Z0-9_]+$/)}).strict();
export function consumerConfiguration(){
 const raw=process.env.PAY_LAB_DEVELOPER_APP_CONFIG;if(!raw)return null;
 const c=schema.parse(JSON.parse(raw)),sourceId=process.env.PAY_LAB_ECOM_TRY_SOURCE_ID||'',endpoint=process.env.PAY_LAB_PUBLIC_SESSION_URL||'';
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(sourceId))throw new LabError('Developer Lab Source ID is not installed.',503);
 for(const name of ['PAY_LAB_DEVELOPER_REQUEST_SECRET','PAY_LAB_DEVELOPER_RESULT_SECRET'])if((process.env[name]||'').length<32)throw new LabError('Developer Lab signing credentials are not installed.',503);
 const api=new URL(endpoint),origin=new URL(c.origin);
 if(api.protocol!=='https:'||api.pathname!=='/api/session'||api.search||api.hash||api.username||api.password||origin.origin!==c.origin||(c.returnUrl&&new URL(c.returnUrl).origin!==origin.origin)||!c.currencies.includes(c.sample.currency))throw new LabError('Developer Lab application configuration is invalid.',503);
 return {...c,endpoint,source:{id:sourceId,enabled:true,hosts:[origin.host],requestSecretEnv:'PAY_LAB_DEVELOPER_REQUEST_SECRET',resultSecretEnv:'PAY_LAB_DEVELOPER_RESULT_SECRET'}};
}
