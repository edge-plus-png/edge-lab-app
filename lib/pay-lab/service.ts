import { enqueue } from "../session-gateway/outbox";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Config, LabError, scope } from "./config";
import {
  Booking,
  Route,
  Snapshot,
  minorUnits,
  payable,
  requestSchema,
  routeSchema,
  setupSchema,
  snapshotSchema,
} from "./contract";
import { getRecord, publicRecord, record, RecordRow, transaction } from "./db";
import { pay, verify } from "./transport";
export async function settings(c: Config) {
  const [catalog, configuration] = await Promise.all([
    pay(c, "routes", {}),
    pay(c, "configuration", {}),
  ]);
  const routes = z
    .array(routeSchema)
    .parse(
      catalog.routes.filter(
        (r: Route) =>
          c.routeRefs.includes(r.ref) && ["ECOM", "MOTO"].includes(r.channel),
      ),
    );
  if (configuration.callbackUrl !== c.callbackUrl)
    throw new LabError(
      "The connection callback differs from this lab registration. Correct it in the merchant portal before creating sessions.",
      409,
    );
  return {
    name: c.name,
    staffCollectionConfigured: Boolean(c.staffCollection),
    routes,
    callbackUrl: c.callbackUrl,
    returnUrls: c.returnUrls,
    sample: c.sample,
    providerTestModeConfirmed: c.providerTestModeConfirmed,
    configurationChecked: true,
  };
}
function assertRequest(c: Config, b: Booking) {
  minorUnits(b.amount);
  const seconds = (Date.parse(b.expiresAt) - Date.now()) / 1000;
  if (seconds <= 0 || seconds > 2592000)
    throw new LabError("Choose a future expiry within the service contract.");
  if (b.returnUrl && !c.returnUrls.includes(b.returnUrl))
    throw new LabError("Browser return URL is not registered.", 403);
}
export async function saveBooking(c: Config, value: unknown) {
  const b = requestSchema.parse(value);
  await transaction(async (db) => {
    const existing = await db.query<RecordRow>(
      "SELECT * FROM pay_lab_bookings WHERE connection=$1 AND id=$2",
      [c.id, b.id],
    );
    if (!existing.rows.length) assertRequest(c, b);
    await db.query(
      "INSERT INTO pay_lab_bookings(connection,id,booking) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [c.id, b.id, b],
    );
    const row = await record(db, c.id, b.id);
    if (
      JSON.stringify(row.booking) !==
      JSON.stringify(JSON.parse(JSON.stringify(b)))
    ) {
      // PostgreSQL JSONB reorders keys, so compare canonical content below.
      if (canonical(row.booking) !== canonical(b))
        throw new LabError(
          "This request ID is already bound to different booking details.",
          409,
        );
    }
  });
  return publicRecord(await getRecord(c.id, b.id));
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function validateSnapshot(c: Config, r: RecordRow, value: unknown) {
  const s = snapshotSchema.parse(value);
  // Staff selection occurs at Pay. Accept only a route in the saved immutable
  // collection request, then freeze it with the first verified payment snapshot.
  const choices = (r.request as { routes?: Record<string,string> } | null)?.routes;
  const expectedRoute = r.route ?? r.snapshot?.route ?? (choices && choices[s.route.channel === "MOTO" ? "telephone_payment" : "payment_link"] === s.route.ref ? s.route : null);
  for (const [key, expected] of Object.entries(scope(c)))
    if (s[key as keyof Snapshot] !== expected)
      throw new LabError("Payment scope mismatch.", 409);
  if (
    !expectedRoute ||
    s.source.id !== c.sourceId ||
    s.source.type !== c.sourceType ||
    s.source.reference !== r.booking.reference ||
    s.source.obligationId !== r.id ||
    s.amountMinor !== minorUnits(r.booking.amount) ||
    s.currency !== r.booking.currency ||
    s.route.ref !== expectedRoute.ref ||
    s.route.channel !== expectedRoute.channel ||
    s.route.currency !== r.booking.currency ||
    Date.parse(s.expiresAt) !== Date.parse(r.booking.expiresAt) ||
    (r.snapshot &&
      (s.sessionId !== r.snapshot.sessionId || s.saleId !== r.snapshot.saleId))
  )
    throw new LabError("Payment does not match the saved booking.", 409);
  return s;
}
async function apply(c: Config, id: string, value: unknown) {
  return transaction(async (db) => {
    const r = await record(db, c.id, id);
    const s = validateSnapshot(c, r, value);
    if (!r.snapshot || s.revision > r.snapshot.revision) {
      await db.query(
        "UPDATE pay_lab_bookings SET snapshot=$3 WHERE connection=$1 AND id=$2",
        [c.id, id, s],
      );
      await enqueue(db, c.id, id, s);
    } else if (
      s.revision === r.snapshot.revision &&
      canonical({ ...s, sessionState: undefined }) !== canonical({ ...r.snapshot, sessionState: undefined })
    )
      throw new LabError("Conflicting payment revision.", 409);
    return record(db, c.id, id);
  });
}
export async function launch(c: Config, id: string, routeRef: string) {
  const saved = await getRecord(c.id, id);
  if (!saved.request && !c.providerTestModeConfirmed)
    throw new LabError(
      "A verified provider test-mode configuration is required before creating payment sessions.",
      409,
    );
  const config = saved.request ? null : await settings(c);
  const route = saved.request ? saved.route : config!.routes.find((r) => r.ref === routeRef);
  if (route && route.ref !== routeRef) throw new LabError("Saved route does not match the requested route.",409);
  if (!route) throw new LabError("This payment route is not granted.", 403);
  const r = await transaction(async (db) => {
    const r = await record(db, c.id, id);
    if ((r.request as { routes?: unknown } | null)?.routes) throw new LabError("Resume this booking through its hosted staff collection.", 409);
    if (r.route && r.route.ref !== route.ref)
      throw new LabError(
        "This booking already has a payment route. Resolve its existing payment before changing collection method.",
        409,
      );
    if (!r.request) {
      assertRequest(c, r.booking);
      if (route.currency !== r.booking.currency)
        throw new LabError("Route currency does not match the booking.");
      const request = {
        ...scope(c),
        idempotencyKey: r.id,
        source: { reference: r.booking.reference, obligationId: r.id },
        amountMinor: minorUnits(r.booking.amount),
        currency: r.booking.currency,
        expiresAt: r.booking.expiresAt,
        operation: "payment",
        routeRef: route.ref,
        channel: route.channel,
        presentation:
          route.channel === "MOTO" ? "operator_card" : "hosted_customer",
        ...(r.booking.description
          ? { description: r.booking.description }
          : {}),
        ...(r.booking.customer ? { customer: r.booking.customer } : {}),
        ...(r.booking.customerCollection ? { customerCollection: r.booking.customerCollection } : {}),
        ...(r.booking.returnUrl ? { returnUrl: r.booking.returnUrl } : {}),
      };
      await db.query(
        "UPDATE pay_lab_bookings SET request=$3,route=$4 WHERE connection=$1 AND id=$2",
        [c.id, id, request, route],
      );
      await db.query(
        "INSERT INTO pay_lab_audit(connection,booking_id,actor,action) VALUES($1,$2,$3,$4)",
        [c.id, id, c.staffUser, `launch:${route.channel}`],
      );
    }
    return record(db, c.id, id);
  });
  await apply(
    c,
    id,
    await pay(
      c,
      r.snapshot ? "sessions/status" : "sessions",
      r.snapshot ? { sessionId: r.snapshot.sessionId } : r.request!,
    ),
  );
  let updated = await getRecord(c.id, id);
  if (
    route.channel === "ECOM" &&
    updated.snapshot &&
    payable(updated.snapshot) &&
    !updated.checkout_url
  ) {
    const result = await pay(c, "links", {
      sessionId: updated.snapshot.sessionId,
    });
    await apply(c, id, result);
    const u = new URL(z.string().parse(result.checkoutUrl));
    if (
      u.origin !== new URL(c.origin).origin ||
      u.username ||
      u.password ||
      u.protocol !== "https:"
    )
      throw new LabError("Unexpected checkout destination.", 502);
    await transaction((db) =>
      db.query(
        "UPDATE pay_lab_bookings SET checkout_url=COALESCE(checkout_url,$3) WHERE connection=$1 AND id=$2",
        [c.id, id, u.href],
      ),
    );
  }
  updated = await getRecord(c.id, id);
  return publicRecord(updated);
}
export async function refresh(c: Config, id: string) {
  const r = await getRecord(c.id, id);
  if ((r.request as { routes?: unknown } | null)?.routes) return launchCollection(c, id);
  if (r.request) {
    await apply(
      c,
      id,
      await pay(
        c,
        r.snapshot ? "sessions/status" : "sessions",
        r.snapshot ? { sessionId: r.snapshot.sessionId } : r.request,
      ),
    );
  }
  return publicRecord(await getRecord(c.id, id));
}
export async function operatorSetup(c: Config, id: string) {
  if (!c.providerTestModeConfirmed)
    throw new LabError("Provider test mode has not been confirmed.", 409);
  await refresh(c, id);
  const r = await getRecord(c.id, id);
  if (r.route?.channel !== "MOTO" || !r.snapshot || !payable(r.snapshot))
    throw new LabError("This booking is not payable by telephone.", 409);
  if (
    r.dispatched &&
    !(
      r.snapshot.paymentState === "declined" &&
      r.snapshot.revision > (r.attempt_revision || 0)
    )
  )
    throw new LabError(
      "A submitted attempt needs recovery. Do not take another payment.",
      409,
    );
  const result = await pay(c, "sessions/operator/setup", {
    sessionId: r.snapshot.sessionId,
  });
  await apply(c, id, result);
  return {
    setup: setupSchema.parse(result.operatorSetup),
    scriptUrl: c.collectScriptUrl,
  };
}
const tokenSchema = z
  .object({
    paymentToken: z.string().min(1).max(2048),
    customerName: z.string().max(160).optional(),
    email: z.union([z.literal(""), z.email()]).optional(),
    billingPostcode: z.string().max(32).optional(),
  })
  .strict();
export async function submit(c: Config, id: string, value: unknown) {
  const payment = tokenSchema.parse(value);
  await operatorSetup(c, id);
  const r = await transaction(async (db) => {
    const r = await record(db, c.id, id);
    if (!r.snapshot || !payable(r.snapshot) || r.route?.channel !== "MOTO")
      throw new LabError("Payment cannot be submitted.", 409);
    if (
      r.dispatched &&
      !(
        r.snapshot.paymentState === "declined" &&
        r.snapshot.revision > (r.attempt_revision || 0)
      )
    )
      throw new LabError(
        "An attempt has already been submitted. Check its status.",
        409,
      );
    await db.query(
      "UPDATE pay_lab_bookings SET attempt_key=$3,attempt_revision=$4,dispatched=true WHERE connection=$1 AND id=$2",
      [c.id, id, randomUUID(), r.snapshot.revision],
    );
    await db.query(
      "INSERT INTO pay_lab_audit(connection,booking_id,actor,action) VALUES($1,$2,$3,$4)",
      [c.id, id, c.staffUser, "submit:MOTO"],
    );
    return record(db, c.id, id);
  });
  const result = await pay(c, "sessions/operator/pay", {
    sessionId: r.snapshot!.sessionId,
    payment: { ...payment, idempotencyKey: r.attempt_key },
  });
  await apply(c, id, result);
  return publicRecord(await getRecord(c.id, id));
}
export async function receive(c: Config, raw: string, headers: Headers) {
  const event = z
    .object({
      version: z.literal("1"),
      type: z.literal("payment.updated"),
      eventId: z.string().min(1),
      data: snapshotSchema,
    })
    .parse(verify(c, raw, headers));
  if (headers.get("x-edge-event-id") !== event.eventId)
    throw new LabError("Event identity mismatch.", 409);
  const hash = createHash("sha256").update(raw).digest("hex");
  const id = z.uuid().parse(event.data.source.obligationId);
  await transaction(async (db) => {
    const r = await record(db, c.id, id);
    const s = validateSnapshot(c, r, event.data);
    const previous = await db.query(
      "SELECT body_hash FROM pay_lab_receipts WHERE connection=$1 AND event_id=$2",
      [c.id, event.eventId],
    );
    if (previous.rows.length) {
      if (previous.rows[0].body_hash !== hash)
        throw new LabError("Event payload changed.", 409);
      return;
    }
    if (
      r.snapshot &&
      s.revision === r.snapshot.revision &&
      canonical({ ...s, sessionState: undefined }) !== canonical({ ...r.snapshot, sessionState: undefined })
    )
      throw new LabError("Conflicting event revision.", 409);
    await db.query(
      "INSERT INTO pay_lab_receipts(connection,event_id,body_hash,booking_id) VALUES($1,$2,$3,$4)",
      [c.id, event.eventId, hash, id],
    );
    if (!r.snapshot || s.revision >= r.snapshot.revision) await enqueue(db, c.id, id, s);
    await db.query(
      "UPDATE pay_lab_bookings SET callback_count=callback_count+1,snapshot=$3 WHERE connection=$1 AND id=$2",
      [
        c.id,
        id,
        !r.snapshot || s.revision > r.snapshot.revision ? s : r.snapshot,
      ],
    );
  });
  return { eventId: event.eventId, sourceSyncState: "synced" };
}

// Public partner contract only: no provider credentials or database access to Pay.
export async function launchCollection(c: Config, id: string) {
  const existing = await getRecord(c.id, id);
  if (!existing.request && (!c.providerTestModeConfirmed || !c.staffCollection)) throw new LabError("Configure the partner staff collection and confirm provider test mode first.", 409);
  const configuration = existing.request ? null : await settings(c);
  const r = await transaction(async db => {
    const row = await record(db, c.id, id);
    if (row.request && !(row.request as { routes?: unknown }).routes) throw new LabError("Resume the existing payment journey for this booking.", 409);
    if (!row.request) {
      assertRequest(c, row.booking);
      const routes = c.staffCollection!.routes[row.booking.currency];
      if (!routes || !Object.values(routes).length || Object.entries(routes).some(([action, ref]) => !configuration!.routes.some(route => route.ref === ref && route.currency === row.booking.currency && route.channel === (action === "telephone_payment" ? "MOTO" : "ECOM")))) throw new LabError("Configure explicit granted routes for this currency.", 409);
      const request = { ...scope(c), idempotencyKey: row.id, source: { reference: row.booking.reference, obligationId: row.id }, amountMinor: minorUnits(row.booking.amount), currency: row.booking.currency, expiresAt: row.booking.expiresAt, routes, ...(row.booking.description ? { description: row.booking.description } : {}), ...(row.booking.customer ? { customer: row.booking.customer } : {}), ...(row.booking.customerCollection ? { customerCollection: row.booking.customerCollection } : {}), ...(row.booking.returnUrl ? { returnUrl: row.booking.returnUrl } : {}), ...(c.staffCollection!.embeddingOrigin ? { embeddingOrigin: c.staffCollection!.embeddingOrigin } : {}) };
      await db.query("UPDATE pay_lab_bookings SET request=$3 WHERE connection=$1 AND id=$2", [c.id,id,request]);
      await db.query("INSERT INTO pay_lab_audit(connection,booking_id,actor,action) VALUES($1,$2,$3,$4)", [c.id,id,c.staffUser,"staff_collection_created"]);
    }
    return record(db,c.id,id);
  });
  const response = await pay(c,r.collection ? "collections/status" : "collections", r.collection ? { collectionId: r.collection.collectionId } : r.request!);
  if (response.source?.id !== c.sourceId || response.source?.type !== c.sourceType || response.source?.obligationId !== r.id || response.source?.reference !== r.booking.reference || response.amountMinor !== minorUnits(r.booking.amount) || response.currency !== r.booking.currency) throw new LabError("Collection does not match the saved booking.",502);
  const info = z.object({collectionId:z.string().min(1),staffUrl:z.url(),embedUrl:z.url().nullable(),expiresAt:z.iso.datetime({offset:true})}).parse(response);
  for (const url of [info.staffUrl,info.embedUrl].filter(Boolean) as string[]) {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(c.origin).origin || parsed.username || parsed.password || parsed.hash || !/^\/getedge-pay\/collect\/[a-f0-9]{64}$/.test(parsed.pathname)) throw new LabError("Unexpected staff launch destination.",502);
  }
  if (Date.parse(info.expiresAt) !== Date.parse(r.booking.expiresAt) || (r.collection && info.collectionId !== r.collection.collectionId)) throw new LabError("Collection does not match the saved booking.",502);
  await transaction(async db => {
    const row = await record(db,c.id,id);
    if(row.collection && row.collection.collectionId !== info.collectionId)throw new LabError("Collection identity changed.",409);
    await db.query("UPDATE pay_lab_bookings SET collection=$3 WHERE connection=$1 AND id=$2",[c.id,id,info]);
  });
  if (response.payment) await apply(c,id,response.payment);
  return publicRecord(await getRecord(c.id,id));
}
