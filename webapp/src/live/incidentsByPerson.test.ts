import { test } from "node:test";
import assert from "node:assert/strict";
import * as incidentsModule from "./incidents.ts";
import { isIncidentList } from "./incidents.ts";
import { createLiveAdminApi } from "./liveAdminApi.ts";
import { keyMatches } from "./adminEvents.ts";
import { ApiError } from "../api/httpClient.ts";
import { belongsToDriver, belongsToRider } from "../riders/match.ts";
import type { LiveClient } from "./session.ts";

/**
 * L78-A (contract v0.18.78 adminListFilters.incidentsByPerson; owner 2026-11-12 item 5): the driver and rider detail
 * pages read only that person's cases (GET /admin/incidents?driverId= / ?riderId=, every page of them) instead of
 * every case. A server before v0.18.78 answers 400 invalid_request reason unknown_filter: the panel then reads every
 * case as before (the page's own filter narrows it), once per session; it never shows that as an error.
 */
const exported = incidentsModule as unknown as Record<string, string | undefined>;
const OF_DRIVER = exported["INCIDENTS_OF_DRIVER_LIST"] ?? "incidentsOfDriver:";
const OF_RIDER = exported["INCIDENTS_OF_RIDER_LIST"] ?? "incidentsOfRider:";

/** 300 cases: driver D{n % 7}, rider R{n % 11} (every 5th case has no driver), in zone Z001 or Z002. */
const CASES = Array.from({ length: 300 }, (_, n) => ({
  incidentId: `inc_${n}`, kind: "sos", severity: "critical", status: n % 3 ? "resolved" : "open", zoneId: n % 2 ? "Z001" : "Z002",
  openedAt: `2026-11-12T10:${String(n % 60).padStart(2, "0")}:00Z`, ...(n % 5 ? { driverId: `D${n % 7}` } : {}), riderId: `R${n % 11}`,
}));

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
      const q = new URLSearchParams(search ?? "");
      if (route !== "/admin/incidents") return { items: [], nextCursor: null };
      const driverId = q.get("driverId");
      const riderId = q.get("riderId");
      if ((driverId || riderId) && opts.fail) throw opts.fail;
      if ((driverId || riderId) && opts.old) throw new ApiError(400, "Unknown filter.", { code: "invalid_request", reason: "unknown_filter" });
      const zone = q.get("zoneId");
      const wanted = CASES.filter((row) => (!driverId || row.driverId === driverId) && (!riderId || row.riderId === riderId) && (!zone || row.zoneId === zone));
      const from = Number(q.get("cursor") ?? 0);
      const end = from + Number(q.get("limit") ?? 50);
      return { items: wanted.slice(from, end), nextCursor: end < wanted.length ? String(end) : null, ...(from ? {} : { total: wanted.length }) };
    },
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, reads };
}
const listReads = (reads: string[]) => reads.filter((path) => path.startsWith("/admin/incidents?"));
const params = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");
const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

test("L78-A: a driver's cases are read with driverId (every page of them), never every case", async () => {
  const { client, reads } = fakeServer();
  const rows = await createLiveAdminApi(client).list(`${OF_DRIVER}D3`, null);
  assert.ok(listReads(reads).length >= 1);
  for (const path of listReads(reads)) assert.equal(params(path).get("driverId"), "D3", path);
  assert.deepEqual(ids(rows), ids(CASES.filter((row) => row.driverId === "D3").map((row) => ({ id: row.incidentId }))));
});

test("L78-A: a rider's cases are read with riderId", async () => {
  const { client, reads } = fakeServer();
  const rows = await createLiveAdminApi(client).list(`${OF_RIDER}R4`, null);
  assert.ok(listReads(reads).length >= 1);
  for (const path of listReads(reads)) assert.equal(params(path).get("riderId"), "R4", path);
  assert.equal(rows.length, CASES.filter((row) => row.riderId === "R4").length);
});

test("L78-A: the same cases as today's every-case read + the page's own driver / rider filter", async () => {
  const { client } = fakeServer();
  const api = createLiveAdminApi(client);
  const every = await api.list(incidentsModule.ALL_INCIDENTS_LIST, null);
  const drivers = Array.from({ length: 7 }, (_, n) => ({ id: `D${n}`, name: `Driver ${n}`, phone: "" }));
  const riders = Array.from({ length: 11 }, (_, n) => ({ id: `R${n}`, name: `Rider ${n}`, phone: "" }));
  for (const person of drivers) {
    const mine = await api.list(`${OF_DRIVER}${person.id}`, null);
    assert.deepEqual(ids(mine), ids(every.filter((row) => belongsToDriver(row, person, drivers))), person.id);
  }
  for (const person of riders) {
    const mine = await api.list(`${OF_RIDER}${person.id}`, null);
    assert.deepEqual(ids(mine), ids(every.filter((row) => belongsToRider(row, person, riders))), person.id);
  }
});

test("L78-A: an older server (400 unknown_filter) → every case as before, no error, and only once per session", async () => {
  const { client, reads } = fakeServer({ old: true });
  const api = createLiveAdminApi(client);
  const rows = await api.list(`${OF_DRIVER}D3`, null);
  assert.equal(rows.length, CASES.length, "every case; the page's own filter narrows it");
  // A6 (v0.18.83 total=false): the first 400 is read as "no total key" (listTotalParam.ts), so the driverId read is
  // made once more without total before the old read; after that never again this session.
  assert.equal(listReads(reads).filter((path) => params(path).has("driverId")).length, 2, "two rejected reads, once per session");
  reads.length = 0;
  const again = await api.list(`${OF_RIDER}R4`, null);
  assert.equal(again.length, CASES.length);
  assert.equal(listReads(reads).filter((path) => params(path).has("driverId") || params(path).has("riderId")).length, 0, "straight to the old read");
});

test("L78-A: other errors (400 invalid_body, 403, 503) are shown, not hidden by the fallback", async () => {
  for (const fail of [new ApiError(400, "Bad.", { code: "invalid_request", reason: "invalid_body" }), new ApiError(403, "No.", { code: "forbidden" }), new ApiError(503, "Busy.")]) {
    const { client, reads } = fakeServer({ fail });
    await assert.rejects(createLiveAdminApi(client).list(`${OF_DRIVER}D3`, null), (error: unknown) => error === fail);
    assert.equal(listReads(reads).filter((path) => !params(path).has("driverId")).length, 0, `no every-case read after ${fail.status}`);
  }
});

test("L78-A: an empty id reads nothing", async () => {
  const { client, reads } = fakeServer();
  assert.deepEqual(await createLiveAdminApi(client).list(OF_DRIVER, null), []);
  assert.equal(listReads(reads).length, 0);
});

test("L78-A: the zone filter is still sent with driverId", async () => {
  const { client, reads } = fakeServer();
  const rows = await createLiveAdminApi(client).list(`${OF_DRIVER}D3`, ["Z001"]);
  assert.ok(listReads(reads).every((path) => params(path).get("zoneId") === "Z001" && params(path).get("driverId") === "D3"));
  assert.ok(rows.length > 0 && rows.every((row) => row.zoneId === "Z001"));
});

test("L78-A: the person case lists are incident lists (the alarm, the stream and case commands refresh them)", () => {
  assert.equal(isIncidentList(`${OF_DRIVER}D1`), true);
  assert.equal(isIncidentList(`${OF_RIDER}R1`), true);
  assert.equal(keyMatches({ type: "incident.changed" }, ["records", `${OF_RIDER}R1`, null]), true);
  assert.equal(keyMatches({ type: "incident.changed" }, ["records", `${OF_DRIVER}D1`, null]), true);
});
