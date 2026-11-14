import assert from "node:assert/strict";
import test from "node:test";
import { LANGUAGE_RETRY_DELAYS_MS, failedImportUrl, freshUrl, loadLanguageWithRetry } from "./core.ts";

/**
 * BQ-A27: a language file that fails to load (seen in e2e as net::ERR_INSUFFICIENT_RESOURCES) left the admin on "…"
 * for good. The panel now tries again a few times, waiting longer each time, and then tells the caller it failed so
 * the panel can show English with a note.
 */
const noWait = (waits: number[]) => async (ms: number) => { waits.push(ms); };

test("a language file that fails twice and then loads: three tries, waiting longer each time", async () => {
  const waits: number[] = [];
  let calls = 0;
  const ok = await loadLanguageWithRetry("sv", { load: async () => { calls += 1; if (calls < 3) throw new Error("net::ERR_INSUFFICIENT_RESOURCES"); }, wait: noWait(waits) });
  assert.equal(ok, true);
  assert.equal(calls, 3);
  assert.deepEqual(waits, LANGUAGE_RETRY_DELAYS_MS.slice(0, 2));
});

test("a language file that never loads: every try is used, then false (the panel shows English)", async () => {
  const waits: number[] = [];
  let calls = 0;
  const ok = await loadLanguageWithRetry("fr", { load: async () => { calls += 1; throw new Error("offline"); }, wait: noWait(waits) });
  assert.equal(ok, false);
  assert.equal(calls, LANGUAGE_RETRY_DELAYS_MS.length + 1);
  assert.deepEqual(waits, [...LANGUAGE_RETRY_DELAYS_MS]);
  for (let index = 1; index < LANGUAGE_RETRY_DELAYS_MS.length; index += 1) assert.ok(LANGUAGE_RETRY_DELAYS_MS[index] > LANGUAGE_RETRY_DELAYS_MS[index - 1], "backoff grows");
  assert.ok(LANGUAGE_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) <= 10_000, "the admin waits at most 10 s in all");
});

test("English never loads anything and a language that loads at once does not wait", async () => {
  const waits: number[] = [];
  let calls = 0;
  assert.equal(await loadLanguageWithRetry("en", { load: async () => { calls += 1; }, wait: noWait(waits) }), true);
  assert.equal(calls, 0);
  assert.equal(await loadLanguageWithRetry("sv", { load: async () => { calls += 1; }, wait: noWait(waits) }), true);
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test("only the tries after a failure ask for a fresh copy of the file", async () => {
  const fresh: boolean[] = [];
  await loadLanguageWithRetry("sv", { load: async (_language, retry) => { fresh.push(retry); if (fresh.length < 3) throw new Error("x"); }, wait: async () => {} });
  assert.deepEqual(fresh, [false, true, true]);
});

test("the failed file is read from the browser's error, and a new try uses a new address", () => {
  // Chromium remembers the failed import() (e2e/live-language-fallback.spec.ts), so the same address never loads again.
  assert.equal(failedImportUrl(new TypeError("Failed to fetch dynamically imported module: http://127.0.0.1:4174/assets/sv-CizzsHwo.js")), "http://127.0.0.1:4174/assets/sv-CizzsHwo.js");
  assert.equal(failedImportUrl(new TypeError("Failed to fetch dynamically imported module: https://admin.movera.se/assets/sv-a.js?retry=2")), "https://admin.movera.se/assets/sv-a.js");
  assert.equal(failedImportUrl(new TypeError("error loading dynamically imported module: http://localhost:5173/src/i18n/sv.ts")), "http://localhost:5173/src/i18n/sv.ts");
  assert.equal(failedImportUrl(new TypeError("Importing a module script failed.")), undefined);
  assert.equal(failedImportUrl("offline"), undefined);
  assert.equal(freshUrl("https://admin.movera.se/assets/sv-a.js", 1), "https://admin.movera.se/assets/sv-a.js?retry=1");
  assert.equal(freshUrl("http://localhost:5173/src/i18n/sv.ts?import", 2), "http://localhost:5173/src/i18n/sv.ts?import&retry=2");
});
