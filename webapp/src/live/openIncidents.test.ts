import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as liveApi from "./liveAdminApi.ts";
import { createLiveAdminApi, LIST_PAGE } from "./liveAdminApi.ts";
import { keyMatches } from "./adminEvents.ts";
import { resetLists, setListQuery, listQueryOf } from "./liveLists.ts";
import type { LiveClient } from "./session.ts";

/**
 * B1.26b (server B1.26 #201; Rules audits/impact/server-b126.md "Admin needs"): the SOS pollers (Alerts 10 s,
 * Dashboard, Pricing 30 s, the alarm's refresh) read only the open cases (status=open&status=investigating, one small
 * read); the case history is read in pages of 50 with "Load more" (owner item 109); a trip reads its own cases
 * (?tripId=) and a case address its own case (GET /admin/incidents/{id}).
 */
const exported = liveApi as unknown as Record<string, string | undefined>;
const OPEN = exported["OPEN_INCIDENTS_LIST"] ?? "openIncidents";
const OF_TRIP = exported["INCIDENTS_OF_TRIP_LIST"] ?? "incidentsOfTrip:";
const BY_ID = exported["INCIDENT_BY_ID_LIST"] ?? "incidentById:";

const incident = (n: number, status: string) => ({ incidentId: `inc_${n}`, kind: "sos", severity: "critical", status, zoneId: "z1", openedAt: `2026-11-12T10:${String(n % 60).padStart(2, "0")}:00Z` });

/** A server with 2,000 cases (20 pages of 100): 3 open / investigating, the rest closed. */
function fakeServer() {
  const rows = Array.from({ length: 2000 }, (_, i) => incident(i, i < 2 ? "open" : i === 2 ? "investigating" : i % 2 ? "resolved" : "dismissed"));
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
      const one = /^\/admin\/incidents\/([^/]+)$/.exec(route ?? "");
      if (one) return rows.find((row) => row.incidentId === one[1]) ?? Promise.reject(new Error("404"));
      if (route !== "/admin/incidents") return { items: [], nextCursor: null };
      const statuses = q.getAll("status");
      const tripId = q.get("tripId");
      const wanted = rows.filter((row) => (!statuses.length || statuses.includes(row.status)) && (!tripId || (tripId === "T1" && row.incidentId === "inc_7")));
      const from = Number(q.get("cursor") ?? 0);
      const limit = Number(q.get("limit") ?? 50);
      const end = from + limit;
      return { items: wanted.slice(from, end).map((row) => (tripId ? { ...row, tripId } : row)), nextCursor: end < wanted.length ? String(end) : null };
    },
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, reads };
}
const params = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");
const listReads = (reads: string[]) => reads.filter((path) => path.startsWith("/admin/incidents?"));

test("B1.26b: a poll of the open SOS cases is ONE small read with status=open&status=investigating", async () => {
  const { client, reads } = fakeServer();
  const rows = await createLiveAdminApi(client).list(OPEN, null);
  assert.equal(listReads(reads).length, 1, "one read per poll, not every page of the history");
  assert.deepEqual(params(listReads(reads)[0]!).getAll("status").sort(), ["investigating", "open"]);
  assert.deepEqual(rows.map((row) => row.status).sort(), ["queued", "queued", "taken"]);
});

test("B1.26b: the case history reads one page of 50, not every page; Load more reads the next page", async () => {
  resetLists();
  const { client, reads } = fakeServer();
  const api = createLiveAdminApi(client);
  const first = await api.list("incidents", null);
  assert.equal(listReads(reads).length, 1, "today the history read walks 20 pages of 100");
  assert.equal(params(listReads(reads)[0]!).get("limit"), String(LIST_PAGE));
  assert.equal(params(listReads(reads)[0]!).getAll("status").length, 0, "the history keeps every status");
  assert.equal(first.length, LIST_PAGE);
  assert.equal(listQueryOf("incidents" as never).hasMore, true, "the page offers Load more");
  reads.length = 0;
  setListQuery("incidents" as never, { pages: 2 });
  const second = await api.list("incidents", null);
  assert.equal(second.length, 2 * LIST_PAGE);
  // Closed cases stay visible on the Safety page through Load more.
  assert.ok(second.some((row) => row.status === "resolved") && second.some((row) => row.status === "dismissed"));
  resetLists();
});

