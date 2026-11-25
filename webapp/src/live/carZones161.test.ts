import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../api/httpClient.ts";
import { createLiveAdminApi, vehicleRecord } from "./liveAdminApi.ts";
import { listQueryOf, resetLists } from "./liveLists.ts";
import { carCountryOf, carHasNoCountry } from "../vehicles/rules.ts";
import type { LiveClient } from "./session.ts";
import type { Driver, Vehicle } from "./types.ts";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { alertsFromServer, kindDef } from "../alerts/engine.ts";
import { en } from "../i18n/en.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";

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

test("v0.18.161 review S1: a server before v0.18.161 ignores the filter and sends no zoneId → the old zoneless pass, no count", async () => {
  resetLists();
  const rows = [car(1, undefined, undefined), { ...car(2, undefined, undefined), driverId: "D9" }];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1", role: "super", scope: { zones: "all" } }),
    subscribe: () => () => undefined,
    // The old server: unknown keys ignored, every row of the scope, a whole-scope total.
    json: async (path: string) => (path.startsWith("/admin/vehicles") ? { items: rows, nextCursor: null, total: 99 } : path.startsWith("/admin/drivers") ? { items: [sweDriver], nextCursor: null } : { items: [], nextCursor: null }),
    post: async () => ({}), put: async () => ({}), del: async () => ({}),
  } as unknown as LiveClient;
  const cars = await createLiveAdminApi(client).list("vehicles", ["Z001"]);
  // V1: the old guess (its driver's first zone Z001); V2: no driver known, no zone → kept by the old zoneless pass.
  assert.deepEqual(cars.map((row) => row.id).sort(), ["V1", "V2"]);
  assert.equal((listQueryOf("vehicles" as never) as { total?: number }).total, undefined, "the whole-scope count is never shown");
  resetLists();
});

test("v0.18.161 owner \"Show as errors\": a car with no country is an error; the car_no_country alert kind matches the contract; texts sv/fr", () => {
  const drivers = new Map([["D1", sweDriver]]);
  const lost = vehicleRecord(car(4, null, null) as unknown as Vehicle, drivers);
  assert.equal(carHasNoCountry(lost), true);
  assert.equal(carHasNoCountry(vehicleRecord(car(2, "FR-PC", "FR") as unknown as Vehicle, drivers)), false);
  assert.equal(carHasNoCountry(vehicleRecord(car(5, undefined, undefined) as unknown as Vehicle, drivers)), false, "an older server: no error claimed");
  const C = contract as unknown as { alertDesk: { kindGroups: Record<string, string>; serverDetection: { kindDefaults: Record<string, { level: string }> } } };
  const kind = kindDef("car_no_country");
  assert.ok(kind);
  assert.equal(kind.group, C.alertDesk.kindGroups["car_no_country"]);
  assert.equal(kind.level, C.alertDesk.serverDetection.kindDefaults["car_no_country"]!.level);
  const key = "Error: this car has no country. Check what happened.";
  assert.equal((en as Record<string, string>)[key], key);
  assert.equal((sv as Record<string, string>)[key], "Fel: bilen har inget land. Kontrollera vad som hänt.");
  assert.equal((fr as Record<string, string>)[key], "Erreur : cette voiture n'a pas de pays. Vérifiez ce qui s'est passé.");
  assert.ok((sv as Record<string, string>)["Car with no country: {0}"]);
});

test("v0.18.161 review S-c: the car_no_country alert opens the car page", () => {
  const [alert] = alertsFromServer([{ alertId: "a1", kind: "car_no_country", level: "important", title: "Car with no country: NC 1", since: "2026-11-25T10:00:00Z", state: "open", country: "SE", ref: { vehicleId: "veh_nc_1", driverId: "D1" } }], []);
  assert.equal(alert?.path, "/vehicles/veh_nc_1");
});
