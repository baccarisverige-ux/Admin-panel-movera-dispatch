import assert from "node:assert/strict";
import test from "node:test";
import { presenceRecord } from "../live/liveAdminApi.ts";
import { setLiveData } from "../live/realData.ts";
import type { LiveDriverRow } from "../live/types.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { goingOfflineLabel, liveDrivers } from "./live.ts";

/**
 * Contract v0.18.37 §61 (go offline after trips, owner 2026-11-05 "No switch"): an on-trip driver who tapped Go offline
 * is shown "Going offline after trips" on the live map / driver panel and the driver page. No admin setting.
 */
const row = (extra: Partial<LiveDriverRow>): LiveDriverRow => ({ driverId: "drv_1", firstName: "Anna", onlineStatus: "on_trip", stale: false, location: { lat: 59.33, lng: 18.06, measuredAt: new Date().toISOString() }, lastFixAt: new Date().toISOString(), zoneId: "Z001", activeTripId: "trp_1", ...extra });

test("§61: a live on-trip driver with offlineAfterTrip is marked going offline; without it he is not", () => {
  setLiveData(true);
  const flagged = liveDrivers([presenceRecord(row({ offlineAfterTrip: true }))], [], [], [], 0);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0]!.goingOffline, true);
  assert.equal(goingOfflineLabel(flagged[0]!), "Going offline after trips");
  const plain = liveDrivers([presenceRecord(row({}))], [], [], [], 0);
  assert.equal(plain[0]!.goingOffline, false);
  assert.equal(goingOfflineLabel(plain[0]!), null);
  setLiveData(false);
});

test("§61: the label is translated (sv / fr)", () => {
  const key = "Going offline after trips" as keyof typeof en;
  assert.equal(en[key], "Going offline after trips");
  assert.equal(sv[key as keyof typeof sv], "Går offline efter resorna");
  assert.equal(fr[key as keyof typeof fr], "Passe hors ligne après les courses");
});
