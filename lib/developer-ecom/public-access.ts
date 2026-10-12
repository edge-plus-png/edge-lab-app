import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalDeployment } from '../session-gateway/deployment';
import { consumerConfiguration } from './consumer-config';

const cookieName = '__Host-getedge-demo';
const lifetime = 4 * 60 * 60 * 1000;
// Public access is confined to the explicitly configured staging test consumer.
// The configured Lab service operator represents test requests, not a signed-in person.
// This does not open the source-wide evidence API.
export function publicEcomConfiguration(headers: Headers, mode: 'ecom'|'vt'|'pbl' = 'ecom') {
 if (!canonicalDeployment() || process.env.PAY_LAB_ENVIRONMENT !== 'staging' || process.env.VERCEL_ENV === 'production' || !(process.env.PAY_LAB_PUBLIC_DEMO === 'true' || (mode === 'ecom' && process.env.PAY_LAB_PUBLIC_ECOM === 'true'))) return null;
 const c = consumerConfiguration();
 return c && c.modes.includes(mode) && c.source.hosts.includes((headers.get('host') || '').toLowerCase()) ? c : null;
}
function mac(data: string, secret: string) { return createHmac('sha256', secret).update(`public-ecom:${data}`).digest('hex'); }
export function publicExampleIds(headers: Headers, source: string, secret: string): string[] {
 try {
  const token = (headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!token) return [];
  const [data, signature] = token.split('.');
  if (!data || !/^[a-f0-9]{64}$/.test(signature || '') || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(mac(data, secret), 'hex'))) return [];
  const claim = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  if (claim.source !== source || !Number.isSafeInteger(claim.expires) || claim.expires <= Date.now() || claim.expires > Date.now() + lifetime || !Array.isArray(claim.ids) || claim.ids.some((id:unknown) => typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))) return [];
  return claim.ids;
 } catch { return []; }
}
export function publicExampleCookie(source: string, ids: string[], secret: string) {
 const data = Buffer.from(JSON.stringify({source, ids: ids.slice(-30), expires: Date.now() + lifetime})).toString('base64url');
 return `${cookieName}=${data}.${mac(data,secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${lifetime / 1000}`;
}
