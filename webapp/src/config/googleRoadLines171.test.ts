import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dispatchDocumentOf, rulesOfDispatch, type Doc } from "../live/configDocs.ts";
import { zoneDefault } from "../dispatch/rules.ts";
import { changeLines } from "../dispatch/rules/changes.ts";
import { clampCallsPerTrip, liveTrafficOf, RECALL_DEFAULTS, ROAD_LINES_MAX_CALLS, roadLinesOf } from "../dispatch/rules/liveTraffic.ts";
import { DISPATCH_ZONE_INFO } from "../ui/settingInfo/dispatchZone.ts";
import {
  budgetErrorText, budgetIssue, coversAllCountries, GOOGLE_BUDGET_ALERT_TEXTS, GOOGLE_BUDGET_DEFAULTS, GOOGLE_BUDGET_PATH, DAILY_LIMIT_RANGE,
  isGoogleBudgetAlert, readGoogleBudget, roadLinesPerDay, saveGoogleBudget, type GoogleBudget,
} from "./googleBudget.ts";
import { SYSTEM_HEALTH_SERVER_ALERTS } from "../alerts/reads.ts";
import { ApiError } from "../api/httpClient.ts";
import { en } from "../i18n/en.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";

/**
 * v0.18.171 (contract.json#googleRoadLines; owner 2026-11-27 "Google on key screens", cap 4 incl. the quote, split
 * 1,400 / 600; 2026-11-28 the admin changes the daily limit): Live traffic card rows and Settings › Google budget.
 * Rule 36: fails on main (none of this exists there).
 */
test("road lines not set: follow live traffic, at most 4 calls; nothing extra published", () => {
  assert.deepEqual(ROAD_LINES_MAX_CALLS, [1, 4]);
  assert.deepEqual(roadLinesOf(liveTrafficOf(zoneDefault("Z001"), "SE")), { on: true, maxCallsPerTrip: 4 });
  assert.deepEqual(roadLinesOf(liveTrafficOf(zoneDefault("TN-TC"), "TN")), { on: false, maxCallsPerTrip: 4 });
  assert.equal((dispatchDocumentOf(zoneDefault("Z001"), "Z001", null) as Doc)["liveTraffic"], undefined);
});

test("max calls per trip cannot go above 4 or below 1", () => {
  assert.equal(clampCallsPerTrip(9), 4);
  assert.equal(clampCallsPerTrip(0), 1);
  assert.equal(clampCallsPerTrip(2), 2);
});

test("the admin's road lines are published and read back; out of range reads 4", () => {
  const zone = { ...zoneDefault("Z001"), liveTraffic: { on: true, ...RECALL_DEFAULTS, roadLines: { on: false, maxCallsPerTrip: 2 } } };
  const doc = dispatchDocumentOf(zone, "Z001", null) as Doc;
  assert.deepEqual((doc["liveTraffic"] as Doc)["roadLines"], { on: false, maxCallsPerTrip: 2 });
  assert.deepEqual(rulesOfDispatch(doc, null, zoneDefault("Z001")).liveTraffic, zone.liveTraffic);
  const bad = rulesOfDispatch({ ...doc, liveTraffic: { on: true, ...RECALL_DEFAULTS, roadLines: { maxCallsPerTrip: 5 } } }, null, zoneDefault("Z001")).liveTraffic;
  assert.deepEqual(bad?.roadLines, { on: true, maxCallsPerTrip: 4 });
});

test("change history labels and i texts", () => {
  const before = { ...zoneDefault("Z001"), liveTraffic: { on: true, ...RECALL_DEFAULTS, roadLines: { on: true, maxCallsPerTrip: 4 } } };
  const lines = changeLines(before, { ...before, liveTraffic: { ...before.liveTraffic, roadLines: { on: false, maxCallsPerTrip: 3 } } });
  assert.ok(lines.some((l) => l.startsWith("Google road lines:")), JSON.stringify(lines));
  assert.ok(lines.some((l) => l.startsWith("Max Google calls per trip: 4 → 3")), JSON.stringify(lines));
  for (const key of ["dispatch.zone.liveTrafficRoadLines", "dispatch.zone.liveTrafficCallsPerTrip"]) assert.ok((DISPATCH_ZONE_INFO as Record<string, unknown>)[key], key);
});

test("budget defaults 2000 / 1400, road lines are the difference, schema max 100000", () => {
  assert.deepEqual(GOOGLE_BUDGET_DEFAULTS, { dailyLimit: 2000, quotesPerDay: 1400 });
  assert.equal(roadLinesPerDay(GOOGLE_BUDGET_DEFAULTS), 600);
  assert.deepEqual(DAILY_LIMIT_RANGE, [100, 100000]);
  assert.equal(budgetIssue({ dailyLimit: 100000, quotesPerDay: 70000 }), null);
  assert.ok(budgetIssue({ dailyLimit: 100001, quotesPerDay: 0 }));
  assert.ok(budgetIssue({ dailyLimit: 99, quotesPerDay: 0 }));
  assert.ok(budgetIssue({ dailyLimit: 2000, quotesPerDay: 2001 }));
});

