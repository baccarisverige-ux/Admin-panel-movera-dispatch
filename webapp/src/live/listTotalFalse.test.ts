import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveAdminApi, WAITING_TRIPS_LIST } from "./liveAdminApi.ts";
import { listQueryOf, resetLists, setListQuery } from "./liveLists.ts";
import { ApiError } from "../api/httpClient.ts";
import type { LiveClient } from "./session.ts";

/**
 * A6 (contract v0.18.83 adminListFilters.total.onlyWhenAsked, G34 fix plan P4-B; owner 2026-11-13 12:24 UTC
 * "Yes (Rec.)"; proof sup3 P4: every live event reload re-counted page 1, about 2,120 Trips/Payments counts a minute):
 * the panel asks the server to count a list only when the list page opens or its filter changes. Every other read
 * of the 10 total lists (live event reloads, Load more, the alerts, the Dashboard, every-page reads, the search box)
 * sends total=false, and the list keeps the number it already shows. A server before v0.18.83 answers total with
 * 400 invalid_request reason unknown_filter: the panel then sends nothing for the rest of the session (like A2).
 */
// Loaded lazily so this file runs (and fails per case) on a base without the A6 exports.
const lists: Record<string, unknown> = await import("./liveLists.ts");
const askListCount = lists["askListCount"] as ((name: string) => void) | undefined;
type Query = { loaded?: number; total?: number; hasMore: boolean };
const queryOf = (name: string) => listQueryOf(name as never) as unknown as Query;

const driver = (n: number) => ({ driverId: `D${n}`, firstName: `Driver${n}`, lastName: "X", accountStatus: n % 2 ? "active" : "pending", zoneIds: ["Z001"], documents: [] });
const vehicle = (n: number) => ({ vehicleId: `V${n}`, plate: `ABC${n}`, status: "approved", year: 2020, seats: 4, make: "Volvo", model: "V60", categoryIds: [], documents: [], driverId: `D${n}` });
const trip = (n: number, status = "completed") => ({ tripId: `T${n}`, riderId: `R${n}`, zoneId: "Z001", status, fare: { amountMinor: 10000, currency: "SEK" }, createdAt: "2026-11-12T10:00:00Z", version: 1 });

/** A server of v0.18.83 (old: true = before, it answers total with 400 unknown_filter). */
function fakeServer(opts: { old?: boolean } = {}) {
  const data: Record<string, Record<string, unknown>[]> = {
    "/admin/drivers": Array.from({ length: 120 }, (_, i) => driver(i)),
    "/admin/vehicles": Array.from({ length: 70 }, (_, i) => vehicle(i)),
    "/admin/trips": [...Array.from({ length: 90 }, (_, i) => trip(i)), ...Array.from({ length: 3 }, (_, i) => trip(100 + i, "requested"))],
    "/admin/riders": [],
    "/admin/payouts": Array.from({ length: 130 }, (_, i) => ({ payoutId: `P${i}`, driverId: "D1", amount: { amountMinor: 100, currency: "SEK" }, status: "pending", periodStart: "2026-11-01", periodEnd: "2026-11-07", source: "auto", tripCount: 1, createdAt: "2026-11-08T00:00:00Z" })),
    "/admin/tickets": [],
  };
  const reads: string[] = [];
  let refused = 0;
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1", role: "super", scope: { zones: "all" } }),
    subscribe: () => () => undefined,
    json: async (path: string) => {
      reads.push(path);
      const [route = "", search] = path.split("?");
      const q = new URLSearchParams(search ?? "");
      const total = q.get("total");
      if (total !== null && opts.old) {
        refused += 1;
        throw new ApiError(400, "Unknown filter.", { code: "invalid_request", reason: "unknown_filter" });
      }
      if (total !== null && total !== "true" && total !== "false") throw new ApiError(400, "Bad total.", { code: "invalid_request" });
      const rows = data[route];
      if (!rows) return { items: [], nextCursor: null };
      const statusKey = route === "/admin/drivers" ? "accountStatus" : "status";
      const statuses = q.getAll(statusKey);
      const wanted = rows.filter((row) => !statuses.length || statuses.includes(String(row.accountStatus ?? row.status)));
      const from = Number(q.get("cursor") ?? 0);
      const end = from + Number(q.get("limit") ?? 50);
      const page: Record<string, unknown> = { items: wanted.slice(from, end), nextCursor: end < wanted.length ? String(end) : null };
      if (!q.get("cursor") && total !== "false") page.total = wanted.length;
      return page;
    },
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, reads, refused: () => refused };
}
const of = (reads: string[], route: string) => reads.filter((path) => path.startsWith(`${route}?`));
const totalOf = (path: string) => new URLSearchParams(path.split("?")[1] ?? "").get("total");

test("A6: the list page's first read is counted (no total key), a live reload of the same filter sends total=false and keeps 50 of 120", async () => {
  resetLists();
  const { client, reads } = fakeServer();
  const api = createLiveAdminApi(client);
  await api.list("drivers", null);
  assert.equal(totalOf(of(reads, "/admin/drivers")[0]!), null, "open: counted (absent = count, also on an older server)");
  assert.equal(queryOf("drivers").total, 120);
  reads.length = 0;
  await api.list("drivers", null);
  assert.deepEqual(of(reads, "/admin/drivers").map(totalOf), ["false"], "reload: not counted");
  assert.equal(queryOf("drivers").total, 120, "the shown number is kept");
  assert.equal(queryOf("drivers").loaded, 50);
  resetLists();
});

