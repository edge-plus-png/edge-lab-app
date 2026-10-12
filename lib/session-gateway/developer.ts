import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { database } from "../pay-lab/db";
import { Source, connectionFor, sources } from "./config";
import { canonicalDeployment } from "./deployment";

export type DeveloperIdentity={id:string;enabled:boolean;hosts:string[]};
type Access<T extends DeveloperIdentity>={source:T;staffUser?:string;staffPasswordEnv?:string};
function accessEntries(){return sources().map(source=>({source,...connectionFor(source)}));}
// Separate, read-only developer access; never reuse a payment signing credential.
export function developerSource<T extends DeveloperIdentity = Source>(headers: Headers, access?: Access<T>[]): T | null {
  const entries=access ?? accessEntries() as unknown as Access<T>[];
  if (!canonicalDeployment() || process.env.PAY_LAB_ENVIRONMENT !== "staging" || process.env.VERCEL_ENV === "production") return null;
  const value = headers.get("authorization") || "";
  if (!value.startsWith("Basic ")) return cookieSource(headers,entries);
  const pair = Buffer.from(value.slice(6), "base64").toString("utf8");
  const separator = pair.indexOf(":");
  if (separator < 1) return null;
  const username = pair.slice(0, separator), password = pair.slice(separator + 1);
  const digest = (s: string) => createHash("sha256").update(s).digest();
  const host = (headers.get("host") || "").toLowerCase();
  const matches: T[] = [];
  for (const config of entries.filter(e => e.source.enabled && e.source.hosts.includes(host))) {
    const source=config.source, expected = config.staffPasswordEnv ? process.env[config.staffPasswordEnv] : undefined;
    if (expected && expected.length >= 32 && timingSafeEqual(digest(username), digest(config.staffUser || "")) && timingSafeEqual(digest(password), digest(expected))) matches.push(source);
  }
  return matches.length === 1 ? matches[0] : null;
}
export function developerChallenge() {
  return new Response("Developer access required.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="GetEdge Pay staging developer lab", charset="UTF-8"', "Cache-Control": "no-store" } });
}
export async function developerEvidence(source: Source, requestId?: string) {
  const c = connectionFor(source);
  const list = await database().query(`SELECT r.booking_id AS "requestId",r.request_key AS "requestKey",r.obligation_id AS "obligationId",r.request,
    b.snapshot,b.created_at AS "createdAt" FROM pay_lab_external_requests r JOIN pay_lab_bookings b ON b.connection=r.connection AND b.id=r.booking_id
    WHERE r.source=$1 AND r.connection=$2 AND ($3::text IS NULL OR r.booking_id::text=$3) ORDER BY b.created_at DESC LIMIT 100`, [source.id, source.connectionId, requestId || null]);
  const deliveries = requestId ? await database().query(`SELECT event_id AS "eventId",revision,body,attempts,delivered_at AS "deliveredAt",exhausted_at AS "exhaustedAt",last_error AS "lastError"
    FROM pay_lab_source_outbox WHERE source=$1 AND connection=$2 AND booking_id::text=$3 ORDER BY revision`, [source.id,source.connectionId,requestId]) : { rows: [] };
  return { source: { id: source.id, name: c.name, modes: source.modes, presentations: source.presentations, callbackUrl:source.callbackUrl, maxSessionSeconds:source.maxSessionSeconds }, requests:list.rows, events:deliveries.rows.map(r => ({...r,body:JSON.parse(r.body)})) };
}

export function loginCookie(source: DeveloperIdentity, passwordEnv?: string) {
 const expires=Date.now()+4*60*60*1000;
 const data=Buffer.from(JSON.stringify({source:source.id,expires})).toString('base64url');
 const secret=process.env[passwordEnv || connectionFor(source as Source).staffPasswordEnv || ""];
 if(!secret||secret.length<32)throw Error('Lab login not configured');
 return `${data}.${createHmac('sha256',secret).update(`developer-login:${data}`).digest('hex')}`;
}
function cookieSource<T extends DeveloperIdentity>(headers:Headers,entries:Access<T>[]): T|null {
 try {
  const token=(headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-getedge-lab='))?.slice('__Host-getedge-lab='.length);
  if(!token)return null;
  const [data,sig]=token.split('.');if(!data||!/^[a-f0-9]{64}$/.test(sig||''))return null;
  const claim=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
  if(!Number.isSafeInteger(claim.expires)||claim.expires<=Date.now()||claim.expires>Date.now()+4*60*60*1000)return null;
  const entry=entries.find(e=>e.source.enabled&&e.source.id===claim.source&&e.source.hosts.includes((headers.get('host')||'').toLowerCase()));if(!entry)return null;
  const s=entry.source,secret=process.env[entry.staffPasswordEnv || ""];if(!secret||secret.length<32)return null;
  const expected=createHmac('sha256',secret).update(`developer-login:${data}`).digest('hex');
  return timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(expected,'hex'))?s:null;
 }catch{return null;}
}
