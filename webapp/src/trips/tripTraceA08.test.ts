import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiError } from "../api/httpClient.ts";
import { contractJson, contractText } from "../contract/load.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { createLiveAdminApi } from "../live/liveAdminApi.ts";
import type { LiveClient } from "../live/session.ts";
import { TRACE_MAX_POINTS, drivenLine, traceLine, traceView } from "./tripTrace.ts";

/**
 * BQ-A08 (plan/NEXT-NONMONEY-2026-11-15.md row 8; owner 2026-10-30 "Road route + driven line (Recommended)", Rules
 * decisions/driver-g11.md:6-8 "must be for all apps live trip or history including admin"): the admin trip page reads
 * GET /admin/trips/{tripId}/trace (server src/drivers/routes.ts:242, openapi TripTrace { tripId, fixes: GeoFix[],
 * keptUntil }) and draws the driven line next to the planned route. "No trace yet", a deleted trace (404 after 30
 * days) and long traces are handled.
 */
registerDictionary("sv", sv);
registerDictionary("fr", fr);
const T0 = Date.parse("2026-11-15T10:00:00Z");
const fix = (i: number, lat: number, lng: number, accuracy = 8, gapSeconds = 5) => ({ lat, lng, accuracy, measuredAt: new Date(T0 + i * gapSeconds * 1000).toISOString() });

test("A08: the contract has GET /admin/trips/{tripId}/trace answering TripTrace { tripId, fixes, keptUntil }", () => {
  const openapi = contractText("openapi.yaml");
  assert.match(openapi, /\/admin\/trips\/\{tripId\}\/trace:\n {4}get:\n {6}operationId: adminTripTrace/);
  assert.match(openapi, /TripTrace:\n {6}type: object[\s\S]{0,200}required:\n {6}- tripId\n {6}- fixes/);
  const path = contractJson<{ tripPath: { driven: string; maxPoints: number } }>("contract.json").tripPath;
  for (const rule of ["accuracy ≤ 50 m", "moved 25 m", "150 km/h"]) assert.ok(path.driven.includes(rule), `the same cleaning as GET /trips/{id}/path: ${rule}`);
  assert.equal(TRACE_MAX_POINTS, path.maxPoints);
});

test("A08: the driven line drops poor fixes, GPS jumps and tiny steps, and keeps the first and the last point", () => {
  const fixes = [
    fix(0, 59.3300, 18.0600),
    fix(1, 59.3301, 18.0600), // 11 m: a tiny step, left out
    fix(2, 59.3310, 18.0600), // 111 m in 10 s from the first point: kept
    fix(3, 59.3320, 18.0600, 120), // accuracy 120 m: left out
    fix(4, 59.4000, 18.0600), // 7.5 km in 10 s: a jump, left out
    fix(5, 59.3330, 18.0600),
    fix(6, 59.3340, 18.0600),
  ];
  assert.deepEqual(drivenLine(fixes), [[59.33, 18.06], [59.331, 18.06], [59.333, 18.06], [59.334, 18.06]]);
  assert.deepEqual(drivenLine([fix(0, 59.33, 18.06)]), [], "one point is no line");
  assert.deepEqual(drivenLine([]), []);
});

test("A08: a long trace (5 000 fixes, about 7 h) is drawn with at most maxPoints points, fast, first and last kept", () => {
  const fixes = Array.from({ length: 5000 }, (_, i) => fix(i, 59.33 + i * 0.0003, 18.06 + Math.sin(i / 50) * 0.002));
  const started = performance.now();
  const line = drivenLine(fixes);
  assert.ok(performance.now() - started < 250, "thinning stays quick");
  assert.ok(line.length <= TRACE_MAX_POINTS && line.length > 100, `drawn with ${line.length} points`);
  assert.deepEqual(line[0], [fixes[0]!.lat, fixes[0]!.lng]);
  assert.deepEqual(line.at(-1), [fixes.at(-1)!.lat, fixes.at(-1)!.lng]);
});

test("A08: the state line says the driven route, no trace yet, deleted after 30 days, or not loaded, in sv/fr/en", () => {
  const ok = traceView({ tripId: "T1", fixes: [fix(0, 59.33, 18.06), fix(1, 59.331, 18.06), fix(2, 59.332, 18.06)], keptUntil: "2026-12-15T10:00:00Z" });
  assert.equal(ok.state, "driven");
  assert.equal(ok.line.length, 3);
  assert.match(traceLine(ok), /^Driven route: 3 GPS positions · kept until /);
  const empty = traceView({ tripId: "T1", fixes: [], keptUntil: "2026-12-15T10:00:00Z" });
  assert.equal(empty.state, "empty");
  assert.equal(traceLine(empty), "No driven route yet: the driver app has sent no position on this trip. The planned route is shown.");
  const deleted = traceView(new ApiError(404, "Not found", { code: "not_found", reason: "trace_deleted" }));
  assert.equal(deleted.state, "deleted");
  assert.equal(traceLine(deleted), "The driven route was deleted 30 days after the trip. The planned route is shown.");
  const failed = traceView(new ApiError(503, "Unavailable", { code: "unavailable" }));
  assert.equal(failed.state, "failed");
  assert.equal(traceLine(failed), "The driven route could not be loaded. The planned route is shown.");
  assert.equal(traceView(new ApiError(403, "Forbidden", { code: "forbidden", reason: "zone_out_of_scope" })).state, "failed");
  for (const lang of ["sv", "fr"] as const) {
    setLanguage(lang);
    try {
      for (const view of [ok, empty, deleted, failed]) {
        const text = traceLine(view);
        setLanguage("en");
        const english = traceLine(view);
        setLanguage(lang);
        assert.notEqual(text, english, `${lang} ${view.state} is translated`);
      }
    } finally {
      setLanguage("en");
    }
  }
});

test("A08: the live admin reads GET /admin/trips/{tripId}/trace; the trip page draws it with the planned route", async () => {
  const reads: string[] = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1", role: "super", scope: { zones: "all" } }),
    subscribe: () => () => undefined,
    json: async (path: string) => { reads.push(path); return { tripId: "T 1", fixes: [], keptUntil: "2026-12-15T10:00:00Z" }; },
    post: async () => ({}), put: async () => ({}), del: async () => ({}),
  } as unknown as LiveClient;
  const api = createLiveAdminApi(client);
  assert.equal(typeof api.tripTrace, "function");
  const trace = await api.tripTrace!("T 1");
  assert.deepEqual(reads, ["/admin/trips/T%201/trace"]);
  assert.equal(trace.fixes.length, 0);
  const page = readFileSync(new URL("../pages/TripPage.tsx", import.meta.url), "utf8");
  assert.match(page, /useTripTrace\(/);
  assert.match(page, /driven=\{/);
  assert.match(page, /data-testid="trip-trace-state"/);
  const map = readFileSync(new URL("./RouteMap.tsx", import.meta.url), "utf8");
  assert.match(map, /kind: "driven"/);
});