test("GET reads the budget; saving a new daily limit sends PUT { dailyLimit, quotesPerDay } and shows the answer", async () => {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const answer = (dailyLimit: number, quotesPerDay: number): GoogleBudget => ({ dailyLimit, quotesPerDay, roadLinesPerDay: dailyLimit - quotesPerDay, today: { day: "2026-11-28", quotes: 12, roadLines: 3 } });
  const http = {
    json: async <T,>(path: string) => { calls.push({ method: "GET", path }); return answer(2000, 1400) as T; },
    put: async <T,>(path: string, body: unknown) => { calls.push({ method: "PUT", path, body }); const b = body as { dailyLimit: number; quotesPerDay: number }; return answer(b.dailyLimit, b.quotesPerDay) as T; },
  };
  assert.equal((await readGoogleBudget(http)).dailyLimit, 2000);
  const saved = await saveGoogleBudget(http, { dailyLimit: 5000, quotesPerDay: 3500 });
  assert.deepEqual(calls, [{ method: "GET", path: GOOGLE_BUDGET_PATH }, { method: "PUT", path: "/admin/maps/google-budget", body: { dailyLimit: 5000, quotesPerDay: 3500 } }]);
  assert.equal(saved.dailyLimit, 5000);
  assert.equal(saved.roadLinesPerDay, 1500);
});

test("save only for an all-country admin; 403 and 400 have clear reasons", () => {
  assert.equal(coversAllCountries({ zones: "all" }), true);
  assert.equal(coversAllCountries({ zones: "all", countries: ["SE", "FR", "TN"] }), true);
  assert.equal(coversAllCountries({ zones: "all", countries: ["SE"] }), false);
  assert.equal(coversAllCountries({ zones: ["Z001"] }), false);
  assert.match(budgetErrorText(new ApiError(403, "x", { reason: "not_all_countries" } as never)), /every country.*not_all_countries/);
  assert.match(budgetErrorText(new ApiError(400, "x", { reason: "invalid_budget" } as never)), /invalid_budget/);
});

test("the budget alert kind is listed and its texts are in en, sv, fr", () => {
  assert.ok(SYSTEM_HEALTH_SERVER_ALERTS.some((a) => a.prefix === "system_health:google_routes_budget:"));
  assert.ok(isGoogleBudgetAlert("system_health:google_routes_budget:SE"));
  const dicts = { sv: sv as Record<string, string>, fr: fr as Record<string, string> };
  for (const k of [...GOOGLE_BUDGET_ALERT_TEXTS, "Keep this at or below your Google Cloud daily quota.", "Google road lines", "Max Google calls per trip", "Google budget"]) {
    assert.equal((en as Record<string, string>)[k], k);
    for (const lang of ["sv", "fr"] as const) assert.ok(dicts[lang][k] && dicts[lang][k] !== k, `${lang}: ${k}`);
  }
});

test("the admin makes no Google call", () => {
  for (const f of ["./googleBudget.ts", "./GoogleBudgetPanel.tsx", "../dispatch/rules/liveTraffic.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /googleapis\.com|routes\.googleapis|computeRoutes/, f);
  }
});

/** The live server's exact strings: movera-server src/alerts/detector.ts:537 (title) and :538 (detail) at dce1fe39 (#345). */
const SERVER_BUDGET_ALERT_STRINGS = [
  "Google Routes daily limit reached ({0} calls): prices and road lines are estimated until midnight Pacific time", // detector.ts:537 critical
  "Google road lines used their daily share ({0} calls): driver lines are estimated until midnight Pacific time", // detector.ts:537 warning
  "Today {0}: {1} price calls, {2} road-line calls (all countries)", // detector.ts:538 detail
];

test("the admin's budget-alert keys equal the server strings, translated in sv and fr with every placeholder", () => {
  assert.deepEqual([...GOOGLE_BUDGET_ALERT_TEXTS], SERVER_BUDGET_ALERT_STRINGS);
  for (const k of SERVER_BUDGET_ALERT_STRINGS) {
    assert.equal((en as Record<string, string>)[k], k);
    for (const d of [sv, fr] as Record<string, string>[]) {
      const v = d[k]!;
      assert.ok(v && v !== k, k);
      for (const ph of k.match(/\{\d\}/g)!) assert.ok(v.includes(ph), `${ph} in ${v}`);
    }
  }
});
