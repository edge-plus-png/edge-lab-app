import type { ClientConfig } from "./types";

const CLIENTS: Record<string, ClientConfig> = {
  demo: {
    slug: "demo",
    name: "Edge Lab Demo",
    currency: "GBP",
    tokenizationKey: process.env.NMI_DEMO_TOKENIZATION_KEY || "",
    privateKeyEnv: "NMI_DEMO_PRIVATE_KEY",
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
    allowedReturnUrlPrefixes: [
      "http://localhost",
      "http://127.0.0.1",
      "https://",
    ],
  },
};

export function loadClientConfig(slug: string): ClientConfig {
  const cfg = CLIENTS[slug];

  if (!cfg) {
    throw new Error(`Unknown client: ${slug}`);
  }

  if (!cfg.tokenizationKey) {
    throw new Error(`Missing tokenizationKey for client: ${slug}`);
  }

  return cfg;
}