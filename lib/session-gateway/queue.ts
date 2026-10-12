import { send } from "@vercel/queue";
import { database } from "../pay-lab/db";
import { canonicalDeployment } from "./deployment";
import { deliverBatch } from "./outbox";

export function queueEnabled() {
  return canonicalDeployment() && process.env.PAY_LAB_ENVIRONMENT === "staging"
    && process.env.VERCEL_ENV !== "production" && process.env.PAY_LAB_QUEUE_ENABLED === "true";
}
// The database remains authoritative. The queue carries only a wake-up signal,
// never payment authority, customer information, credentials or callback bytes.
export async function wakeDelivery() {
  if (!queueEnabled()) return;
  await send("pay-lab-results", { version: 1 }, { retentionSeconds: 86400 });
}
export class DeliveryPending extends Error {
  constructor(public afterSeconds: number) { super("Saved deliveries remain pending"); }
}
export async function processOutbox() {
  if (!queueEnabled()) throw new Error("Canonical staging queue is disabled");
  await deliverBatch(5);
  const { rows } = await database().query(`SELECT min(greatest(next_at,coalesce(lease_until,next_at))) AS due
    FROM pay_lab_source_outbox WHERE delivered_at IS NULL AND exhausted_at IS NULL`);
  if (rows[0]?.due) throw new DeliveryPending(Math.max(1, Math.min(3600, Math.ceil((new Date(rows[0].due).getTime()-Date.now())/1000))));
}
export function deliveryRetry(error: unknown) {
  return { afterSeconds: error instanceof DeliveryPending ? error.afterSeconds : 30 };
}
