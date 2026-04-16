import { randomUUID } from "crypto";

export type PaymentStatus = "approved" | "declined" | "error";
export type SessionIntent = "payment" | "card_verification";
export type VerificationReversalType = "void" | "refund";

export type SessionCustomer = {
  firstName: string;
  lastName: string;
  email: string;
  postalCode: string;
  address1?: string;
  city?: string;
  country?: string; // ISO 3166-1 alpha-2 (optional)
};

export type Session = {
  sessionId: string;
  slug: string; // tenant/client slug from hostname
  intent: SessionIntent;
  amount: number;
  currency: string;
  orderRef: string;
  returnUrl?: string;
  successUrl?: string;
  failUrl?: string;
  cancelUrl?: string;
  customer: SessionCustomer;
  createdAt: number;
};

export type Result = {
  resultId: string;
  sessionId: string;
  slug: string;
  intent: SessionIntent;
  status: PaymentStatus;
  orderRef: string;
  amount: number;
  currency: string;
  customer: SessionCustomer;
  gateway: {
    transactionId?: string;
    message?: string;
    responseCode?: string;
    authCode?: string;
    avs?: string;
    cvv?: string;
    eci?: string;
    cavv?: string;
    xid?: string;
    threeDsVersion?: string;
    directoryServerId?: string;
    cardholderAuth?: string;
  };
  verification?: {
    reversed: boolean;
    reverseType?: VerificationReversalType;
    reverseStatus?: PaymentStatus;
    reverseTransactionId?: string;
    reverseMessage?: string;
    reverseResponseCode?: string;
  };
  raw?: unknown;
  createdAt: number;
};

const sessions = new Map<string, Session>();
const results = new Map<string, Result>(); // keyed by sessionId

/**
 * Create a new session.
 * Generates a secure sessionId automatically.
 */
export function createSession(input: Omit<Session, "createdAt" | "sessionId">) {
  const sessionId = randomUUID().replace(/-/g, "");
  const s: Session = { ...input, sessionId, createdAt: Date.now() };
  sessions.set(s.sessionId, s);
  return s;
}

export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

export function getResultBySession(sessionId: string) {
  return results.get(sessionId);
}

/**
 * Save a result. You pass in resultId (so caller can define),
 * and we store it keyed by sessionId.
 */
export function saveResult(input: Omit<Result, "createdAt">) {
  const r: Result = { ...input, createdAt: Date.now() };
  results.set(r.sessionId, r);
  return r;
}
