import { consumerConfiguration } from '@/lib/developer-ecom/consumer-config';
import { LabError } from '@/lib/pay-lab/config';
import { sourceFor } from '@/lib/session-gateway/config';
import { receiveExample } from '@/lib/developer-ecom/service';
import { failure } from '@/lib/session-gateway/http';
import { readBounded } from '@/lib/pay-lab/transport';
export const runtime='nodejs';
export async function POST(req:Request){try{const c=consumerConfiguration(),id=req.headers.get('x-getedge-source')||'',host=req.headers.get('host')||'';if(c&&(id!==c.source.id||!c.source.hosts.includes(host)))throw new LabError('Unknown developer consumer.',401);const s=c?.source||sourceFor(id,host);return Response.json(await receiveExample(s,await readBounded(req),req.headers),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
