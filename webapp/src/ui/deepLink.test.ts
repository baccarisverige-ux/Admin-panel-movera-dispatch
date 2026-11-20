import assert from "node:assert/strict";
import test from "node:test";
import { restoreDeepLink, restoredPath } from "./deepLink.ts";

/** G5 admin bug: a trip link under /live/ must open the trip, not the Dashboard (GitHub Pages 404 → ?p=). */
test("the page kept in ?p= comes back under the base, with its own query and hash", () => {
  assert.equal(restoredPath("?p=%2Ftrips%2FT123", "/Admin-panel-movera-dispatch/live/"), "/Admin-panel-movera-dispatch/live/trips/T123");
  assert.equal(restoredPath("?p=%2Ftrips%2FT123%3Fscope%3DZ001%23route", "/live"), "/live/trips/T123?scope=Z001#route");
  assert.equal(restoredPath("?p=%2Friders%2FR1&country=SE", "/"), "/riders/R1?country=SE", "other start-page params ride along");
  assert.equal(restoredPath("?p=%2Ftrips%2FT1%23a%23b", "/"), "/trips/T1#a#b", "a '#' inside the hash is kept");
  assert.equal(restoredPath("?country=SE", "/"), null, "nothing to restore");
  assert.equal(restoredPath("?p=https%3A%2F%2Fevil.example", "/"), null, "never another site");
  assert.equal(restoredPath("?p=%2F%2Fevil.example", "/"), null, "never a protocol-relative URL");
});

test("restoreDeepLink replaces the URL once and says so", () => {
  const seen: string[] = [];
  assert.equal(restoreDeepLink({ search: "?p=%2Ftrips%2FT9", pathname: "/live/" }, "/live/", (url) => seen.push(url)), true);
  assert.deepEqual(seen, ["/live/trips/T9"]);
  assert.equal(restoreDeepLink({ search: "", pathname: "/live/" }, "/live/", (url) => seen.push(url)), false);
  assert.equal(seen.length, 1);
});

// Launch fix 2026-11-20 (audit admin-every-control): a wrong trip or payout link must end on "not found", never wait on
// "Loading" while a list read is still retrying.
test("a record page says not found once the record cannot be found, even while a list read still retries", async () => {
  const { recordState } = await import("./recordState.ts");
  assert.equal(recordState({ found: true, waiting: true, missing: false }), "found");
  assert.equal(recordState({ found: false, waiting: true, missing: false }), "loading");
  assert.equal(recordState({ found: false, waiting: true, missing: true }), "not-found");
  assert.equal(recordState({ found: false, waiting: false, missing: false }), "not-found");
});

test("page wiring: a retry is not 'not found'; a trip the read by id did not find waits for the list", async () => {
  const { recordPageState, tripPageState } = await import("./recordState.ts");
  assert.equal(recordPageState(false, { isLoading: true, isError: false }), "loading", "a payout read that retries stays Loading");
  assert.equal(recordPageState(false, { isLoading: false, isError: true }), "not-found");
  assert.equal(recordPageState(true, { isLoading: false, isError: false }), "found");
  const idle = { isLoading: false, isError: false, isSuccess: true, data: [] };
  const none = { isLoading: false, isError: false, isSuccess: true, data: null };
  const busy = { isLoading: true, isError: false };
  assert.equal(tripPageState({ found: false, listed: false, trips: busy, single: none, others: false }), "loading", "list still loading");
  assert.equal(tripPageState({ found: false, listed: false, trips: idle, single: none, others: false }), "not-found");
  assert.equal(tripPageState({ found: false, listed: false, trips: busy, single: { isLoading: false, isError: true }, others: false }), "not-found", "a failed read is not found at once");
  assert.equal(tripPageState({ found: true, listed: false, trips: busy, single: { ...none, data: {} }, others: false }), "found", "a trip read by id shows before the list");
  assert.equal(tripPageState({ found: true, listed: true, trips: idle, single: none, others: true }), "loading", "drivers and cars are waited for");
});
