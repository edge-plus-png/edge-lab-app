import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Snapshot } from "../pay-lab/contract";
import { database } from "../pay-lab/db";
import { key, Source, sourceSchema, sources } from "./config";
import { signature } from "./auth";
import { readBounded } from "../pay-lab/transport";
// Called in the same transaction that applies a verified Prime snapshot.
export async function enqueue(db: PoolClient, connection: string, bookingId: string, snapshot: Snapshot) {
    const { rows } = await db.query("SELECT * FROM pay_lab_external_requests WHERE connection=$1 AND booking_id=$2", [connection, bookingId]);
    const r = rows[0];
    if (!r)
        return;
    const eventId = randomUUID();
    const payload = { version: "2", type: "payment.updated", eventId, requestId: bookingId, requestKey: r.request_key, obligationId: r.obligation_id, reference: r.request.reference, mode: r.request.mode, amountMinor: r.request.amountMinor, currency: r.request.currency, payment: { sessionId: snapshot.sessionId, saleId: snapshot.saleId, revision: snapshot.revision, state: snapshot.paymentState, sessionState: snapshot.sessionState, providerReference: snapshot.providerReference } };
    await db.query(`INSERT INTO pay_lab_source_outbox(event_id,source,connection,booking_id,revision,body,destination,policy)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(connection,booking_id,revision) DO NOTHING`, [eventId, r.source, connection, bookingId, snapshot.revision, JSON.stringify(payload), r.source_config.callbackUrl, r.source_config]);
}
export async function deliverBatch(limit = 1) {
    // One atomic claim with expiring lease and fencing token; never hold DB locks over HTTP.
    await database().query(`UPDATE pay_lab_source_outbox SET exhausted_at=now(),last_error='Delivery attempt limit reached after interruption'
    WHERE delivered_at IS NULL AND exhausted_at IS NULL AND attempts >= (policy->'delivery'->>'maxAttempts')::integer
    AND (lease_until IS NULL OR lease_until<now())`);
    const claim = randomUUID();
    const { rows } = await database().query(`WITH candidates AS (
    SELECT event_id FROM pay_lab_source_outbox WHERE delivered_at IS NULL AND exhausted_at IS NULL
    AND attempts < (policy->'delivery'->>'maxAttempts')::integer
    AND next_at<=now() AND (lease_until IS NULL OR lease_until<now())
    ORDER BY next_at,event_id FOR UPDATE SKIP LOCKED LIMIT $1
  ) UPDATE pay_lab_source_outbox o SET claim=$2,lease_until=now()+((o.policy->'delivery'->>'leaseSeconds')::integer * interval '1 second'),attempts=o.attempts+1
  FROM candidates c WHERE o.event_id=c.event_id RETURNING o.*`, [limit, claim]);
    let delivered = 0;
    for (const row of rows) {
        let ok = false;
        try {
            const saved = sourceSchema.parse(row.policy);
            // Revocation prevents delivery; destination/policy remain frozen to the original request.
            const active = sources().find(s => s.id === saved.id && s.enabled && s.connectionId === saved.connectionId);
            if (!active)
                throw Error("Source disabled");
            const timestamp = String(Math.floor(Date.now() / 1000));
            const response = await fetch(row.destination, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(saved.delivery.timeoutSeconds * 1000), headers: { "content-type": "application/json", "x-getedge-version": "2", "x-getedge-source": saved.id, "x-getedge-event-id": row.event_id, "x-getedge-timestamp": timestamp, "x-getedge-signature": signature(key(saved.resultSecretEnv), timestamp, "result", saved.id, row.body) }, body: row.body });
            if (response.ok) {
                const receipt = JSON.parse(await readBounded(response));
                ok = receipt.eventId === row.event_id && receipt.accepted === true;
            }
        }
        catch { /* Redacted outcome only; retry the exact stored bytes. */ }
        const policy = row.policy as Source;
        await database().query(`UPDATE pay_lab_source_outbox SET delivered_at=CASE WHEN $3 THEN now() ELSE NULL END,
      exhausted_at=CASE WHEN NOT $3 AND attempts >= $4 THEN now() ELSE NULL END,
      next_at=now()+($5 * interval '1 second'),lease_until=NULL,claim=NULL,last_error=CASE WHEN $3 THEN NULL ELSE 'Receiver did not acknowledge event' END
      WHERE event_id=$1 AND claim=$2`, [row.event_id, claim, ok, policy.delivery.maxAttempts, policy.delivery.retrySeconds]);
        if (ok)
            delivered++;
    }
    return { claimed: rows.length, delivered };
}
