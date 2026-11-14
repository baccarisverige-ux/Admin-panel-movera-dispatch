import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WAITING_TRIPS_LIST, createLiveAdminApi } from "./liveAdminApi.ts";
import { ApiError } from "../api/httpClient.ts";
import type { LiveClient } from "./session.ts";

/**
 * A2 (contract v0.18.83 adminListFilters.scheduledBefore; owner 2026-11-13 12:24 UTC "Exact contract filter (Rec.)";
 * proof sup3 P6b): the Dashboard's waiting requests are ONE read, GET /admin/trips?status=requested&status=searching&
 * status=offered&scheduledBefore=<now>, so booked rides that are not due are never read (before: 10 pages / 1,000
 * booked rows every 10 s, none shown). A live trip always passes; a booked ride passes once its pickup time is reached
 * (a late send stays on the Dashboard). A server before v0.18.83 answers 400 invalid_request reason unknown_filter:
 * the panel then reads as before (the three statuses, every page) for the rest of the session, never as an error
 * (supervisor condition, contracts-0.18.83-supervisor.md:28).
 */
const NOW = Date.parse("2026-11-13T15:00:00Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const base = { riderId: "R1", zoneId: "Z001", fare: { amountMinor: 10000, currency: "SEK" }, createdAt: "2026-11-13T14:00:00Z", version: 1 };
/** 3 live waiting trips, 1 late booked ride (pickup 10 min ago, still requested), 400 booked rides not due (pickup ahead). */
type FakeTrip = typeof base & { tripId: string; kind: string; status: string; driverId?: string; scheduledAt?: string };
const TRIPS: FakeTrip[] = [
  { ...base, tripId: "L1", kind: "live", status: "requested" },
  { ...base, tripId: "L2", kind: "live", status: "searching" },
  { ...base, tripId: "L3", kind: "live", status: "offered", driverId: "D1" },
  { ...base, tripId: "B_LATE", kind: "scheduled", status: "requested", scheduledAt: at(-10) },
  ...Array.from({ length: 400 }, (_, n) => ({ ...base, tripId: `B${n}`, kind: "scheduled", status: "requested", scheduledAt: at(60 + n) })),
];

function fakeServer(opts: { old?: boolean; fail?: ApiError } = {}) {
  const reads: string[] = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1", role: "super", scope: { zones: "all" } }),
    subscribe: () => () => undefined,
    json: async (path: string) => {
      reads.push(path);
      const [route, search] = path.split("?");
      if (route !== "/admin/trips") return { items: [], nextCursor: null };
      const q = new URLSearchParams(search ?? "");
      const before = q.get("scheduledBefore");
      if (before !== null && opts.fail) throw opts.fail;
      if (before !== null && opts.old) throw new ApiError(400, "Unknown filter.", { code: "invalid_request", reason: "unknown_filter" });
      if (before !== null && !Number.isFinite(Date.parse(before))) throw new ApiError(400, "Bad scheduledBefore.", { code: "invalid_request" });
      const statuses = q.getAll("status");
      const wanted = TRIPS.filter((row) => (!statuses.length || statuses.includes(row.status))
        && (before === null || row.kind === "live" || (row.scheduledAt !== undefined && Date.parse(row.scheduledAt) <= Date.parse(before))));
      const from = Number(q.get("cursor") ?? 0);
      const end = from + Number(q.get("limit") ?? 50);
      return { items: wanted.slice(from, end), nextCursor: end < wanted.length ? String(end) : null };
    },
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, reads };
}
const tripReads = (reads: string[]) => reads.filter((path) => path.startsWith("/admin/trips?"));
const params = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");
const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

test("A2: the Dashboard's waiting trips are one read with scheduledBefore=<now> and the three waiting statuses", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const { client, reads } = fakeServer();
  const rows = await createLiveAdminApi(client).list(WAITING_TRIPS_LIST, null);
  const listed = tripReads(reads);
  assert.equal(listed.length, 1, `one page, not every booked ride: ${listed.join(" | ")}`);
  const q = params(listed[0]!);
  assert.deepEqual(q.getAll("status").sort(), ["offered", "requested", "searching"]);
  assert.equal(q.get("scheduledBefore"), new Date(NOW).toISOString());
  assert.deepEqual(ids(rows), ["B_LATE", "L1", "L2", "L3"]);
});

test("A2: a booked ride whose send is late (still requested after its pickup time) stays on the Dashboard", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const { client } = fakeServer();
  const rows = await createLiveAdminApi(client).list(WAITING_TRIPS_LIST, null);
  assert.ok(rows.some((row) => row.id === "B_LATE"));
  assert.ok(!rows.some((row) => row.id === "B0"), "a booked ride not due is never read");
});

test("A2: an older server (400 unknown_filter) → the old read (three statuses, every page), no error, asked only once per session", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const { client, reads } = fakeServer({ old: true });
  const api = createLiveAdminApi(client);
  const first = await api.list(WAITING_TRIPS_LIST, null);
  assert.equal(first.length, TRIPS.length, "the old read returns every waiting trip (the Dashboard's own due filter narrows it)");
  const withKey = tripReads(reads).filter((path) => params(path).has("scheduledBefore"));
  // A6 (v0.18.83 total=false): the first 400 is read as "no total key" (listTotalParam.ts), so the old server sees the
  // scheduledBefore read once more without total; after that never again this session.
  assert.equal(withKey.length, 2);
  reads.length = 0;
  const second = await api.list(WAITING_TRIPS_LIST, null);
  assert.equal(second.length, TRIPS.length);
  assert.ok(tripReads(reads).length >= 2, "every page, as before");
  for (const path of tripReads(reads)) assert.equal(params(path).has("scheduledBefore"), false, path);
});

test("A2: any other error is not swallowed (the page's normal error line)", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const { client } = fakeServer({ fail: new ApiError(503, "Busy.", { code: "unavailable", retryable: true }) });
  await assert.rejects(createLiveAdminApi(client).list(WAITING_TRIPS_LIST, null), (error: unknown) => error instanceof ApiError && error.status === 503);
});

test("A2: the trips list page and Reservations keep their own reads (no scheduledBefore)", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const { client, reads } = fakeServer();
  await createLiveAdminApi(client).list("trips", null);
  assert.ok(tripReads(reads).length >= 1);
  for (const path of tripReads(reads)) assert.equal(params(path).has("scheduledBefore"), false, path);
});

test("A2: the contract copy (>= v0.18.83) has the rule this read follows", () => {
  const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
  const text: string = C.adminListFilters.scheduledBefore;
  assert.match(text, /status=requested&status=searching&status=offered&scheduledBefore=<now>/);
  assert.match(text, /kind live always passes/);
  assert.match(text, /unknown_filter/);
});
