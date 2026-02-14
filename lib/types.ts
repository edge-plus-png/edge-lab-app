export type ClientConfig = {
  slug: string;
  name: string;
  currency: string;

  // Public key used by NMI Payment Component (frontend only)
  tokenizationKey: string;

  // Name of ENV variable holding the NMI private key (server-side only)
  privateKeyEnv?: string;

  // Allowed return URL prefixes (security control)
  allowedReturnUrlPrefixes: string[];
};