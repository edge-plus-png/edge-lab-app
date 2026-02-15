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

      // Built-in webhook sink (demo uses same flow as everyone)
      "https://demo.edge-lab.uk/api/webhook-sink",
      "https://demo.edge-lab.uk/webhook-sink",
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

      // Partner return URLs (lock these down as provided)
      "https://staging.anytimebooking.com",
      "https://anytimebooking.com",

      // Built-in webhook sink on this tenant (useful for testing)
      "https://anytime.edge-lab.uk/api/webhook-sink",
      "https://anytime.edge-lab.uk/webhook-sink",
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

      // Partner return URLs
      "https://nucotraining.com",
      "https://www.nucotraining.com",

      // Built-in webhook sink on this tenant
      "https://nuco.edge-lab.uk/api/webhook-sink",
      "https://nuco.edge-lab.uk/webhook-sink",
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

      // Partner return URLs
      "https://artisio.co",
      "https://www.artisio.co",

      // Built-in webhook sink on this tenant
      "https://artisio.edge-lab.uk/api/webhook-sink",
      "https://artisio.edge-lab.uk/webhook-sink",
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