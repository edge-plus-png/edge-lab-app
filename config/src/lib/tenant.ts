import type { LabEnv } from "./types";

export function getEnvFromHost(host: string): LabEnv {
  return host.includes(".staging.") ? "staging" : "production";
}

export function getSlugFromHost(host: string): string {
  const first = host.split(".")[0] || "";
  return first.toLowerCase();
}