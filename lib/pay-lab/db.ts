import { Pool, PoolClient } from "pg";
import { Booking, Snapshot, Route } from "./contract";
import { LabError } from "./config";
let pool: Pool;
export function database() {
  if (!process.env.PAY_LAB_DATABASE_URL)
    throw new LabError("The collection database is not configured.", 503);
  return (pool ??= new Pool({
    connectionString: process.env.PAY_LAB_DATABASE_URL,
    max: 5,
  }));
}
export async function transaction<T>(fn: (db: PoolClient) => Promise<T>) {
  const db = await database().connect();
  try {
    await db.query("BEGIN");
    const v = await fn(db);
    await db.query("COMMIT");
    return v;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export type RecordRow = {
  connection: string;
  id: string;
  booking: Booking;
  request: object | null;
  route: Route | null;
  snapshot: Snapshot | null;
  checkout_url: string | null;
  attempt_key: string | null;
  attempt_revision: number | null;
  dispatched: boolean;
  callback_count: number;
};
export async function record(db: PoolClient, connection: string, id: string) {
  const { rows } = await db.query<RecordRow>(
    "SELECT * FROM pay_lab_bookings WHERE connection=$1 AND id=$2 FOR UPDATE",
    [connection, id],
  );
  if (!rows[0]) throw new LabError("Booking not found.", 404);
  return rows[0];
}
export async function getRecord(connection: string, id: string) {
  return transaction((db) => record(db, connection, id));
}
export function publicRecord(r: RecordRow) {
  return {
    id: r.id,
    booking: r.booking,
    route: r.route,
    snapshot: r.snapshot,
    checkoutUrl: r.checkout_url,
    callbackCount: r.callback_count,
    submissionUncertain: r.dispatched,
  };
}
