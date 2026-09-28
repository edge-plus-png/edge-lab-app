import { z } from "zod";
export const routeSchema = z.object({
  ref: z.string().min(1),
  label: z.string(),
  channel: z.enum(["ECOM", "MOTO"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  presentation: z.enum(["hosted_customer", "operator_card"]),
});
export type Route = z.infer<typeof routeSchema>;
const addressSchema = z.object({
  address1:z.string().trim().max(160).optional(), address2:z.string().trim().max(160).optional(),
  city:z.string().trim().max(120).optional(), state:z.string().trim().max(120).optional(),
  postcode:z.string().trim().max(32).optional(), country:z.string().regex(/^[A-Z]{2}$/).optional(),
}).strict();
export const requestSchema = z
  .object({
    id: z.string().uuid(),
    reference: z.string().trim().min(1).max(200),
    amount: z.string().regex(/^\d{1,7}(\.\d{1,2})?$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    expiresAt: z.iso.datetime({ offset: true }),
    description: z.string().max(500).optional(),
    customer: z
      .object({
        customerName:z.string().trim().max(160).optional(),
        businessName:z.string().trim().max(160).optional(),
        phone:z.string().trim().max(40).optional(),
        billingAddress:addressSchema.optional(), shippingAddress:addressSchema.optional(),
        firstName: z.string().max(80).optional(),
        lastName: z.string().max(80).optional(),
        email: z.union([z.literal(""), z.email()]).optional(),
      })
      .strict()
      .optional(),
    customerCollection: z.object({ customerName: z.enum(["hidden", "optional", "required"]), email: z.enum(["hidden", "optional", "required"]), billingPostcode: z.enum(["hidden", "optional", "required"]) }).strict().optional(),
    returnUrl: z.url().max(2048).optional(),
  })
  .strict();
export type Booking = z.infer<typeof requestSchema>;
export function minorUnits(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value < 1 || value > 999999999)
    throw Error("Amount must be positive and within the payment contract");
  return value;
}
export const snapshotSchema = z.object({
  version: z.literal("1"),
  merchantId: z.string(),
  pairingId: z.string(),
  environment: z.string(),
  sessionId: z.string().min(1),
  saleId: z.string().min(1),
  revision: z.number().int().positive(),
  source: z.object({
    id: z.string(),
    type: z.string(),
    reference: z.string(),
    obligationId: z.string(),
  }),
  amountMinor: z.number().int(),
  currency: z.string(),
  expiresAt: z.string(),
  paymentState: z.enum([
    "awaiting",
    "processing",
    "requires_action",
    "pending",
    "unknown",
    "approved",
    "declined",
    "cancelled",
    "expired",
  ]),
  sessionState: z.enum(["open", "closed", "expired"]),
  providerReference: z.string().nullable(),
  route: routeSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const setupSchema = z.object({
  tokenizationKey: z.string().min(1),
  fields: z.object({
    customerName: z.enum(["hidden", "optional", "required"]),
    email: z.enum(["hidden", "optional", "required"]),
    billingPostcode: z.enum(["hidden", "optional", "required"]),
  }),
});
export type Setup = z.infer<typeof setupSchema>;
export function payable(s: Snapshot) {
  return (
    s.sessionState === "open" &&
    ["awaiting", "declined"].includes(s.paymentState) &&
    Date.parse(s.expiresAt) > Date.now()
  );
}
