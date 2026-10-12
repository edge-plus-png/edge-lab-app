import { canonicalDeployment } from '../lib/session-gateway/deployment';
import { sources, connectionFor, key } from '../lib/session-gateway/config';
async function main() {
  if (!canonicalDeployment() || process.env.PAY_LAB_ENVIRONMENT !== 'staging' || process.env.VERCEL_ENV === 'production') throw Error('Canonical staging deployment profile required');
  const hosts = JSON.parse(process.env.PAY_LAB_CANONICAL_HOSTS || '[]');
  if (!Array.isArray(hosts) || !hosts.length) throw Error('Register exact canonical hosts');
  if (!process.env.PAY_LAB_DATABASE_URL) throw Error('Install the isolated Lab database connection');
  key('PAY_LAB_WORKER_SECRET'); key('PAY_LAB_SUPPORT_SECRET');
  const enabled = sources().filter(s => s.enabled); if (!enabled.length) throw Error('No enabled source');
  for (const source of enabled) {
    if (!source.hosts.every(h => hosts.includes(h))) throw Error('Source host outside canonical deployment');
    if (source.requestSecretEnv === source.resultSecretEnv || key(source.requestSecretEnv) === key(source.resultSecretEnv)) throw Error('Use distinct request and result credentials');
    const c = connectionFor(source); key(c.signingSecretEnv);
    const callback = new URL(c.callbackUrl);
    if (!hosts.includes(callback.host) || callback.pathname !== '/api/session/callback' || callback.search) throw Error('Prime callback must target this canonical Lab');
    if (!c.providerTestModeConfirmed) throw Error('Provider test mode must be verified before enabling');
    if (!source.returnUrls.every(u => c.returnUrls.includes(u))) throw Error('Return destinations must agree between source and Prime connection configuration');
  }
  console.log(JSON.stringify({ configuredSources: enabled.length, deployment: 'canonical-staging', providerAcceptance: 'NOT established by this configuration check' }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Configuration invalid'); process.exitCode = 1; });
