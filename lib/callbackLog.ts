export type CallbackLogEntry = {
  id: string;
  createdAt: number;
  slug: string;
  source: "charge" | "return-url-test" | "result-resend";
  sessionId?: string;
  returnUrl: string;
  request: {
    headers: Record<string, string>;
    body: unknown;
  };
  response?: {
    ok: boolean;
    status: number;
    headers: Record<string, string>;
    body: string;
  };
  error?: string;
};

const MAX = 100;
const store: CallbackLogEntry[] = [];

export function addCallbackLog(entry: CallbackLogEntry) {
  store.unshift(entry);
  if (store.length > MAX) store.length = MAX;
}

export function listCallbackLogsBySession(sessionId: string) {
  return store.filter((item) => item.sessionId === sessionId);
}

