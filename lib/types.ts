export type ClientConfig = {
  slug: string;
  name: string;

  // Currency for this tenant
  currency: string;

  // Public key used by NMI Payment Component (frontend only)
  tokenizationKey: string;

  // Name of ENV variable holding the NMI private key (server-side only)
  privateKeyEnv?: string;

  // API key used by partner when calling /api/session
  apiKey: string;

  // Allowed return URL prefixes (security control)
  allowedReturnUrlPrefixes: string[];
};