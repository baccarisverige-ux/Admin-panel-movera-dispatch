import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RIDER_SWITCHES } from "../config/book.ts";
import { CONTRACT_VERSION } from "../domain/contract.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { riderRecord, tripFacts } from "./liveAdminApi.ts";
import type { Rider, Trip } from "./types.ts";

/**
 * Contract v0.18.175 (contract.json#pinPerZone; owner 2026-11-28, Rules plan/PLAN-0.18.175-pin-per-zone.md §3 / A3):
 * the trip page says why a trip needs a PIN (Zone / Rider's choice / Both), the rider page shows the rider's own
 * "PIN on all rides" (read-only), the old Settings "PIN" switch stays, relabelled, and its info says it decides nothing.
 * Fails on main (no pin.source, no pinAlways, label "PIN", copy 0.18.172).
 */
const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const CONFIG_PAGE = readFileSync(new URL("../pages/ConfigPage.tsx", import.meta.url), "utf8");
const SETTING_INFO = readFileSync(new URL("../ui/settingInfo/settings.ts", import.meta.url), "utf8");
const TRIP_PAGE = readFileSync(new URL("../pages/TripPage.tsx", import.meta.url), "utf8");
const RIDER_PAGE = readFileSync(new URL("../pages/RiderDetailPage.tsx", import.meta.url), "utf8");

const trip = (extra: Partial<Trip>): Trip => ({ tripId: "trp_1", status: "arrived", version: 3, zoneId: "Z001", categoryId: "economy", kind: "live", pickup: { address: "A", lat: 59.3, lng: 18 }, dropoff: { address: "B", lat: 59.31, lng: 18.01 }, stops: [], fare: { amountMinor: 10000, currency: "SEK" }, paymentMethod: "cash", updatedAt: "2026-11-28T10:00:00Z", ...extra }) as unknown as Trip;
const rider = (extra: Partial<Rider>): Rider => ({ riderId: "rdr_1", firstName: "Anna", phone: "+46700000000", status: "active", version: 2, outstanding: null, ...extra }) as unknown as Rider;

test("the admin carries contract 0.18.175 (pinPerZone)", () => {
  assert.equal(C.version, "0.18.175");
  assert.equal(CONTRACT_VERSION, C.version);
  assert.deepEqual(C.pinPerZone.sources, ["zone", "rider", "both"]);
});

test("trip facts: pin.source from TripProjection.pinSource; an older server (none) reads Zone", () => {
  for (const source of ["zone", "rider", "both"] as const) {
    assert.equal(tripFacts(trip({ pinRequired: true, pickupPin: "0420", pinVerified: false, pinSource: source })).pin?.source, source);
  }
  assert.equal(tripFacts(trip({ pinRequired: true, pickupPin: "0420" })).pin?.source, "zone");
  assert.equal(tripFacts(trip({ pinRequired: false })).pin, null);
  assert.match(TRIP_PAGE, /data-testid="trip-pin-source"/);
  assert.match(TRIP_PAGE, /tr\("Rider's choice"\)/);
});

test("rider page: Rider.safety.pinAlways is read (null from an older server), shown read-only", () => {
  assert.equal(riderRecord(rider({ safety: { pinAlways: true } })).liveRider?.pinAlways, true);
  assert.equal(riderRecord(rider({ safety: { pinAlways: false } })).liveRider?.pinAlways, false);
  assert.equal(riderRecord(rider({})).liveRider?.pinAlways, null);
  assert.match(RIDER_PAGE, /data-testid="rider-pin-always"/);
  assert.doesNotMatch(RIDER_PAGE, /pinAlways[^\n]*CommandButton/, "the admin does not change the rider's choice");
});

test("Settings: the old PIN switch stays (Rule 21), relabelled, read-only, and its info says it decides nothing", () => {
  const pin = RIDER_SWITCHES.find((item) => item.id === "pin");
  assert.ok(pin, "kept, not deleted");
  assert.equal(pin.label, "PIN (old — set per zone in Dispatch › Safety)");
  assert.match(CONFIG_PAGE, /item\.id === "pin"[\s\S]{0,400}data-testid="config-switch-old-pin"/);
  assert.match(SETTING_INFO, /Decides nothing since v0\.18\.175/);
});

test("texts sv / fr / en as the owner approved (plan A7)", () => {
  const key = "PIN (old — set per zone in Dispatch › Safety)" as keyof typeof en;
  assert.equal(sv[key], "PIN (gammal — ställs per område i Dispatch › Säkerhet)");
  assert.equal(fr[key], "PIN (ancien — réglé par zone dans Dispatch › Sécurité)");
  assert.equal(sv["PIN on all rides: {0}" as keyof typeof en], "PIN på alla resor: {0}");
  assert.equal(fr["PIN on all rides: {0}" as keyof typeof en], "PIN sur tous les trajets : {0}");
  assert.equal(sv["Rider's choice" as keyof typeof en], "Kundens val");
  assert.equal(fr["Rider's choice" as keyof typeof en], "Choix du client");
});
