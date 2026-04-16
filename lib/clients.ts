// lib/clients.ts
import type { ClientConfig } from "./types";
import {
  ARTISIO_LIVE_CALLBACK_URL,
  ARTISIO_STAGING_CALLBACK_URL,
} from "./artisio";

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
      "https://demo.edge-lab.uk",
    ],
    // ✅ optional default (use your sink in demo, or leave empty)
    defaultReturnUrl: "https://demo.edge-lab.uk/api/webhook-sink",
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
      "https://staging.anytimebooking.eu",
      "https://staging.anytimebooking.com",
      "https://anytimebooking.eu",
      "https://anytimebooking.com",
    ],
    // ✅ set this to Anytime’s real webhook endpoint (their staging/production)
    defaultReturnUrl: "https://staging.anytimebooking.eu/edge_plus/callback/",
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
      "https://nucotraining.com",
      "https://www.nucotraining.com",
    ],
    // defaultReturnUrl: "https://nucotraining.com/api/edge/webhook",
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
      ARTISIO_STAGING_CALLBACK_URL,
      ARTISIO_LIVE_CALLBACK_URL,
      "https://staging.artisio.co",
      "https://artisio.co",
      "https://www.artisio.co",
    ],
    defaultReturnUrl: ARTISIO_STAGING_CALLBACK_URL,
  },
};

export function loadClientConfig(slug: string): ClientConfig {
  const cfg = CLIENTS[slug];

  if (!cfg) throw new Error(`Unknown client: ${slug}`);
  if (!cfg.tokenizationKey) throw new Error(`Missing tokenizationKey for client: ${slug}`);

  return cfg;
}
