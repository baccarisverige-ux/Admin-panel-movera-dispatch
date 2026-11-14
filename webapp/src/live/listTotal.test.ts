import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveAdminApi } from "./liveAdminApi.ts";
import { askListCount, listQueryOf, resetLists, setListQuery } from "./liveLists.ts";
import { registerDictionary, setLanguage, uiLocale } from "../i18n/core.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import type { LiveClient } from "./session.ts";

/**
 * L78-A (contract v0.18.78 adminListFilters.total; owner 2026-11-12 item 5 "Yes, build", item 109 "50 of N · Load
 * more"): the first page of an admin list may carry `total`; the list bar shows "{loaded} of {total}". Absent =
 * not counted (normal on a 0.18.78 server too): no number, never a stale one. Vehicles and fleets: the server
 * ignores zoneIds / country there (REMINDERS 60), so the count is kept only for All zones.
 */
// Loaded lazily so this file runs (and fails per case) on a base without listPages.ts.
const pages: Record<string, unknown> = await import("./listPages.ts").catch(() => ({}));
type Query = { loaded?: number; total?: number; hasMore: boolean };
const queryOf = (name: string) => listQueryOf(name as never) as unknown as Query;

const driver = (n: number) => ({ driverId: `D${n}`, firstName: `Driver${n}`, lastName: "X", accountStatus: n % 2 ? "active" : "pending", zoneIds: [n % 3 ? "Z001" : "Z002"], documents: [] });
const vehicle = (n: number) => ({ vehicleId: `V${n}`, plate: `ABC${n}`, status: "approved", year: 2020, seats: 4, make: "Volvo", model: "V60", categoryIds: [], documents: [], driverId: `D${n}` });
const fleet = (n: number) => ({ fleetId: `F${n}`, name: `Fleet ${n}`, status: "approved", ownerDriverId: `D${n}` });
const trip = (n: number) => ({ tripId: `T${n}`, riderId: `R${n}`, zoneId: "Z001", status: "completed", flagged: n % 4 === 0, fare: { amountMinor: 10000, currency: "SEK" }, createdAt: "2026-11-12T10:00:00Z", version: 1 });

/** A server: 120 drivers (+ vehicles / fleets / trips); `total` on the first page unless told otherwise. */
function fakeServer(opts: { total?: (route: string, q: URLSearchParams, count: number) => unknown } = {}) {
  const lists: Record<string, Record<string, unknown>[]> = {
    "/admin/drivers": Array.from({ length: 120 }, (_, i) => driver(i)),
    "/admin/vehicles": Array.from({ length: 70 }, (_, i) => vehicle(i)),
    "/admin/fleets": Array.from({ length: 60 }, (_, i) => fleet(i)),
    "/admin/trips": Array.from({ length: 90 }, (_, i) => trip(i)),
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
      const all = lists[route];
      if (!all) return { items: [], nextCursor: null };
      const status = q.get(route === "/admin/drivers" ? "accountStatus" : "status");
      const wanted = all.filter((row) => (!status || (row.accountStatus ?? row.status) === status) && (q.get("flagged") !== "true" || row.flagged === true));
      const from = Number(q.get("cursor") ?? 0);
      const end = from + Number(q.get("limit") ?? 50);
      const page: Record<string, unknown> = { items: wanted.slice(from, end), nextCursor: end < wanted.length ? String(end) : null };
      if (!q.get("cursor")) {
        const total = opts.total ? opts.total(route, q, wanted.length) : wanted.length;
        if (total !== undefined) page.total = total;
      }
      return page;
    },
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, reads };
}

test("L78-A: the first page's total is kept with the rows read so far (50 of 120)", async () => {
  resetLists();
  const { client } = fakeServer();
  await createLiveAdminApi(client).list("drivers", null);
  assert.equal(queryOf("drivers").total, 120);
  assert.equal(queryOf("drivers").loaded, 50);
  resetLists();
});

