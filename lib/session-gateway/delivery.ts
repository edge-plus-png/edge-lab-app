import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { database, transaction } from "../pay-lab/db";
import { LabError } from "../pay-lab/config";
import { key } from "./config";
import { readBounded } from "../pay-lab/transport";
import { failure } from "./http";
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect"), requestId: z.uuid() }).strict(),
  z.object({ action: z.literal("replay"), eventId: z.uuid(), reason: z.string().trim().min(1).max(200) }).strict(),
]);
export async function deliveryHandler(req: Request) {
  try {
    const digest = (s: string) => createHash("sha256").update(s).digest();
    if (!timingSafeEqual(digest(req.headers.get("authorization") || ""), digest(`Bearer ${key("PAY_LAB_SUPPORT_SECRET")}`)))
      throw new LabError("Support authentication required.", 401);
    const body = input.parse(JSON.parse(await readBounded(req)));
    if (body.action === "inspect") {
      const { rows } = await database().query(`SELECT event_id,booking_id AS request_id,source,revision,attempts,next_at,delivered_at,exhausted_at,last_error
        FROM pay_lab_source_outbox WHERE booking_id=$1 ORDER BY revision`, [body.requestId]);
      return Response.json({ deliveries: rows }, { headers: { "cache-control": "no-store" } });
    }
    await transaction(async db => {
      const { rows } = await db.query("SELECT * FROM pay_lab_source_outbox WHERE event_id=$1 FOR UPDATE", [body.eventId]);
      const row = rows[0];
      if (!row) throw new LabError("Delivery not found.", 404);
      if (row.delivered_at || !row.exhausted_at || (row.lease_until && new Date(row.lease_until).getTime() > Date.now()))
        throw new LabError("Only exhausted, unclaimed deliveries can be replayed.", 409);
      await db.query("INSERT INTO pay_lab_audit(connection,booking_id,actor,action) VALUES($1,$2,$3,$4)",
        [row.connection, row.booking_id, "delivery-support", JSON.stringify({ operation: "replay", eventId: row.event_id, previousAttempts: row.attempts, reason: body.reason })]);
      // Preserve identity, immutable bytes and destination. Restart one bounded delivery cycle only.
      await db.query("UPDATE pay_lab_source_outbox SET attempts=0,exhausted_at=NULL,last_error=NULL,claim=NULL,lease_until=NULL,next_at=now() WHERE event_id=$1", [body.eventId]);
    });
    return Response.json({ eventId: body.eventId, queued: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return failure(error); }
}