test("A6: a status / search change is counted again; the reload after it is not", async () => {
  resetLists();
  const { client, reads } = fakeServer();
  const api = createLiveAdminApi(client);
  await api.list("drivers", null);
  for (const patch of [{ status: "active" }, { q: "Driver1" }, { status: "", q: "" }]) {
    setListQuery("drivers", { ...patch, pages: 1 });
    reads.length = 0;
    await api.list("drivers", null);
    assert.equal(totalOf(of(reads, "/admin/drivers")[0]!), null, `counted after ${JSON.stringify(patch)}`);
    reads.length = 0;
    await api.list("drivers", null);
    assert.equal(totalOf(of(reads, "/admin/drivers")[0]!), "false", `reload after ${JSON.stringify(patch)}`);
  }
  resetLists();
});

test("A6: a new zone pick is a filter change (counted again)", async () => {
  resetLists();
  const { client, reads } = fakeServer();
  const api = createLiveAdminApi(client);
  await api.list("trips", null);
  reads.length = 0;
  await api.list("trips", ["Z001"]);
  assert.equal(totalOf(of(reads, "/admin/trips")[0]!), null);
  reads.length = 0;
  await api.list("trips", ["Z001"]);
  assert.equal(totalOf(of(reads, "/admin/trips")[0]!), "false");
  resetLists();
});

test("A6: the list page opening again asks for the count once (askListCount)", async () => {
  resetLists();
  assert.equal(typeof askListCount, "function", "liveLists.ts exports askListCount");
  const { client, reads } = fakeServer();
  const api = createLiveAdminApi(client);
  await api.list("drivers", null);
  askListCount!("drivers");
  reads.length = 0;
  await api.list("drivers", null);
  assert.equal(totalOf(of(reads, "/admin/drivers")[0]!), null, "page opened: counted");
  reads.length = 0;
  await api.list("drivers", null);
  assert.equal(totalOf(of(reads, "/admin/drivers")[0]!), "false", "the ask is used once");
  resetLists();
});

test("A6: Load more re-reads page 1 and the next pages with total=false and keeps the count", async () => {
  resetLists();
  const { client, reads } = fakeServer();
  const api = createLiveAdminApi(client);
  await api.list("drivers", null);
  setListQuery("drivers", { pages: 3 });
  reads.length = 0;
  await api.list("drivers", null);
  assert.deepEqual(of(reads, "/admin/drivers").map(totalOf), ["false", "false", "false"]);
  assert.equal(queryOf("drivers").total, 120);
  assert.equal(queryOf("drivers").loaded, 120);
  resetLists();
});

test("A6: every-page reads (Dashboard waiting trips, due payouts, tickets) and the search box send total=false on every page", async () => {
  resetLists();
  const { client, reads } = fakeServer();
  const api = createLiveAdminApi(client);
  await api.list(WAITING_TRIPS_LIST, null);
  await api.list("duePayouts", null);
  await api.list("tickets", null);
  await api.search("Driver", null);
  const listed = reads.filter((path) => /^\/admin\/(trips|payouts|tickets|drivers|riders)\?/.test(path));
  assert.ok(of(reads, "/admin/payouts").length >= 2, "due payouts: more than one page");
  assert.deepEqual(listed.filter((path) => totalOf(path) !== "false"), [], "never counted");
  resetLists();
});

test("A6: vehicles with a zone pick (count not kept) send total=false; back to All zones counts again", async () => {
  resetLists();
  const { client, reads } = fakeServer();
  const api = createLiveAdminApi(client);
  await api.list("vehicles", "all");
  assert.equal(queryOf("vehicles").total, 70);
  reads.length = 0;
  await api.list("vehicles", ["Z001"]);
  assert.equal(totalOf(of(reads, "/admin/vehicles")[0]!), "false");
  assert.equal(queryOf("vehicles").total, undefined);
  reads.length = 0;
  await api.list("vehicles", null);
  assert.equal(totalOf(of(reads, "/admin/vehicles")[0]!), null);
  assert.equal(queryOf("vehicles").total, 70);
  resetLists();
});

test("A6: an older server (400 unknown_filter on total) is asked once, then never with total for the session", async () => {
  resetLists();
  const server = fakeServer({ old: true });
  const api = createLiveAdminApi(server.client);
  await api.list("drivers", null);
  await api.list("drivers", null);
  assert.equal(queryOf("drivers").total, 120, "the reload is still served");
  await api.list(WAITING_TRIPS_LIST, null);
  await api.list("duePayouts", null);
  await api.list("drivers", null);
  assert.equal(server.refused(), 1, "one 400 for the whole session");
  const after = server.reads.slice(server.reads.findIndex((path) => totalOf(path) === "false") + 1);
  assert.deepEqual(after.filter((path) => totalOf(path) !== null), [], "nothing sent after the 400");
  resetLists();
});

test("A6: any other error of a total=false read is the page's normal error (no retry)", async () => {
  resetLists();
  const reads: string[] = [];
  let first = true;
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1", role: "super", scope: { zones: "all" } }),
    subscribe: () => () => undefined,
    json: async (path: string) => {
      reads.push(path);
      if (!path.startsWith("/admin/drivers?")) return { items: [], nextCursor: null };
      if (first) {
        first = false;
        return { items: [driver(1)], nextCursor: null, total: 1 };
      }
      throw new ApiError(503, "Busy.", { code: "unavailable" });
    },
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  const api = createLiveAdminApi(client);
  await api.list("drivers", null);
  await assert.rejects(api.list("drivers", null), (error: unknown) => error instanceof ApiError && error.status === 503);
  assert.equal(reads.filter((path) => path.startsWith("/admin/drivers?")).length, 2);
  resetLists();
});
