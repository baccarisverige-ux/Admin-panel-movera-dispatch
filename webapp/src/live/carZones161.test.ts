import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../api/httpClient.ts";
import { createLiveAdminApi, vehicleRecord } from "./liveAdminApi.ts";
import { listQueryOf, resetLists } from "./liveLists.ts";
import { carCountryOf } from "../vehicles/rules.ts";
import type { LiveClient } from "./session.ts";
import type { Driver, Vehicle } from "./types.ts";

/**
 * v0.18.161 (contract.json#adminListFilters.carZones; owner 2026-11-25 "Yes, fix it": the admin mixed French and Swedish
 * cars): the admin sends the top bar's zones to GET /admin/vehicles and GET /admin/fleets, takes the car's zone and country
 * from the server (never the driver's first zone, never SE), keeps no car or fleet without a zone once a zone is picked,
 * and on an older server's 400 unknown_filter reads without the filter and filters the rows itself.
 */
const car = (n: number, zoneId: string | null | undefined, country: string | null | undefined): Record<string, unknown> => ({
  vehicleId: `V${n}`, plate: `P${n}`, status: "approved", year: 2022, seats: 4, make: "Volvo", model: "V60", categoryIds: [], documents: [], driverId: "D1",
  ...(zoneId !== undefined ? { zoneId } : {}), ...(country !== undefined ? { country } : {}),
});
const sweDriver = { driverId: "D1", firstName: "Sven", lastName: "S", accountStatus: "active", zoneIds: ["Z001"], country: "SE", documents: [] } as unknown as Driver;

function server(opts: { old?: boolean } = {}) {
  const lists: Record<string, Record<string, unknown>[]> = {
    "/admin/vehicles": [car(1, "Z001", "SE"), car(2, "FR-PC", "FR"), car(3, null, "FR"), car(4, null, null)],
    "/admin/fleets": [
      { fleetId: "F1", name: "SE", status: "approved", ownerDriverId: "D1", zoneId: "Z001", country: "SE" },
      { fleetId: "F2", name: "FR", status: "approved", ownerDriverId: "D1", zoneId: "FR-PC", country: "FR" },
    ],
    "/admin/drivers": [sweDriver as unknown as Record<string, unknown>],
  };
  const reads: string[] = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1", role: "super", scope: { zones: "all" } }),
    subscribe: () => () => undefined,
    json: async (path: string) => {
      reads.push(path);
      const [route = "", search] = path.split("?");
      const q = new URLSearchParams(search ?? "");
      const all = lists[route] ?? [];
      const zones = [q.get("zoneId"), ...(q.get("zoneIds")?.split(",") ?? [])].filter(Boolean) as string[];
      const filtered = zones.length || q.get("country");
      if (filtered && opts.old && (route === "/admin/vehicles" || route === "/admin/fleets")) throw new ApiError(400, "Unknown filter.", { code: "invalid_request", reason: "unknown_filter" });
      const country = q.get("country");
      // The new server's rule: a row with no zone is never in a filter.
      const items = filtered ? all.filter((row) => typeof row.zoneId === "string" && (!zones.length || zones.includes(row.zoneId)) && (!country || (row.zoneId as string).startsWith(country === "FR" ? "FR" : "Z"))) : all;
      return { items, nextCursor: null, total: items.length };
    },
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, reads };
}

test("v0.18.161: the car's zone and country are the server's; null is none / unknown, never the driver's or SE", () => {
  const drivers = new Map([["D1", sweDriver]]);
  const fr = vehicleRecord(car(2, "FR-PC", "FR") as unknown as Vehicle, drivers);
  assert.equal(fr.zoneId, "FR-PC");
  assert.equal(fr.liveVehicleDocs?.country, "FR");
  const none = vehicleRecord(car(4, null, null) as unknown as Vehicle, drivers);
  assert.equal(none.zoneId, "");
  assert.equal(none.liveVehicleDocs?.country, undefined);
  assert.equal(carCountryOf(none, true), null, "live: unknown, never SE");
  assert.equal(carCountryOf(fr, true), "FR");
  assert.equal(carCountryOf({ zoneId: "", liveVehicleDocs: { documents: [], required: [] } }, false), "SE", "demo keeps its old reading");
  // An older server (no zoneId / country fields): the old reading from the driver.
  const old = vehicleRecord(car(5, undefined, undefined) as unknown as Vehicle, drivers);
  assert.equal(old.zoneId, "Z001");
  assert.equal(old.liveVehicleDocs?.country, "SE");
});

test("v0.18.161: one French zone picked → zoneId sent, only French cars and fleets, none without a zone", async () => {
  resetLists();
  const { client, reads } = server();
  const api = createLiveAdminApi(client);
  const cars = await api.list("vehicles", ["FR-PC"]);
  assert.deepEqual(cars.map((row) => row.id), ["V2"]);
  assert.ok(reads.some((path) => path.startsWith("/admin/vehicles?") && path.includes("zoneId=FR-PC")));
  assert.equal((listQueryOf("vehicles" as never) as { total?: number }).total, 1);
  const fleets = await api.list("fleets", ["FR-PC"]);
  assert.deepEqual(fleets.map((row) => [row.id, row.zoneId]), [["F2", "FR-PC"]]);
  assert.ok(reads.some((path) => path.startsWith("/admin/fleets?") && path.includes("zoneId=FR-PC")));
  resetLists();
});

test("v0.18.161: an older server (400 unknown_filter) → read without the filter once, the rows filtered here, no count", async () => {
  resetLists();
  const { client, reads } = server({ old: true });
  const api = createLiveAdminApi(client);
  const cars = await api.list("vehicles", ["FR-PC"]);
  // The zoneless French car (V3) and the car with nothing (V4) are not kept; the Swedish one neither.
  assert.deepEqual(cars.map((row) => row.id), ["V2"]);
  assert.equal((listQueryOf("vehicles" as never) as { total?: number }).total, undefined);
  const before = reads.filter((path) => path.startsWith("/admin/vehicles?")).length;
  await api.list("vehicles", ["FR-PC"]);
  const again = reads.filter((path) => path.startsWith("/admin/vehicles?")).slice(before);
  assert.equal(again.length, 1, "asked once without the filter");
  assert.ok(!again[0]!.includes("zoneId="), "no filter after the first unknown_filter");
  resetLists();
});
