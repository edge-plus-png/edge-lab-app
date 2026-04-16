import type { PaymentStatus, SessionCustomer, SessionIntent, VerificationReversalType } from "@/lib/store";

type ResultGatewayPayload = {
  transaction_id?: string;
  response?: string;
  response_code?: string;
  message?: string;
  auth_code?: string;
  avs?: string;
  cvv?: string;
  eci?: string;
  cavv?: string;
  xid?: string;
  three_ds_version?: string;
  directory_server_id?: string;
  cardholder_auth?: string;
};

type ResultVerificationPayload = {
  reversed: boolean;
  reverseType?: VerificationReversalType;
  reverseStatus?: PaymentStatus;
  reverseTransactionId?: string;
  reverseMessage?: string;
  reverseResponseCode?: string;
};

type BuildResultPayloadArgs = {
  client: string;
  sessionId: string;
  resultId?: string;
  intent: SessionIntent;
  status: PaymentStatus;
  orderRef: string;
  amount: number;
  currency: string;
  customer: SessionCustomer;
  gateway: ResultGatewayPayload;
  verification?: ResultVerificationPayload;
  createdAt: number;
};

export function buildResultPayload({
  client,
  sessionId,
  resultId,
  intent,
  status,
  orderRef,
  amount,
  currency,
  customer,
  gateway,
  verification,
  createdAt,
}: BuildResultPayloadArgs) {
  return {
    event: intent === "card_verification" ? "card.verification.completed" : "payment.completed",
    client,
    intent,
    status,
    session_id: sessionId,
    result_id: resultId,
    reference: orderRef,
    amount,
    currency,
    customer: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      postalCode: customer.postalCode,
    },
    gateway,
    verification:
      intent === "card_verification"
        ? {
            reversed: verification?.reversed ?? false,
            reverse_type: verification?.reverseType || "",
            reverse_status: verification?.reverseStatus || "",
            reverse_transaction_id: verification?.reverseTransactionId || "",
            reverse_message: verification?.reverseMessage || "",
            reverse_response_code: verification?.reverseResponseCode || "",
          }
        : undefined,
    created_at: new Date(createdAt).toISOString(),
  };
}
