import { readFileSync } from "node:fs";

/** Test helper: reads the shared contract copy at the repo root (`contracts/`, next to `webapp/`). Node only. */
export const CONTRACTS_DIR = new URL("../../../contracts/", import.meta.url);

export function contractText(path: string): string {
  return readFileSync(new URL(path, CONTRACTS_DIR), "utf8");
}

export function contractJson<T = unknown>(path: string): T {
  return JSON.parse(contractText(path)) as T;
}
