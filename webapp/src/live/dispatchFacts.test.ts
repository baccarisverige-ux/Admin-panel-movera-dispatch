import assert from "node:assert/strict";
import test from "node:test";
import { autoOfflineRows, missedText, driverFactsPath, parseDriverFacts, parseDriverFactsList, yesNoOrDash } from "./dispatchFacts.ts";
import { DASH, orDash } from "./driverFacts.ts";

/** Owner 2026-11-04 (contract v0.18.21 §45): the Dispatch page shows the server's driver facts, "—" for null. */

test("the path is the zone's driver-facts read", () => {
  assert.equal(driverFactsPath("SE-STO 1"), "/admin/zones/SE-STO%201/driver-facts");
});

test("a server row is read as sent; a fact not tracked yet stays null (shown as —)", () => {
  const row = parseDriverFacts({ driverId: "drv_1", zoneId: "Z001", state: "free", rating: 4.82, acceptancePct: 91, cancelPct: null, idleMin: 7, categoryIds: ["economy"], missedInRow: 2, ridesThisHour: 1, restNeeded: false, finishingInMin: null, queuePos: null, female: null });
  assert.ok(row);
  assert.equal(row.rating, 4.82);
  assert.equal(row.cancelPct, null);
  assert.equal(orDash(row.cancelPct), DASH);
  assert.equal(orDash(row.queuePos), DASH);
  assert.equal(yesNoOrDash(row.female, "Yes", "No"), DASH);
  assert.equal(yesNoOrDash(row.restNeeded, "Yes", "No"), "No");
  // Missing fields are null, never a made-up default.
  const bare = parseDriverFacts({ driverId: "drv_2", zoneId: "Z001" });
  assert.ok(bare);
  for (const key of ["rating", "acceptancePct", "cancelPct", "idleMin", "missedInRow", "ridesThisHour", "restNeeded", "skipsInRow"] as const) assert.equal(bare[key], null, key);
  assert.deepEqual(parseDriverFactsList({ items: [{ driverId: "x", zoneId: "Z" }, { bad: true }] }).map((r) => r.driverId), ["x"]);
  assert.deepEqual(parseDriverFactsList(null), []);
});

test("auto-offline alert never fires on a null fact, nor with the switch off", () => {
  const facts = [
    { id: "a", name: "A", zoneId: "Z1", noInRow: 10 },
    { id: "b", name: "B", zoneId: "Z1", noInRow: null },
    { id: "c", name: "C", zoneId: "Z1", noInRow: 3 },
    { id: "d", name: "D", zoneId: "Z2", noInRow: 12 },
  ];
  const rows = autoOfflineRows(facts, (zone) => (zone === "Z1" ? 10 : null));
  assert.deepEqual(rows, [{ driverId: "a", driver: "A", zoneId: "Z1", count: 10 }]);
});

test("missed in a row: the true count, 50+ at the server cap, — when null", () => {
  assert.equal(missedText(5), "5");
  assert.equal(missedText(50), "50+");
  assert.equal(missedText(null), DASH);
});
