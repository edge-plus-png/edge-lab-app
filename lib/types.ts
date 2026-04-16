// lib/types.ts
export type ClientConfig = {
  slug: string;
  name: string;
  currency: string;

  // Public (used by browser pay page)
  tokenizationKey: string;

  // Private (used server-side for /api/charge)
  privateKeyEnv: string;

  // Security allow-list for return URLs
  allowedReturnUrlPrefixes: string[];

  // ✅ Optional: onboarding default return URL for this tenant
  defaultReturnUrl?: string;
};