test("B1.26b: a trip page reads its own cases (?tripId=), never the whole list", async () => {
  const { client, reads } = fakeServer();
  const rows = await createLiveAdminApi(client).list(`${OF_TRIP}T1`, null);
  assert.deepEqual(listReads(reads).map((path) => params(path).get("tripId")), ["T1"]);
  assert.deepEqual(rows.map((row) => row.id), ["inc_7"]);
});

test("B1.26b: a case address (/incidents/:id) reads that case by id, so an old case beyond the first page opens", async () => {
  const { client, reads } = fakeServer();
  const rows = await createLiveAdminApi(client).list(`${BY_ID}inc_1500`, null);
  assert.deepEqual(reads, ["/admin/incidents/inc_1500"]);
  assert.deepEqual(rows.map((row) => row.id), ["inc_1500"]);
});

test("B1.26b: incident.changed refreshes the open-case, per-trip and per-case lists too", () => {
  for (const name of [OPEN, `${OF_TRIP}T1`, `${BY_ID}inc_1`]) assert.equal(keyMatches({ type: "incident.changed" }, ["records", name, "{}", "a1"]), true, name);
  assert.equal(keyMatches({ type: "ticket.changed" }, ["records", OPEN, "{}", "a1"]), false);
});

test("B1.26b: the 10 s / 30 s pollers and the alarm refresh use the open-case list, not the whole history", () => {
  const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  for (const file of ["alerts/useAlerts.ts", "pages/DashboardPage.tsx", "pages/PricingPage.tsx"]) {
    assert.doesNotMatch(read(file), /useRecords\("incidents", undefined, \{ refetchMs/, file);
    assert.match(read(file), /OPEN_INCIDENTS_LIST/, file);
  }
  assert.match(read("live/IncidentAlarm.tsx"), /isIncidentList/, "the alarm refreshes every incident list");
});

test("B1.26b: Take / Solved / False alarm (collection incidents) refresh every incident list", async () => {
  const { queryTouched, touchedBy } = await import("../api/commandFlow.ts");
  const touched = touchedBy(undefined, { collection: "incidents" });
  const caseOnly = { ...touched, all: false };
  for (const name of ["incidents", OPEN, `${OF_TRIP}T1`, `${BY_ID}inc_1`]) assert.equal(queryTouched(["records", name, "{}", "a1"], caseOnly), true, name);
  assert.equal(queryTouched(["records", "drivers", "{}", "a1"], caseOnly), false);
});

test("B1.26b fix: /incidents?case=<id> reads a case missing from the open cases and the loaded history by id, only live", async () => {
  const { caseToRead } = await import("../safety/caseLink.ts");
  const rows = [{ id: "inc_1" }, { id: "inc_c0" }];
  assert.equal(caseToRead("inc_c55", true, rows, rows), "inc_c55", "an old closed case past the first page is read by id");
  assert.equal(caseToRead("inc_c0", true, [], rows), null, "a loaded case needs no extra read");
  assert.equal(caseToRead("inc_1", true, rows, []), null);
  assert.equal(caseToRead("inc_c55", true, rows, undefined), null, "wait for the history page first");
  assert.equal(caseToRead("inc_c55", false, rows, rows), null, "the demo holds every case");
  assert.equal(caseToRead(null, true, rows, rows), null);
});

test("B1.26b fix: a deep-linked case that is nowhere says \"not found\" instead of opening another case", async () => {
  const { pickCase } = await import("../safety/caseLink.ts");
  const a = { id: "inc_1" };
  const b = { id: "inc_c0" };
  const old = { id: "inc_c55" };
  // Found: in the list, or read by id but hidden by the "Open" filter.
  assert.deepEqual(pickCase([a, b], [a, b], "inc_c0", null, false), { item: b, missing: null });
  assert.deepEqual(pickCase([a], [a, old], "inc_c55", null, false), { item: old, missing: null });
  // Not found once everything is read: no case on screen, never the first one (the NO-GO: shown[0] = inc_1).
  assert.deepEqual(pickCase([a, b], [a, b], "inc_nope", "inc_1", false), { item: null, missing: "inc_nope" });
  // Still reading: neither another case nor "not found".
  assert.deepEqual(pickCase([a, b], [a, b], "inc_c55", null, true), { item: null, missing: null });
  // No case in the address: keep the one on screen (list reorders after Take), else the first.
  assert.deepEqual(pickCase([a, b], [a, b], null, "inc_c0", false), { item: b, missing: null });
  assert.deepEqual(pickCase([a, b], [a, b], null, null, false), { item: a, missing: null });
  assert.deepEqual(pickCase([], [], null, null, false), { item: null, missing: null });
});
