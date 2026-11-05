import assert from "node:assert/strict";
import test from "node:test";
import { scopeFor } from "./countryMemory.ts";

/**
 * Rules A9, owner 2026-11-05: the admin opens on the LAST COUNTRY USED, remembered per admin user in browser storage;
 * an empty or broken storage falls back to the current default (the first country the admin may open: Sweden).
 */
const ALL = { zones: "all" as const };

function useStorage(store: Map<string, string> | "broken") {
  (globalThis as { localStorage?: unknown }).localStorage = store === "broken"
    ? { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceededError"); } }
    : { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
}

test("A9: France used on any page (the URL names it), then a reload with no country in the URL opens France again", () => {
  useStorage(new Map());
  assert.equal(scopeFor(ALL, "adm_1", { country: "FR" }).country, "FR");
  assert.equal(scopeFor(ALL, "adm_1", {}).country, "FR");
});

test("A9: per admin user: another admin on the same browser keeps his own last country", () => {
  useStorage(new Map());
  scopeFor(ALL, "adm_1", { country: "FR" });
  assert.equal(scopeFor(ALL, "adm_2", {}).country, "SE");
  scopeFor(ALL, "adm_2", { country: "TN" });
  assert.deepEqual([scopeFor(ALL, "adm_1", {}).country, scopeFor(ALL, "adm_2", {}).country], ["FR", "TN"]);
});

test("A9: zones named in the URL count as using their country", () => {
  useStorage(new Map());
  scopeFor(ALL, "adm_1", { scope: "FR-PC" });
  assert.equal(scopeFor(ALL, "adm_1", {}).country, "FR");
});

test("A9: empty storage, broken storage, an unknown or a not-allowed value fall back to the default; no crash", () => {
  useStorage(new Map());
  assert.equal(scopeFor(ALL, "adm_1", {}).country, "SE");
  useStorage("broken");
  assert.equal(scopeFor(ALL, "adm_1", { country: "FR" }).country, "FR");
  assert.equal(scopeFor(ALL, "adm_1", {}).country, "SE");
  useStorage(new Map([["movera-admin-country:adm_1", "XX"]]));
  assert.equal(scopeFor(ALL, "adm_1", {}).country, "SE");
  useStorage(new Map([["movera-admin-country:adm_1", "FR"]]));
  assert.equal(scopeFor({ zones: "all", countries: ["SE"] }, "adm_1", {}).country, "SE");
  assert.equal(scopeFor(ALL, undefined, {}).country, "SE");
});
