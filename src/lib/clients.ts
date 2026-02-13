import fs from "node:fs";
import path from "node:path";
import type { ClientConfig } from "./types";

const cache = new Map<string, ClientConfig>();

export function loadClientConfig(slug: string): ClientConfig {
  if (cache.has(slug)) return cache.get(slug)!;

  const real = path.join(process.cwd(), "config", "clients", `${slug}.json`);
  const example = path.join(process.cwd(), "config", "clients", `${slug}.example.json`);
  const chosen = fs.existsSync(real) ? real : example;

  if (!fs.existsSync(chosen)) throw new Error(`Unknown client slug: ${slug}`);

  const cfg = JSON.parse(fs.readFileSync(chosen, "utf8")) as ClientConfig;
  cache.set(slug, cfg);
  return cfg;
}