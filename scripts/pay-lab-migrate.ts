import { database } from "../lib/pay-lab/db";
async function main() {
  await database().query(`
CREATE TABLE IF NOT EXISTS pay_lab_bookings (
 connection text NOT NULL, id uuid NOT NULL, booking jsonb NOT NULL,
 request jsonb, route jsonb, snapshot jsonb, checkout_url text,
 attempt_key uuid, attempt_revision integer, dispatched boolean NOT NULL DEFAULT false,
 callback_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection,id)
);
ALTER TABLE pay_lab_bookings ADD COLUMN IF NOT EXISTS collection jsonb;
CREATE TABLE IF NOT EXISTS pay_lab_receipts (
 connection text NOT NULL, event_id text NOT NULL, body_hash text NOT NULL,
 booking_id uuid NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection,event_id), FOREIGN KEY(connection,booking_id) REFERENCES pay_lab_bookings(connection,id)
);
CREATE TABLE IF NOT EXISTS pay_lab_audit (
 id bigserial PRIMARY KEY,connection text NOT NULL,booking_id uuid NOT NULL,actor text NOT NULL,
 action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);`);
  await database().end();
  console.log("GetEdge Pay lab migration complete");
}
main().catch(() => {
  console.error("Migration failed; check the isolated database connection");
  process.exitCode = 1;
});
