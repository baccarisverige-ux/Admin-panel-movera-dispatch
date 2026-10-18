import { test } from "node:test";
import assert from "node:assert/strict";
import { changeLines, draftRules, emptyDispatchBook, liveRules, publish, rulesFile, saveDraft, undoTo, zoneDefault, zoneIssues } from "./rules.ts";
import { destinationModeIssues, destinationPreview, nextTripsIssues, nextTripsPreview } from "./tripRules.ts";

const ZONE = "Z001";

test("owner defaults: 2 h, 2 per day, 5 km corridor, focus both; next trips 5 km and 10 min, all on", () => {
  const zone = zoneDefault(ZONE);
  assert.deepEqual(zone.destinationMode, { on: true, timeLimitOn: true, timeLimitHours: 2, dailyLimitOn: true, perDay: 2, corridorOn: true, corridorKm: 5, finalOn: true, onTheWayOn: true });
  assert.deepEqual(zone.nextTrips, { withinKmOn: true, withinKm: 5, withinMinOn: true, withinMin: 10 });
  assert.deepEqual(zoneIssues(zone), []);
  assert.equal(destinationPreview(zone.destinationMode), "Trips within 5 km of the route that bring the driver closer, up to 2 h, 2 per day.");
  assert.match(nextTripsPreview(zone.nextTrips), /within 5 km or 10 min of the final drop-off/);
});

test("validation: out-of-range numbers stop the save only when their part is on", () => {
  const dest = zoneDefault(ZONE).destinationMode;
  assert.equal(destinationModeIssues({ ...dest, timeLimitHours: 0 }).length, 1);
  assert.equal(destinationModeIssues({ ...dest, timeLimitHours: 13 }).length, 1);
  assert.equal(destinationModeIssues({ ...dest, perDay: 1.5 }).length, 1);
  assert.equal(destinationModeIssues({ ...dest, corridorKm: 0.5 }).length, 1);
  assert.equal(destinationModeIssues({ ...dest, finalOn: false, onTheWayOn: false }).length, 1, "a focus must be on");
  assert.equal(destinationModeIssues({ ...dest, corridorOn: false, corridorKm: 0 }).length, 0, "off part is not checked");
  assert.equal(destinationModeIssues({ ...dest, on: false, perDay: 99 }).length, 0, "nothing checked when the mode is off");
  const next = zoneDefault(ZONE).nextTrips;
  assert.equal(nextTripsIssues({ ...next, withinKm: 0 }).length, 1);
  assert.equal(nextTripsIssues({ ...next, withinMin: 61 }).length, 1);
  assert.equal(nextTripsIssues({ ...next, withinKmOn: false, withinKm: 0, withinMinOn: false, withinMin: 0 }).length, 0);
  assert.match(nextTripsPreview({ ...next, withinKmOn: false, withinMinOn: false }), /whole last leg/);
  assert.ok(zoneIssues({ ...zoneDefault(ZONE), nextTrips: { ...next, withinKm: 100 } }).length > 0, "zone save is blocked");
});

test("on/off switches survive a draft, publish and a stored round trip; older saves get the defaults", () => {
  const working = { ...zoneDefault(ZONE) };
  working.destinationMode = { ...working.destinationMode, timeLimitOn: false, onTheWayOn: false, corridorKm: 8 };
  working.nextTrips = { ...working.nextTrips, withinMinOn: false, withinKm: 3 };
  const drafted = saveDraft(emptyDispatchBook(), { [ZONE]: working }, {});
  const stored = JSON.parse(JSON.stringify(drafted));
  assert.deepEqual(draftRules(stored, ZONE).destinationMode, working.destinationMode);
  const lines = changeLines(zoneDefault(ZONE), working);
  assert.ok(lines.includes("Destination mode time limit: on → off"));
  assert.ok(lines.includes("Next trips by time to drop-off: on → off"));
  const live = publish(stored, { [ZONE]: working }, {}, [ZONE], "erik", "2026-10-18T10:00", "Test");
  assert.deepEqual(live.live, [ZONE]);
  assert.deepEqual(liveRules(live.book, ZONE).nextTrips, working.nextTrips);
  assert.ok(live.book.versions[0].lines.some((line) => line.includes("Destination corridor (km): 5 → 8")), "history line");
  const undone = undoTo(live.book, live.book.versions[0].rev, "nora", "2026-10-18T11:00");
  assert.ok(!undone.error);
  const old = { ...emptyDispatchBook(), live: { [ZONE]: { zoneId: ZONE, destinationMode: { on: false, corridorKm: "x" } } } } as never;
  assert.deepEqual(liveRules(old, ZONE).destinationMode, { ...zoneDefault(ZONE).destinationMode, on: false });
  assert.deepEqual(liveRules(old, ZONE).nextTrips, zoneDefault(ZONE).nextTrips);
});

test("the rules file gives the driver app destinationMode and nextTrips per zone", () => {
  const file = rulesFile(emptyDispatchBook(), "SE", "now");
  assert.deepEqual(file.driverApp.destinationMode[ZONE], {
    enabled: true, timeLimitOn: true, timeLimitHours: 2, dailyLimitOn: true, destinationsPerDay: 2, corridorOn: true, corridorKm: 5,
    focusFinalDestinationOn: true, focusOnTheWayOn: true, focus: "both",
  });
  assert.deepEqual(file.driverApp.nextTrips[ZONE], {
    offerTypes: ["exclusive", "exclusiveReservation"], radarOffers: false, onlyOnTheWayToFinalDropoff: true,
    withinKmOfDropoffOn: true, withinKmOfDropoff: 5, withinMinutesOfDropoffOn: true, withinMinutesOfDropoff: 10, startWhen: "either",
  });
});
