import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { tripFacts } from "./liveAdminApi.ts";
import { currentStopOf, stopVisitsOf, stoppedMinutes } from "./stopVisits.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

/**
 * Job C9b (contract v0.18.108 §93, contract.json#autoArrive.stops; owner 2026-11-02 "At the pickup AND at stops",
 * Rules decisions/driver-g7.md:84): the same two distances apply at middle stops; the trip page and the live trip card
 * show the server's stop facts (arrived automatic / tapped, left, away since, stopped in all), never worked out here.
 */
const NOW = "2026-11-14T10:00:00Z";
const trip = (stops: unknown[], stopVisits?: unknown[]) => ({
  tripId: "trp_c9b", status: "in_trip", version: 7, zoneId: "Z001", currency: "SEK", kind: "live", riderId: "rdr_1", driverId: "drv_1",
  pickup: { lat: 59.33, lng: 18.06 }, dropoff: { lat: 59.31, lng: 18.07 }, stops, ...(stopVisits ? { stopVisits } : {}),
  categoryId: "economy", paymentMethod: "cash", fare: { amountMinor: 10000, currency: "SEK" }, createdAt: NOW, updatedAt: NOW,
});
const AT = (min: number) => `2026-11-14T10:${String(min).padStart(2, "0")}:00Z`;

test("C9b: stops[i] carries the server's visit (arrivedBy, leftAt, away.since, pausedSeconds, pauseCount) as sent", () => {
  const visits = stopVisitsOf(trip([
    { lat: 59.32, lng: 18.05, address: "A", arrivedAt: AT(1), arrivedBy: "auto", leftAt: AT(9), pausedSeconds: 240, pauseCount: 2 },
    { lat: 59.32, lng: 18.04, address: "B", arrivedAt: AT(12), arrivedBy: "tap", away: { since: AT(14) } },
    { lat: 59.32, lng: 18.03, address: "C" },
  ]) as never);
  assert.deepEqual(visits, [
    { arrivedAt: AT(1), arrivedBy: "auto", leftAt: AT(9), awaySince: null, pausedSeconds: 240, pauseCount: 2 },
    { arrivedAt: AT(12), arrivedBy: "tap", leftAt: null, awaySince: AT(14), pausedSeconds: 0, pauseCount: 0 },
    null,
  ]);
});

test("C9b: a server before v0.18.108 (no new fields) and the stopVisits mirror still read; odd values are not shown", () => {
  const old = stopVisitsOf(trip([{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }], [{ stopIndex: 0, arrivedAt: AT(2), leftAt: AT(5) }, { stopIndex: 1, arrivedAt: AT(6), arrivedBy: "auto", away: { since: AT(7) }, pausedSeconds: 60, pauseCount: 1 }]) as never);
  assert.deepEqual(old[0], { arrivedAt: AT(2), arrivedBy: null, leftAt: AT(5), awaySince: null, pausedSeconds: 0, pauseCount: 0 });
  assert.deepEqual(old[1], { arrivedAt: AT(6), arrivedBy: "auto", leftAt: null, awaySince: AT(7), pausedSeconds: 60, pauseCount: 1 });
  const odd = stopVisitsOf(trip([{ lat: 1, lng: 2, arrivedAt: AT(2), arrivedBy: "robot", pausedSeconds: -5, pauseCount: "2", away: { since: 3 } }]) as never);
  assert.deepEqual(odd[0], { arrivedAt: AT(2), arrivedBy: null, leftAt: null, awaySince: null, pausedSeconds: 0, pauseCount: 0 });
  assert.deepEqual(stopVisitsOf(trip([]) as never), []);
});

test("C9b: the trip facts carry the stop visits next to the stops; the open stop is the live card's", () => {
  const facts = tripFacts(trip([
    { lat: 1, lng: 2, address: "A", arrivedAt: AT(1), arrivedBy: "auto", leftAt: AT(9) },
    { lat: 1, lng: 3, address: "B", arrivedAt: AT(12), arrivedBy: "tap", away: { since: AT(14) }, pausedSeconds: 90, pauseCount: 1 },
  ]) as never);
  assert.equal(facts.stopVisits?.length, 2);
  assert.equal(facts.stopVisits?.[1]?.awaySince, AT(14));
  assert.deepEqual(currentStopOf(facts), { number: 2, visit: facts.stopVisits![1] });
  assert.equal(currentStopOf({ stopVisits: [facts.stopVisits![0], null] }), null, "a left stop and an unvisited stop: no open stop");
  assert.equal(currentStopOf({}), null);
});

test("C9b: 'Stopped in all' shows the server's paused seconds in whole minutes rounded up, as at the pickup", () => {
  assert.equal(stoppedMinutes({ pausedSeconds: 0 }), 0);
  assert.equal(stoppedMinutes({ pausedSeconds: 1 }), 1);
  assert.equal(stoppedMinutes({ pausedSeconds: 120 }), 2);
  assert.equal(stoppedMinutes({ pausedSeconds: 121 }), 3);
});

const KEYS = [
  "At the pickup and at stops: the server marks the driver arrived when he is this close; he can still tap Arrived. While he is farther than the second distance before the rider is in the car (pickup) or before the stop is done, the waiting time stops (nothing charged; at the pickup no free minutes used and no no-show) and goes on when he is back.",
  "Arrived and waiting away at stops",
  "The same distances as Waiting at pickup: the server marks the stop arrived within {0} m, and the waiting at the stop stops while the driver is more than {1} m away.",
  "Arrived {0}",
  "Left {0}",
  "Waiting stopped: driver away since {0}",
  "Stopped in all: {0} min ({1} times)",
  "At stop {0} since {1}",
] as const;

test("C9b: the new texts are in en, sv and fr (not left in English)", () => {
  for (const key of KEYS) {
    assert.equal((en as Record<string, string>)[key], key, `en has "${key}"`);
    for (const [lang, dict] of [["sv", sv], ["fr", fr]] as const) {
      const text = (dict as Record<string, string>)[key];
      assert.ok(text && text !== key, `${lang} translates "${key}"`);
    }
  }
});

test("C9b: the setting help says pickup and stops; the Stops card, the trip page stop rows and the live card use the server's facts", () => {
  const card = readFileSync(new URL("../dispatch/PickupWaitCard.tsx", import.meta.url), "utf8");
  assert.ok(card.includes(`tr("${KEYS[0]}")`), "Waiting at pickup help names the stops");
  const zone = readFileSync(new URL("../dispatch/ZoneSettings.tsx", import.meta.url), "utf8");
  assert.ok(zone.includes('data-testid="stops-auto-arrive"') && zone.includes("zone.pickupWait.autoArriveMeters") && zone.includes("zone.pickupWait.leaveMeters"), "the Stops card names the two distances");
  const page = readFileSync(new URL("../pages/TripPage.tsx", import.meta.url), "utf8");
  for (const id of ["trip-stop-arrived", "trip-stop-left", "trip-stop-away", "trip-stop-paused"]) assert.ok(page.includes(`data-testid="${id}"`), `trip page shows ${id}`);
  assert.ok(page.includes("facts?.stopVisits"), "the stop rows read the server's visits");
  const live = readFileSync(new URL("../dashboard/TripCard.tsx", import.meta.url), "utf8");
  assert.ok(live.includes('data-testid="trip-card-stop"') && live.includes('data-testid="trip-card-stop-away"'), "the live trip card shows the open stop and the stopped waiting");
});