test("L78-A: Load more (page 2 has no total) keeps the first page's total; loaded counts the server rows", async () => {
  resetLists();
  const { client } = fakeServer({ total: (_route, q, count) => (q.get("cursor") ? undefined : count) });
  const api = createLiveAdminApi(client);
  await api.list("drivers", null);
  setListQuery("drivers", { pages: 2 });
  await api.list("drivers", null);
  assert.equal(queryOf("drivers").loaded, 100);
  assert.equal(queryOf("drivers").total, 120);
  assert.equal(queryOf("drivers").hasMore, true);
  setListQuery("drivers", { pages: 3 });
  await api.list("drivers", null);
  assert.equal(queryOf("drivers").loaded, 120);
  assert.equal(queryOf("drivers").total, 120, "120 of 120 when every row is loaded");
  assert.equal(queryOf("drivers").hasMore, false);
  resetLists();
});

test("L78-A: a first page without total clears an older total (never a stale number)", async () => {
  resetLists();
  let send = true;
  const { client } = fakeServer({ total: (_r, _q, count) => (send ? count : undefined) });
  const api = createLiveAdminApi(client);
  await api.list("drivers", null);
  assert.equal(queryOf("drivers").total, 120);
  send = false;
  // A6 (v0.18.83): only a read the list page asked for is counted (a plain reload sends total=false and keeps 120).
  askListCount("drivers");
  await api.list("drivers", null);
  assert.equal(queryOf("drivers").total, undefined);
  assert.equal(queryOf("drivers").loaded, 50);
  resetLists();
});

test("L78-A: a new search / status / flagged filter drops the old count at once; Load more keeps it", () => {
  resetLists();
  for (const patch of [{ status: "active" }, { q: "anna" }, { flagged: true }]) {
    setListQuery("trips", { total: 90, loaded: 50 } as never);
    setListQuery("trips", { pages: 2 });
    assert.equal(queryOf("trips").total, 90, "pages only: kept");
    setListQuery("trips", patch);
    assert.equal(queryOf("trips").total, undefined, JSON.stringify(patch));
    assert.equal(queryOf("trips").loaded, undefined, JSON.stringify(patch));
    resetLists();
  }
});

test("L78-A: a total that is not a whole number >= 0 is ignored", async () => {
  for (const bad of [-1, "12", 1.5, null, Number.NaN]) {
    resetLists();
    const { client } = fakeServer({ total: () => bad });
    await createLiveAdminApi(client).list("drivers", null);
    assert.equal(queryOf("drivers").total, undefined, String(bad));
  }
  resetLists();
});

test("L78-A: vehicles / fleets keep the count only for All zones (the server ignores the zone pick there)", async () => {
  for (const name of ["vehicles", "fleets"]) {
    resetLists();
    const { client } = fakeServer();
    const api = createLiveAdminApi(client);
    await api.list(name, "all");
    assert.equal(queryOf(name).total, name === "vehicles" ? 70 : 60, `${name} all zones`);
    await api.list(name, ["Z001"]);
    assert.equal(queryOf(name).total, undefined, `${name} one zone`);
    await api.list(name, null);
    assert.ok(queryOf(name).total !== undefined, `${name} back to all zones`);
  }
  resetLists();
});

test("L78-A: Trips flagged only counts the flagged trips (the same query as the page)", async () => {
  resetLists();
  const { client, reads } = fakeServer();
  const api = createLiveAdminApi(client);
  setListQuery("trips", { flagged: true });
  await api.list("trips", null);
  assert.ok(reads.some((path) => path.startsWith("/admin/trips?") && path.includes("flagged=true")));
  assert.equal(queryOf("trips").total, 23);
  assert.equal(queryOf("trips").loaded, 23);
  resetLists();
});

test("L78-A: the count text reuses the panel's \"{0} of {1}\" (en / fr / sv, numbers in the admin's language)", () => {
  const text = pages["listCountText"] as ((loaded: number, total: number) => string) | undefined;
  assert.equal(typeof text, "function", "listPages.ts exports listCountText");
  registerDictionary("fr", fr);
  registerDictionary("sv", sv);
  setLanguage("en");
  assert.equal(text!(50, 1240), "50 of 1,240");
  setLanguage("fr");
  assert.equal(text!(50, 1240), `50 sur ${new Intl.NumberFormat(uiLocale()).format(1240)}`);
  setLanguage("sv");
  assert.equal(text!(50, 1240), `50 av ${new Intl.NumberFormat(uiLocale()).format(1240)}`);
  setLanguage("en");
});
