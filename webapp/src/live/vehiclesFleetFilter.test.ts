import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveAdminApi } from "./liveAdminApi.ts";
import { listQueryOf, resetLists, sameListFilter, setListQuery } from "./liveLists.ts";
import type { LiveClient } from "./session.ts";
import { OWN_CAR, inGroupOrder, showsLoadedSoFar } from "../vehicles/byFleet.ts";

/**
 * Follow-ups of admin #402 (Vehicles grouped by fleet, 2026-11-26): the Flotte filter is asked from the server
 * (GET /admin/vehicles?fleetId=), the "(loaded so far)" note shows only live while the server has more, and a column
 * sort sorts inside each group.
 */
const car = (n: number, fleetId: string | null) => ({ vehicleId: `V${n}`, plate: `P${n}`, status: "approved", year: 2022, seats: 4, make: "Volvo", model: "V60", categoryIds: [], documents: [], driverId: null, fleetId, zoneId: "Z001", country: "SE" });

function server(pageSize = 50) {
  const cars = [car(1, "F1"), car(2, "F2"), car(3, null), car(4, "F1")];
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
      if (route !== "/admin/vehicles") return { items: [], nextCursor: null };
      const fleet = q.get("fleetId");
      const items = fleet ? cars.filter((row) => row.fleetId === fleet) : cars;
      return { items: items.slice(0, pageSize), nextCursor: items.length > pageSize ? "next" : null, total: items.length };
    },
    post: async () => ({}), put: async () => ({}), del: async () => ({}),
  } as unknown as LiveClient;
  return { client, reads };
}

test("the Flotte filter goes to the server as ?fleetId= and only that fleet's cars come back", async () => {
  resetLists();
  const { client, reads } = server();
  setListQuery("vehicles", { fleetId: "F1", pages: 1 });
  const rows = await createLiveAdminApi(client).list("vehicles", null);
  assert.deepEqual(rows.map((row) => row.id).sort(), ["V1", "V4"]);
  assert.ok(reads.some((path) => path.startsWith("/admin/vehicles?") && path.includes("fleetId=F1")));
  setListQuery("vehicles", { fleetId: undefined });
  await createLiveAdminApi(client).list("vehicles", null);
  assert.ok(!reads.at(-1)!.includes("fleetId="), "all fleets: no fleetId");
  resetLists();
});

test("a new fleet is a new filter: the old count is not kept next to it", () => {
  const base = { q: "", status: "", pages: 1, hasMore: false };
  assert.equal(sameListFilter({ ...base, fleetId: "F1" }, { ...base, fleetId: "F1" }), true);
  assert.equal(sameListFilter({ ...base, fleetId: "F1" }, { ...base, fleetId: "F2" }), false);
  assert.equal(sameListFilter({ ...base }, { ...base, fleetId: "" }), true);
});

test('"(loaded so far)": live with more pages on the server only', async () => {
  resetLists();
  const { client } = server(2);
  await createLiveAdminApi(client).list("vehicles", null);
  assert.equal(listQueryOf("vehicles").hasMore, true);
  assert.equal(showsLoadedSoFar(true, listQueryOf("vehicles").hasMore), true);
  assert.equal(showsLoadedSoFar(true, false), false);
  assert.equal(showsLoadedSoFar(false, true), false, "the demo has every car");
  resetLists();
});

test("a column sort sorts inside each group; groups keep their order, unknown groups last", () => {
  // Rows as the column sort left them (plate Z→A), each with its group.
  const sorted = [{ plate: "Z", g: OWN_CAR }, { plate: "Y", g: "F1" }, { plate: "X", g: "F2" }, { plate: "W", g: "F1" }, { plate: "V", g: "F9" }, { plate: "U", g: OWN_CAR }];
  const out = inGroupOrder(sorted, (row) => row.g, ["F1", "F2", OWN_CAR]);
  assert.deepEqual(out.map((row) => row.plate), ["Y", "W", "X", "Z", "U", "V"]);
});
