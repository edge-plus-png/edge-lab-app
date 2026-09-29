import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
process.env.NMI_ANYTIME_TOKENIZATION_KEY = 'fixture-public-tokenization-key';
// Import after fixture environment setup; legacy CLIENTS captures env at module load.
let route: typeof import('../../app/api/session/route');
before(async () => { route = await import('../../app/api/session/route'); });
test('legacy Anytime session still returns its hosted payUrl and original shape', async () => {
    const req = new NextRequest('https://anytime.edge-lab.uk/api/session', { method: 'POST', headers: { host: 'anytime.edge-lab.uk', 'content-type': 'application/json' }, body: JSON.stringify({ amount: 10, currency: 'GBP', reference: 'legacy-fixture', customer: { firstName: 'Provided', lastName: 'Customer', email: 'fixture@example.test', postalCode: 'SW1A 2AA' } }) });
    const response = await route.POST(req), body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body).sort(), ['payUrl', 'sessionId']);
    assert.ok(body.payUrl.startsWith('https://anytime.edge-lab.uk/pay/'));
});
test('new contract without authentication or with unknown version never falls back to legacy', async () => {
    for (const headers of ([{}, { 'x-getedge-version': '3' }] as Record<string, string>[])) {
        const response = await route.POST(new NextRequest('https://app.edge-lab.uk/api/session', { method: 'POST', headers: { host: 'app.edge-lab.uk', 'content-type': 'application/json', ...headers }, body: JSON.stringify({ mode: 'ecom', amountMinor: 1000 }) }));
        assert.ok([400, 401].includes(response.status));
        assert.equal((await response.json()).payUrl, undefined);
    }
});
test('versioned GET cannot read legacy session data', async () => {
    const response = await route.GET(new NextRequest('https://app.edge-lab.uk/api/session?sessionId=anything', { headers: { 'x-getedge-version': '2' } }));
    assert.equal(response.status, 405);
});
