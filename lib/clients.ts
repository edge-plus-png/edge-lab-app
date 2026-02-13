import type { ClientConfig } from "./types";

/**
 * V1: hard-coded client configs.
 * Later: move to config files / DB or admin UI.
 */
const CLIENTS: Record<string, ClientConfig> = {
  demo: {
    slug: "demo",
    name: "Edge Lab Demo",
    currency: "GBP",
    tokenizationKey: process.env.NMI_DEMO_TOKENIZATION_KEY || "",
    privateKeyEnv: "NMI_DEMO_PRIVATE_KEY",
    apiKey: process.env.EDGE_LAB_DEMO_API_KEY || "",
    allowedReturnUrlPrefixes: [
      "http://localhost",
      "http://127.0.0.1",
      "https://",
    ],
  },

  anytime: {
    slug: "anytime",
    name: "Anytime Booking",
    currency: "GBP",
    tokenizationKey: process.env.NMI_ANYTIME_TOKENIZATION_KEY || "",
    privateKeyEnv: "NMI_ANYTIME_PRIVATE_KEY",
    apiKey: process.env.EDGE_LAB_ANYTIME_API_KEY || "",
    allowedReturnUrlPrefixes: [
      "http://localhost",
      "http://127.0.0.1",
      "https://",
    ],
  },

  nuco: {
    slug: "nuco",
    name: "Nuco",
    currency: "GBP",
    tokenizationKey: process.env.NMI_NUCO_TOKENIZATION_KEY || "",
    privateKeyEnv: "NMI_NUCO_PRIVATE_KEY",
    apiKey: process.env.EDGE_LAB_NUCO_API_KEY || "",
    allowedReturnUrlPrefixes: [
      "http://localhost",
      "http://127.0.0.1",
      "https://",
    ],
  },

  artisio: {
    slug: "artisio",
    name: "Artisio",
    currency: "GBP",
    tokenizationKey: process.env.NMI_ARTISIO_TOKENIZATION_KEY || "",
    privateKeyEnv: "NMI_ARTISIO_PRIVATE_KEY",
    apiKey: process.env.EDGE_LAB_ARTISIO_API_KEY || "",
    allowedReturnUrlPrefixes: [
      "http://localhost",
      "http://127.0.0.1",
      "https://",
    ],
  },
};

/**
 * Loads a client configuration by slug.
 * Throws clear errors if misconfigured.
 */
export function loadClientConfig(slug: string): ClientConfig {
  const cfg = CLIENTS[slug];

  if (!cfg) {
    throw new Error(`Unknown client: ${slug}`);
  }

  if (!cfg.tokenizationKey) {
    throw new Error(
      `Missing tokenizationKey for client: ${slug}. Check your .env configuration.`
    );
  }

  if (!cfg.apiKey) {
    throw new Error(
      `Missing apiKey for client: ${slug}. Check your .env configuration.`
    );
  }

  return cfg;
}