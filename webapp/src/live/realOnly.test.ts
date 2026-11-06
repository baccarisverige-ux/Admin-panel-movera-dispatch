import assert from "node:assert/strict";
import test from "node:test";
import type { Driver, Vehicle } from "./types.ts";
import { vehicleRecord } from "./liveAdminApi.ts";
import { setLiveData } from "./realData.ts";
import { driverOps, emptyDriverOpsBook, vehicleOps } from "../drivers/ops.ts";
import { activateEmphasised, carFuelShown, driverHistoryShown, driverCategoryFits, rankDriversInsights, vehicleRuleFitCounts, workDemoNoteShown } from "./realOnly.ts";

/**
 * L-a admin round 1 (A15 sweep items 3, 6, 7; rule 36, proven on a live build 2026-11-05 with a mocked server):
 * - Vehicle page: a car the server sent WITHOUT fuel read "4 seats · hybrid" (vehicleOps made the fuel up).
 * - Driver page, Categories: "Electric · vehicle does not fit" from that made-up fuel.
 * - Driver page, Activity › History: "Application created · Identity imported into onboarding" (driverOps seed).
 * - Dashboard › Insights: the ranking ran on driverOps + demo driverPerformance and set the card label
 *   "This week (no trips yet in this period)" from demo trips.
 * Live, only server values are used; nothing the server did not send is shown.
 */
const car = (extra: Record<string, unknown> = {}) =>
  ({ vehicleId: "veh_shot1", make: "Volvo", model: "V60", year: 2021, color: "black", plate: "ABC123", seats: 4, categoryIds: [], status: "approved", version: 1, driverId: "drv_shot1", documents: [], ...extra }) as unknown as Vehicle;
const driver = { driverId: "drv_shot1", accountStatus: "active", firstName: "Sara", lastName: "Lind", country: "SE", zoneIds: ["STO"], categoryIds: [], documents: [], version: 3 } as unknown as Driver;
const records = (vehicle: Vehicle) => vehicleRecord(vehicle, new Map([[driver.driverId, driver]]));

test("L-a item 7: live car without fuel shows no fuel (vehicleOps would say hybrid)", () => {
  setLiveData(true);
  const record = records(car());
  const profile = vehicleOps(emptyDriverOpsBook(), record);
  assert.equal(profile.fuel, "hybrid", "the demo helper still makes the fuel up; the page must not use it live");
  assert.equal(carFuelShown(record, profile), null);
  assert.equal(carFuelShown(records(car({ fuel: "electric" })), profile), "electric");
  setLiveData(false);
  assert.equal(carFuelShown(record, profile), "hybrid", "demo unchanged");
});

test("L-a item 7: live driver categories fit only from the server's Vehicle.fitCategories", () => {
  setLiveData(true);
  const none = records(car());
  assert.equal(driverCategoryFits(none, "electric", false), null, "server sent nothing: no 'does not fit' claim");
  const sent = records(car({ fitCategories: ["economy", "electric"] }));
  assert.equal(driverCategoryFits(sent, "electric", false), true);
  assert.equal(driverCategoryFits(sent, "xl", true), false);
  assert.equal(driverCategoryFits(null, "economy", true), false, "no car: nothing fits");
  setLiveData(false);
  assert.equal(driverCategoryFits(none, "electric", false), false, "demo unchanged");
});

test("L-a item 6: live driver History never shows the seeded demo lines", () => {
  setLiveData(true);
  const ops = driverOps(emptyDriverOpsBook(), { id: "drv_shot1", name: "Sara Lind", fleetId: null, status: "active" });
  assert.deepEqual(ops.activity, ["Application created", "Identity imported into onboarding"]);
  assert.equal(driverHistoryShown(ops), null);
  setLiveData(false);
  assert.deepEqual(driverHistoryShown(ops), ops.activity, "demo unchanged");
});

test("L-a item 3: the Insights driver ranking is not worked out from demo data live", () => {
  setLiveData(true);
  assert.equal(rankDriversInsights("insights"), false);
  setLiveData(false);
  assert.equal(rankDriversInsights("insights"), true);
  assert.equal(rankDriversInsights("overview"), false);
});

/**
 * L-a admin round 2 (boss answers 2026-11-06, decisions/driver-g15.md; rule 36, proven on main with a mocked live server):
 * - Vehicles › Vehicle rules "N cars fit" (FleetPage :126) counted from vehicleOps' made-up year/seats/fuel, so a car
 *   the server sent without fitCategories counted as fitting.
 * - Driver page Activate (DriverDetailPage :310) was emphasised from the seeded driverOps documents, not the server's.
 * - Reports › Work: "Rows marked Demo are example history" showed live, where there are no demo rows.
 */
test("L-a2 answer 1: live 'N cars fit' counts only the server's Vehicle.fitCategories", () => {
  setLiveData(true);
  const without = records(car());
  const sent = records(car({ vehicleId: "veh_shot2", fitCategories: ["economy", "electric"] }));
  const counts = vehicleRuleFitCounts([without, sent]);
  assert.deepEqual(counts, { economy: 1, electric: 1 }, "the car without fitCategories fits nothing");
  assert.equal(vehicleRuleFitCounts([without])?.economy ?? 0, 0);
  setLiveData(false);
  assert.equal(vehicleRuleFitCounts([without, sent]), null, "demo unchanged (the page's own rule check)");
});

test("L-a2 answer 2: live Activate emphasis follows the server's driver documents", () => {
  setLiveData(true);
  const docs = (status: string) => [{ documentId: "d1", type: "driver_license", status }];
  const rec = (status: string) => ({ liveAccount: { accountStatus: "pending", documents: docs(status), requiredDocuments: ["driver_license"] } }) as never;
  assert.equal(activateEmphasised(rec("approved"), false), true, "server says approved: emphasised even if seed says not");
  assert.equal(activateEmphasised(rec("in_review"), true), false, "server says in review: not emphasised even if seed says green");
  assert.equal(activateEmphasised({ liveAccount: { accountStatus: "pending", documents: [], requiredDocuments: ["driver_license"] } } as never, true), false, "missing required paper");
  setLiveData(false);
  assert.equal(activateEmphasised(rec("in_review"), true), true, "demo unchanged (seeded documents)");
});

test("L-a2 answer 3: the Work tab demo-rows note is hidden live", () => {
  setLiveData(true);
  assert.equal(workDemoNoteShown(), false);
  setLiveData(false);
  assert.equal(workDemoNoteShown(), true);
});
