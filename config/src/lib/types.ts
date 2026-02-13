export type LabEnv = "production" | "staging";

export type ClientConfig = {
  slug: string;
  displayName: string;
  currency: string;
  threeDS: boolean;
  allowedReturnUrls: string[];

  // Add later (do not commit secrets):
  // tokenizationKey?: string;
};

export type Session = {
  sessionId: string;
  slug: string;
  amount: number;
  currency: string;
  orderRef: string;
  customer: { firstName: string; lastName: string; email: string; postalCode: string };
  returnUrl?: string;
  createdAt: number;
};

export type LabResultStatus = "approved" | "declined" | "error";

export type Result = {
  resultId: string;
  sessionId: string;
  slug: string;
  status: LabResultStatus;
  orderRef: string;
  amount: number;
  currency: string;
  gateway?: { transactionId?: string; message?: string };
  raw?: unknown;
  createdAt: number;
};