// lib/webhookSink.ts
export type WebhookSinkItem = {
  id: string;
  receivedAt: number;
  headers: Record<string, string>;
  body: any;
};

declare global {
  // eslint-disable-next-line no-var
  var __EDGE_LAB_WEBHOOK_SINK__: WebhookSinkItem[] | undefined;
}

function getStore(): WebhookSinkItem[] {
  if (!globalThis.__EDGE_LAB_WEBHOOK_SINK__) globalThis.__EDGE_LAB_WEBHOOK_SINK__ = [];
  return globalThis.__EDGE_LAB_WEBHOOK_SINK__;
}

export function addSinkItem(item: WebhookSinkItem) {
  const store = getStore();
  store.unshift(item);
  // keep last 50
  if (store.length > 50) store.length = 50;
}

export function listSinkItems() {
  return getStore();
}

export function clearSinkItems() {
  const store = getStore();
  store.length = 0;
}