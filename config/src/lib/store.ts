import { randomUUID } from "crypto";
import type { Session, Result, LabResultStatus } from "./types";

const sessions = new Map<string, Session>();
const results = new Map<string, Result>();

export function createSession(input: Omit<Session, "sessionId" | "createdAt">): Session {
  const sessionId = `sess_${randomUUID()}`;
  const s: Session = { ...input, sessionId, createdAt: Date.now() };
  sessions.set(sessionId, s);
  return s;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function saveResult(input: Omit<Result, "resultId" | "createdAt">): Result {
  const resultId = `res_${randomUUID()}`;
  const r: Result = { ...input, resultId, createdAt: Date.now() };
  results.set(resultId, r);
  return r;
}

export function getResult(resultId: string): Result | undefined {
  return results.get(resultId);
}

export function getResultBySession(sessionId: string): Result | undefined {
  for (const r of results.values()) if (r.sessionId === sessionId) return r;
  return undefined;
}

export function mockGatewayDecision(amount: number): { status: LabResultStatus; message: string } {
  if (amount < 20) return { status: "approved", message: "APPROVED (mock)" };
  if (amount < 40) return { status: "declined", message: "DECLINED (mock)" };
  return { status: "error", message: "ERROR (mock)" };
}