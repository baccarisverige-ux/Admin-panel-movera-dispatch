/**
 * v0.18.172 (contract.json#preferredAreas; owner 2026-11-27/28, title "Favourite areas"): Zone › Favourite areas
 * (GET /admin/areas zones.read, PATCH /admin/areas/{areaId} zones.edit), the setting DriverAppConfig.reservations.
 * preferredAreasMax (1..30, default 10) published through appConfigs.ts, and Driver › Favourite areas.
 * Rule 36: fails on main (no src/zones/areas.ts, no preferredAreasMax, contract copy 0.18.171).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";
import { appConfigState, driverAppConfig } from "../config/appConfigs.ts";
import { liveRules, publish } from "../dispatch/rules.ts";
import { BOOKING_LIMITS, BOOKING_WINDOW_DEFAULT, completeBookingWindow } from "../dispatch/rules/model.ts";
import { reservationOfDriverDoc } from "./dispatchDoc.ts";
import { driverRecord } from "./liveAdminApi.ts";
import { AREA_KIND_LABEL, DERIVED_LABEL, NO_PREFERRED_AREAS, areaErrorText, areaPatch, areasPath, preferredAreasText, readAreas, saveArea, type AdminArea } from "../zones/areas.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const OPENAPI = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");
const NOW = "2026-11-28T10:00:00Z";
const max = (doc: Record<string, unknown>) => (doc["reservations"] as Record<string, unknown>)["preferredAreasMax"];
const sodermalm: AdminArea = { areaId: "SE-SDO-SODERMALM", name: "Södermalm", officialName: "Södermalm", nameOverride: null, kind: "stadsdelsomrade", zoneId: "Z001", country: "SE", parentName: "Stockholm", derived: true, source: "SCB RegSO 2025", licence: "CC0", sourceYear: 2025, active: true };

test("the admin carries contract 0.18.172 with the area routes and permissions", () => {
  assert.equal(C.version, "0.18.172");
  assert.equal(CONTRACT_VERSION, C.version);
  assert.equal(C.configDefaults.reservations.preferredAreasMax, 10);
  assert.match(C.preferredAreas.admin, /zones\.read/);
  assert.match(OPENAPI, /operationId: adminListAreas\n[\s\S]*?x-permission: zones\.read/);
  assert.match(OPENAPI, /operationId: adminUpdateArea\n[\s\S]*?x-permission: zones\.edit/);
});

test("setting: default 10, 1..30, published in DriverAppConfig.reservations; a zone's own value to that zone only", () => {
  assert.equal(BOOKING_WINDOW_DEFAULT.preferredAreasMax, C.configDefaults.reservations.preferredAreasMax);
  assert.deepEqual(BOOKING_LIMITS.preferredAreasMax, { min: 1, max: 30 });
  for (const bad of [0, 31, "5", null]) assert.equal(completeBookingWindow({ preferredAreasMax: bad }).preferredAreasMax, 10, String(bad));
  const base = appConfigState({ now: NOW });
  for (const zoneId of ["Z001", "FR-PC"]) assert.equal(max(driverAppConfig(zoneId, base)), 10, zoneId);
  const zone = liveRules(base.dispatch, "Z001");
  const next = { ...zone, reservation: { ...zone.reservation, booking: { ...zone.reservation.booking, preferredAreasMax: 4 } } };
  const published = publish(base.dispatch, { Z001: next }, {}, ["Z001"], "nora", "2026-11-28T09:30:00.000Z", "");
  assert.ok(!published.error, published.error ?? "");
  assert.equal(max(driverAppConfig("Z001", { ...base, dispatch: published.book })), 4);
  assert.equal(max(driverAppConfig("FR-PC", { ...base, dispatch: published.book })), 10, "only that zone");
  assert.equal(reservationOfDriverDoc({ preferredAreasMax: 7 }, zone.reservation, zone).booking.preferredAreasMax, 7);
});

test("areas: paths, PATCH body only what changed, empty name clears the override, errors", async () => {
  assert.equal(areasPath("Z001", " söd ", null), "/admin/areas?zoneId=Z001&q=s%C3%B6d");
  assert.equal(areasPath("FR-PC", "", "FR-C-91326"), "/admin/areas?zoneId=FR-PC&cursor=FR-C-91326");
  assert.equal(areaPatch(sodermalm, { active: true }), null);
  assert.deepEqual(areaPatch(sodermalm, { active: false }), { active: false });
  assert.deepEqual(areaPatch(sodermalm, { name: "Söder" }), { nameOverride: "Söder" });
  assert.deepEqual(areaPatch({ ...sodermalm, name: "Söder", nameOverride: "Söder" }, { name: " " }), { nameOverride: null });
  assert.equal(areaPatch(sodermalm, { name: "Södermalm" }), null);
  const calls: string[] = [];
  const http = { json: async <T>(p: string) => (calls.push(`GET ${p}`), { items: [sodermalm], nextCursor: null } as T), patch: async <T>(p: string, b: unknown) => (calls.push(`PATCH ${p} ${JSON.stringify(b)}`), { ...sodermalm, active: false } as T) };
  assert.equal((await readAreas(http, "Z001")).items[0]!.areaId, "SE-SDO-SODERMALM");
  assert.equal((await saveArea(http, "SE-SDO-SODERMALM", { active: false })).active, false);
  assert.deepEqual(calls, ["GET /admin/areas?zoneId=Z001", 'PATCH /admin/areas/SE-SDO-SODERMALM {"active":false}']);
  assert.equal(areaErrorText({ status: 403, reason: "zone_out_of_scope" }), "This zone is outside your scope.");
  assert.equal(areaErrorText({ status: 403, reason: "missing_permission" }), "You need the right to edit zones.");
});

test("driver detail: Favourite areas from Driver.preferredAreas, else the whole-zone text", () => {
  const rec = driverRecord({ accountStatus: "active", zoneIds: ["Z001"], categoryIds: [], documents: [], version: 1, onlineStatus: "offline", driverId: "drv_1", firstName: "Ali", preferredAreaIds: ["SE-SDO-SODERMALM", "SE-K-0184"], preferredAreas: [{ areaId: "SE-SDO-SODERMALM", name: "Södermalm" }, { areaId: "SE-K-0184", name: "Solna" }] } as never);
  const facts = (rec as unknown as { liveDriver?: { preferredAreas?: { name: string }[] } }).liveDriver;
  assert.equal(preferredAreasText(facts?.preferredAreas), "Södermalm, Solna");
  assert.equal(preferredAreasText([]), null);
  assert.equal(preferredAreasText(undefined), null);
});

test("texts (owner title 'Favourite areas') in sv, fr and en", () => {
  const EN = en as Record<string, string>, FR = fr as Record<string, string>, SV = sv as Record<string, string>;
  assert.equal(SV["Favourite areas"], "Favoritområden");
  assert.equal(FR["Favourite areas"], "Zones favorites");
  assert.equal(EN["Favourite areas"], "Favourite areas");
  for (const key of [NO_PREFERRED_AREAS, DERIVED_LABEL, ...Object.values(AREA_KIND_LABEL), "Favourite areas per driver, at most"]) {
    assert.ok(EN[key] && FR[key] && SV[key], key);
  }
});
