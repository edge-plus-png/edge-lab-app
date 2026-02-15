// lib/webhookSink.ts
export type SinkItem = {
  id: string;
  receivedAt: number;
  headers: Record<string, string>;
  body: any;
};

const MAX = 50;

// NOTE: In-memory only. Vercel serverless may reset between invocations.
// Good enough for demo/testing. If you ever need persistence, we’ll swap to KV/Redis.
const store: SinkItem[] = [];

export function addSinkItem(item: SinkItem) {
  store.unshift(item);
  if (store.length > MAX) store.length = MAX;
}

export function listSinkItems() {
  return store;
}

export function clearSinkItems() {
  store.length = 0;
}