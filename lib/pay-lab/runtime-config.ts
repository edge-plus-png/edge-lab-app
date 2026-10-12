import { AsyncLocalStorage } from "node:async_hooks";
import type { Config } from "./config";
import type { Source } from "../session-gateway/config";
export type RuntimeConfiguration = { sources: Source[]; connections: Config[]; secrets: Record<string,string> };
export const runtimeConfiguration = new AsyncLocalStorage<RuntimeConfiguration>();
export function configuredSecret(name: string) { return runtimeConfiguration.getStore()?.secrets[name] ?? process.env[name]; }
