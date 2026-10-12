import { createHmac, timingSafeEqual } from 'node:crypto';

export function signature(secret, timestamp, operation, sourceId, raw) {
  return createHmac('sha256', secret).update(`2\n${timestamp}\n${operation}\n${sourceId}\n${raw}`).digest('hex');
}
export function verify(raw, headers, operation, config, now = Date.now()) {
  const timestamp = headers.get('x-getedge-timestamp') || '';
  const supplied = headers.get('x-getedge-signature') || '';
  if (headers.get('x-getedge-version') !== '2' || headers.get('x-getedge-source') !== config.sourceId ||
      !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/.test(supplied)) throw Error('Untrusted GetEdge response');
  const expected = signature(config.resultSecret, timestamp, operation, config.sourceId, raw);
  if (!timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))) throw Error('Invalid GetEdge signature');
  return JSON.parse(raw);
}
export async function readBounded(message) {
  const reader = message.body?.getReader(); if (!reader) return '';
  const parts = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > 524288) { await reader.cancel(); throw Error('Message too large'); } parts.push(value); }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts));
}
export async function call(config, operation, body) {
  if (!['session.create', 'session.status'].includes(operation)) throw Error('Unsupported operation');
  const url = new URL(config.endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/api/session')) throw Error('Use the assigned HTTPS session endpoint');
  if (operation === 'session.status') url.pathname += '/status';
  // Store this exact request and its identity durably BEFORE calling create.
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
    'content-type': 'application/json', 'x-getedge-version': '2', 'x-getedge-source': config.sourceId,
    'x-getedge-timestamp': timestamp, 'x-getedge-signature': signature(config.requestSecret, timestamp, operation, config.sourceId, raw),
  }, body: raw });
  const text = await readBounded(response);
  if (!response.ok) { const error = new Error(`GetEdge returned HTTP ${response.status}; recover the saved request`); error.status = response.status; throw error; }
  return verify(text, response.headers, `${operation}.response`, config);
}
export function verifyEvent(raw, headers, config, savedRequest) {
  const event = verify(raw, headers, 'result', config);
  if (event.type !== 'payment.updated' || typeof event.eventId !== 'string' || !event.eventId || headers.get('x-getedge-event-id') !== event.eventId || typeof event.requestId !== 'string' || !event.requestId) throw Error('Invalid event identity');
  for (const key of ['requestKey', 'obligationId', 'reference', 'mode', 'amountMinor', 'currency'])
    if (event[key] !== savedRequest[key]) throw Error(`Event does not match saved ${key}`);
  const p = event.payment;
  if (!p || !Number.isSafeInteger(p.revision) || p.revision < 1 || !['awaiting','processing','requires_action','pending','unknown','approved','declined','cancelled','expired'].includes(p.state) ||
      !['open','closed','expired'].includes(p.sessionState) || typeof p.sessionId !== 'string' || !p.sessionId || typeof p.saleId !== 'string' || !p.saleId ||
      !(p.providerReference === null || typeof p.providerReference === 'string') || (p.state === 'approved' && !p.providerReference)) throw Error('Invalid payment result');
  return event;
}
// Callback handler: verifyEvent first, then in ONE database transaction:
// match saved requestId/sessionId/saleId if already bound; reject conflicting eventId/content;
// deduplicate eventId; enforce monotonic revision and approved non-regression;
// save event + payment result + order transition. Only AFTER commit acknowledge:
export const acknowledgement = event => ({ eventId: event.eventId, accepted: true });
