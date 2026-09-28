import { after, test } from "node:test";
import assert from "node:assert/strict";
import { database, transaction } from "../../lib/pay-lab/db";

// No connection is opened: transport failures are injected at the pool boundary.
process.env.PAY_LAB_DATABASE_URL = "postgresql://unused@127.0.0.1:1/unused";
const pool = database();
after(() => pool.end());

test("idle client errors are handled without leaking driver diagnostics", (t) => {
  const logs = t.mock.method(console, "error", () => {});
  assert.doesNotThrow(() => pool.emit("error", new Error("sensitive driver data")));
  assert.equal(database(), pool);
  assert.deepEqual(logs.mock.calls.map(call => call.arguments), [["pay_lab_idle_database_error"]]);
});

test("rollback failure preserves the original error and discards the client", async (t) => {
  const original = new Error("operation failed");
  const queries: string[] = [];
  const releases: unknown[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (sql === "ROLLBACK") throw new Error("connection lost during rollback");
    },
    release(discard: unknown) { releases.push(discard); },
  };
  t.mock.method(pool, "connect", async () => client);
  await assert.rejects(transaction(async () => { throw original; }), error => error === original);
  assert.deepEqual(queries, ["BEGIN", "ROLLBACK"]);
  assert.deepEqual(releases, [true]);
});

test("successful rollback preserves the original error and returns the client", async (t) => {
  const original = new Error("operation rejected");
  const releases: unknown[] = [];
  t.mock.method(pool, "connect", async () => ({
    async query() {},
    release(discard: unknown) { releases.push(discard); },
  }));
  await assert.rejects(transaction(async () => { throw original; }), error => error === original);
  assert.deepEqual(releases, [false]);
});
