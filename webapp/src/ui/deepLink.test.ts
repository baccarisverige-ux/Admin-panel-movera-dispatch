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
