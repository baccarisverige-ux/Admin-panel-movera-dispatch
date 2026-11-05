import assert from "node:assert/strict";
import test from "node:test";
import type { Driver } from "../live/types.ts";
import { driverRecord } from "../live/liveAdminApi.ts";
import { setLiveData } from "../live/realData.ts";
import { candidatesFor, type RideRequest } from "./riders.ts";
import type { LiveDriver } from "./live.ts";
import { driverPanelText, liveAllowedCategories, liveDriverInfo } from "./liveDriverInfo.ts";

/**
 * A15 (rule 36, proven 2026-11-05): in live mode the live-map driver panel showed 4.73 / 83% · 3% made up from the
 * id digits (driverOps) and seeded categories. Live, every number comes from the server, and null shows "—".
 */
const server = (driverId: string, extra: Record<string, unknown> = {}) =>
  ({ driverId, accountStatus: "active", onlineStatus: "online", firstName: "Sara", lastName: "Lind", zoneIds: ["STO"], categoryIds: [], documents: [], version: 3, rating: 4.9, ...extra }) as unknown as Driver;
const perf = { performance: { acceptancePct: 61, cancellationPct: 9, rating: 4.9 } };
const ctx = { fleet: null, account: "Active" };

test("A15: live panel shows the server rating, rates and categories, and — for today", () => {
  setLiveData(true);
  const text = driverPanelText(liveDriverInfo(driverRecord(server("drv_shot1", perf)), ctx));
  assert.equal(text.rating, "4.90");
  assert.equal(text.rates, "61% · 9%");
  assert.equal(text.categories, null, "no category -> 'No category allowed'");
  assert.equal(text.today, "—");
  assert.equal(text.online, "—");
});

test("A15: performance null or missing shows —, never 4.73 / 83 / 3", () => {
  setLiveData(true);
  for (const extra of [{}, { performance: null }, { performance: { acceptancePct: null, cancellationPct: null, rating: null } }, { rating: null }]) {
    const text = driverPanelText(liveDriverInfo(driverRecord(server("drv_shot1", { rating: null, ...extra })), ctx));
    assert.equal(text.rating, "—");
    assert.equal(text.rates, "— · —");
    assert.doesNotMatch(JSON.stringify(text), /4\.73|83|\b3%/);
  }
});

test("A15: no number depends on the id digits (drv_shot1 and drv_shot7 with the same data)", () => {
  setLiveData(true);
  const one = liveDriverInfo(driverRecord(server("drv_shot1", { ...perf, categoryIds: ["comfort"] })), ctx);
  const seven = liveDriverInfo(driverRecord(server("drv_shot7", { ...perf, categoryIds: ["comfort"] })), ctx);
  assert.deepEqual(one, seven);
  assert.deepEqual(one.categories, ["Comfort"]);
});

test("A15: live category gate uses the server categoryIds, not the seed", () => {
  setLiveData(true);
  const none = driverRecord(server("drv_shot1"));
  const comfort = driverRecord(server("drv_shot2", { categoryIds: ["comfort"] }));
  assert.deepEqual(liveAllowedCategories(none), []);
  assert.deepEqual(liveAllowedCategories(comfort), ["comfort"]);
  const drivers = [{ id: "drv_shot1", state: "free", lat: 59.33, lng: 18.06 }, { id: "drv_shot2", state: "free", lat: 59.4, lng: 18.1 }] as unknown as LiveDriver[];
  const request = { at: [59.33, 18.06], category: "economy" } as unknown as RideRequest;
  const records = new Map([[none.id, none], [comfort.id, comfort]]);
  const gate = (id: string) => liveAllowedCategories(records.get(id));
  assert.deepEqual(candidatesFor(request, drivers, gate).map((c) => c.categoryOk), [false, false], "seed would allow economy for drv_shot1");
  assert.deepEqual(candidatesFor({ ...request, category: "comfort" }, drivers, gate).find((c) => c.driver.id === "drv_shot2")?.categoryOk, true);
});
