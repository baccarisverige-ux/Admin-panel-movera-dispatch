import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig } from "../config/appConfigs.ts";
import { rulesOfDispatch, withOwned, dispatchDocumentOf } from "../live/configDocs.ts";
import { completePickupWait, pickupWaitDefault, pickupWaitIssues } from "./offers.ts";
import { AUTO_ARRIVE_DEFAULT_METERS, AUTO_ARRIVE_RANGE, LEAVE_DEFAULT_METERS, LEAVE_RANGE, validAutoArrive } from "./offerRules.ts";
import { defaultZone } from "./rules.ts";
import { tripFacts } from "../live/liveAdminApi.ts";

/**
 * Job C9 (contract v0.18.93 §91, contract.json#autoArrive; owner 2026-11-02 review Q3 "Both: auto + button", Rules
 * decisions/driver-g7.md:83-84): Dispatch › Waiting at pickup sets, per zone, the distance where the server marks the
 * driver arrived (default 100 m) and the distance beyond which the waiting time stops (default 200 m); the trip page shows
 * how he arrived and the stopped waiting, all as the server sends it.
 */
const zone = () => defaultZone({ id: "Z001", kind: "operating" });
const NOW = "2026-11-14T10:00:00Z";

test("C9: the two distances are the contract's (100 m in 30–300, 200 m in 100–2000) and every zone starts with them", () => {
  const s = contract.autoArrive.settings;
  assert.equal(AUTO_ARRIVE_DEFAULT_METERS, 100);
  assert.equal(LEAVE_DEFAULT_METERS, 200);
  assert.deepEqual(AUTO_ARRIVE_RANGE, s.arriveMeters.range);
  assert.deepEqual(LEAVE_RANGE, s.leaveMeters.range);
  assert.equal(pickupWaitDefault("SE").autoArriveMeters, 100);
  assert.equal(pickupWaitDefault("FR").leaveMeters, 200);
  assert.equal(zone().pickupWait.autoArriveMeters, 100);
});

test("C9: they go out in the zone's driver document (DriverAppConfig.waiting) and only those two waiting keys are added", () => {
  const driver = driverAppConfig("Z001", appConfigState({ now: NOW })) as unknown as { waiting: Record<string, unknown> };
  assert.equal(driver.waiting["autoArriveMeters"], 100);
  assert.equal(driver.waiting["leaveMeters"], 200);
  const server = { version: 3, waiting: { perMin: { amountMinor: 1226, currency: "SEK" }, driverSharePct: 80 } };
  const built = { waiting: { perMin: { amountMinor: 1, currency: "SEK" }, driverSharePct: 80, driverShareWaitPct: 100, autoArriveMeters: 60, leaveMeters: 400 } };
  const next = withOwned(server, built, ["waiting"]) as { waiting: Record<string, unknown> };
  assert.equal(next.waiting["autoArriveMeters"], 60);
  assert.equal(next.waiting["leaveMeters"], 400);
  assert.deepEqual(next.waiting["perMin"], { amountMinor: 1226, currency: "SEK" }, "the waiting money stays the server's");
});

test("C9: read back from the server's driver document; a bad value or a bad pair shows the defaults (as the server reads it)", () => {
  const doc = dispatchDocumentOf(zone(), "Z001", null);
  assert.equal(rulesOfDispatch(doc, { waiting: { autoArriveMeters: 50, leaveMeters: 300 } }, zone()).pickupWait.autoArriveMeters, 50);
  assert.equal(rulesOfDispatch(doc, { waiting: { autoArriveMeters: 50, leaveMeters: 300 } }, zone()).pickupWait.leaveMeters, 300);
  const pair = rulesOfDispatch(doc, { waiting: { autoArriveMeters: 250, leaveMeters: 200 } }, zone()).pickupWait;
  assert.deepEqual([pair.autoArriveMeters, pair.leaveMeters], [100, 200]);
  const none = rulesOfDispatch(doc, { waiting: {} }, zone()).pickupWait;
  assert.deepEqual([none.autoArriveMeters, none.leaveMeters], [100, 200]);
  assert.deepEqual(validAutoArrive(100, 200), { autoArriveMeters: 100, leaveMeters: 200 });
  assert.equal(validAutoArrive(20, 200), null);
  assert.equal(validAutoArrive(100, 2500), null);
  assert.equal(validAutoArrive(99.5, 200), null);
});

test("C9: a saved zone keeps its own distances; the checks match the server's 400 invalid_auto_arrive_distance", () => {
  const base = pickupWaitDefault("SE");
  const stored = completePickupWait(base, { ...base, autoArriveMeters: 80, leaveMeters: 500 });
  assert.deepEqual([stored.autoArriveMeters, stored.leaveMeters], [80, 500]);
  const old = completePickupWait(base, { cancelAfterArrivedIsNoShow: false });
  assert.deepEqual([old.autoArriveMeters, old.leaveMeters], [100, 200], "a save from before v0.18.93 gets the defaults");
  assert.deepEqual(pickupWaitIssues(base, "SE"), []);
  assert.equal(pickupWaitIssues({ ...base, autoArriveMeters: 200, leaveMeters: 200 }, "SE").length, 1);
  assert.equal(pickupWaitIssues({ ...base, autoArriveMeters: 20 }, "FR").length, 1);
  assert.equal(pickupWaitIssues({ ...base, leaveMeters: 2500 }, "SE").length, 1);
});

test("C9: the trip page reads the server's arrival kind, the stopped waiting and the finished stops (never worked out)", () => {
  const trip = {
    tripId: "trp_c9", status: "arrived", version: 4, zoneId: "Z001", currency: "SEK", kind: "live", riderId: "rdr_1", driverId: "drv_1",
    pickup: { lat: 59.33, lng: 18.06 }, dropoff: { lat: 59.31, lng: 18.07 }, stops: [], categoryId: "economy", paymentMethod: "cash",
    fare: { amountMinor: 10000, currency: "SEK" }, createdAt: NOW, updatedAt: NOW,
    waiting: { arrivedAt: NOW, freeUntil: "2026-11-14T10:10:00Z", noShowAt: "2026-11-14T10:10:00Z", chargedSeconds: 0, arrivedBy: "auto", away: { since: "2026-11-14T10:02:00Z" }, pausedSeconds: 300, pauseCount: 1 },
  };
  const waiting = (tripFacts(trip as never) as unknown as { waiting: Record<string, unknown> | null }).waiting;
  assert.ok(waiting, "the waiting box has its facts");
  assert.equal(waiting["arrivedBy"], "auto");
  assert.equal(waiting["awaySince"], "2026-11-14T10:02:00Z");
  assert.equal(waiting["pausedSeconds"], 300);
  assert.equal(waiting["pauseCount"], 1);
});
