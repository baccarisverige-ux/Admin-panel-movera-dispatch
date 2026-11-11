import assert from "node:assert/strict";
import test from "node:test";
import { presenceRecord } from "../live/liveAdminApi.ts";
import { setLiveData } from "../live/realData.ts";
import type { LiveDriverRow } from "../live/types.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { liveDrivers, panelStatus, tripChipLabel } from "./live.ts";

/**
 * Contract v0.18.65 §86 (owner phone test 2026-11-11, "if he turn radar off while on trip do offers stop"): an on-trip
 * driver who stopped next trips on his trip sheet's radar is shown "Next trips off" on the live map / driver panel and
 * the driver page. "Going offline after trips" wins (it stops every offer). No admin setting.
 */
const row = (extra: Partial<LiveDriverRow>): LiveDriverRow => ({ driverId: "drv_1", firstName: "Anna", onlineStatus: "on_trip", stale: false, location: { lat: 59.33, lng: 18.06, measuredAt: new Date().toISOString() }, lastFixAt: new Date().toISOString(), zoneId: "Z001", activeTripId: "trp_1", ...extra });

test("§85: an on-trip driver with nextTripsOff shows 'Next trips off'; going offline wins; none without", () => {
  setLiveData(true);
  const [off] = liveDrivers([presenceRecord(row({ nextTripsOff: true }))], [], [], [], 0);
  assert.equal(off!.nextTripsOff, true);
  assert.equal(tripChipLabel(off!), "Next trips off");
  assert.equal(panelStatus(off!, "On trip", " · live").chip, "Next trips off");
  const [both] = liveDrivers([presenceRecord(row({ nextTripsOff: true, offlineAfterTrip: true }))], [], [], [], 0);
  assert.equal(tripChipLabel(both!), "Going offline after trips");
  const [plain] = liveDrivers([presenceRecord(row({}))], [], [], [], 0);
  assert.equal(tripChipLabel(plain!), null);
  // Off a trip the flag means nothing.
  const [free] = liveDrivers([presenceRecord(row({ onlineStatus: "online", activeTripId: undefined, nextTripsOff: true }))], [], [], [], 0);
  assert.equal(free?.nextTripsOff ?? false, false);
  setLiveData(false);
});

test("§85: the label is translated (sv / fr)", () => {
  const key = "Next trips off" as keyof typeof en;
  assert.equal(en[key], "Next trips off");
  assert.equal(sv[key as keyof typeof sv], "Nästa resor av");
  assert.equal(fr[key as keyof typeof fr], "Courses suivantes désactivées");
});
