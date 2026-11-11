import assert from "node:assert/strict";
import test from "node:test";
import { CALL_DEFAULTS, callSettingsIssues, callSettingsLines, callSettingsOf } from "./callSettings.ts";
import { PRICING_FIELDS, completeCountrySettings, defaultCountrySettings } from "./countrySettings.ts";
import { countryRulesOf } from "../live/configDocs.ts";
import { callLogLine, readTripCalls, type CallView } from "../live/tripCalls.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";

// v0.18.38 §62 (fix job 8, owner G15 2026-11-05 "In-app calls only", "Both rider and driver", "Just 'Call failed'"):
// Admin › Pricing › Tips & limits per country › Calls (CountryRules.calls) and Trip details › Calls (the call log).

test("job 8: CountryRules.calls defaults are on, in-app, 60 min window, 30 s ring, 15 min longest call", () => {
  assert.deepEqual(CALL_DEFAULTS, { on: true, mode: "in_app", callWindowAfterTripMin: 60, ringSeconds: 30, maxCallMin: 15, connectTimeoutSeconds: 25 }); // §87 adds the connect time (v0.18.66)
  assert.deepEqual(callSettingsOf(undefined), CALL_DEFAULTS);
  assert.deepEqual(callSettingsOf({ on: false, mode: "phone", callWindowAfterTripMin: 90, ringSeconds: 45, maxCallMin: 20 }), { on: false, mode: "phone", callWindowAfterTripMin: 90, ringSeconds: 45, maxCallMin: 20, connectTimeoutSeconds: 25 });
  assert.deepEqual(callSettingsOf({ callWindowAfterTripMin: 999, ringSeconds: 2, mode: "radio" }), CALL_DEFAULTS, "out of range or unknown reads as the default");
  assert.deepEqual(defaultCountrySettings("SE").calls, CALL_DEFAULTS);
  assert.ok((PRICING_FIELDS as readonly string[]).includes("calls"), "saved with Save tips & limits");
  assert.deepEqual(completeCountrySettings("FR", { calls: { callWindowAfterTripMin: 30 } }).calls, { ...CALL_DEFAULTS, callWindowAfterTripMin: 30 });
});

test("job 8: the Calls settings are checked and listed before Save", () => {
  assert.deepEqual(callSettingsIssues("Sweden", CALL_DEFAULTS), []);
  assert.equal(callSettingsIssues("Sweden", { ...CALL_DEFAULTS, callWindowAfterTripMin: 241 }).length, 1);
  assert.equal(callSettingsIssues("Sweden", { ...CALL_DEFAULTS, ringSeconds: 5 }).length, 1);
  assert.equal(callSettingsIssues("Sweden", { ...CALL_DEFAULTS, maxCallMin: 0 }).length, 1);
  assert.deepEqual(callSettingsLines(CALL_DEFAULTS, { ...CALL_DEFAULTS, callWindowAfterTripMin: 90 }), ["Call window after the trip: 60 min → 90 min"]);
  assert.deepEqual(callSettingsLines(CALL_DEFAULTS, { ...CALL_DEFAULTS, on: false }), ["Calls: On → Off"]);
});

test("job 8 (fail-before: never sent): Save writes CountryRules.calls and keeps a saved calls block when the panel has none", () => {
  const input = { tips: [10], raiseSteps: [50], driverBonus: { defaultLimit: 200, hardMax: 1000 } };
  assert.equal(countryRulesOf("SE", "SEK", input, null)["calls"], undefined, "nothing set: the server defaults");
  assert.deepEqual(countryRulesOf("SE", "SEK", { ...input, calls: { ...CALL_DEFAULTS, callWindowAfterTripMin: 45 } }, null)["calls"], { ...CALL_DEFAULTS, callWindowAfterTripMin: 45 });
  const base = { calls: { on: false, mode: "in_app" } };
  assert.deepEqual(countryRulesOf("SE", "SEK", input, base)["calls"], base.calls, "a save without calls keeps the stored block");
});

test("job 8: Trip details › Calls reads GET /admin/trips/{tripId}/calls and names who called whom, how long and how it ended", async () => {
  const items: CallView[] = [
    { callId: "c2", tripId: "T1", from: "driver", to: "rider", state: "missed", startedAt: "2026-11-05T10:05:00Z", answeredAt: null, endedAt: "2026-11-05T10:05:30Z", endedReason: "missed", seconds: 0 },
    { callId: "c1", tripId: "T1", from: "rider", to: "driver", state: "ended", startedAt: "2026-11-05T10:00:00Z", answeredAt: "2026-11-05T10:00:05Z", endedAt: "2026-11-05T10:01:10Z", endedReason: "hangup", seconds: 65 },
  ];
  const asked: string[] = [];
  const got = await readTripCalls(async (path) => { asked.push(path); return { items }; }, "T1");
  assert.deepEqual(asked, ["/admin/trips/T1/calls"]);
  assert.equal(got.length, 2);
  assert.deepEqual(callLogLine(items[1]!, "Anna", "Omar"), { who: "Anna called Omar", detail: "1:05 min · Hung up", answered: true, tone: "ok" });
  assert.deepEqual(callLogLine(items[0]!, "Anna", "Omar"), { who: "Omar called Anna", detail: "Not answered", answered: false, tone: "missed" });
  // No phone number ever shows.
  assert.ok(!JSON.stringify(callLogLine(items[1]!, "Anna", "Omar")).match(/\+\d{6,}/));
});

test("job 8: every new admin text has sv and fr", () => {
  for (const key of ["Calls", "Calls on", "Call window after the trip (min)", "Ring time (s)", "Longest call (min)", "Calls between rider and driver", "No calls on this trip.", "Hung up", "Declined", "Call failed", "Too long", "Trip cancelled"]) {
    assert.ok((sv as Record<string, string>)[key], `sv: ${key}`);
    assert.ok((fr as Record<string, string>)[key], `fr: ${key}`);
  }
});

// Job 8 screenshot check (2026-11-05): the 3 number boxes had no visible label, and a call that was answered and then
// ended "Call failed" showed the green answered icon.
test("job 8 shots: each Calls number box has a visible label (sv/fr/en), like the airport queue fields", async () => {
  const { CALL_FIELDS } = await import("./callSettings.ts");
  assert.deepEqual(CALL_FIELDS.map((f) => [f.key, f.label]), [
    ["callWindowAfterTripMin", "Window after drop-off (min)"],
    ["ringSeconds", "Ring time (s)"],
    ["maxCallMin", "Longest call (min)"],
    ["connectTimeoutSeconds", "Connect time limit (s)"], // v0.18.66 §87
  ]);
  for (const f of CALL_FIELDS) {
    assert.ok((sv as Record<string, string>)[f.label], `sv: ${f.label}`);
    assert.ok((fr as Record<string, string>)[f.label], `fr: ${f.label}`);
  }
  const { readFileSync } = await import("node:fs");
  const panel = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /<label key=\{field\.key\} className="field"><span>\{tr\(field\.label\)\}<\/span><NumberField/, "a visible <span> label wraps each box");
});

test("job 8 shots: a call that ended 'failed' shows the failed state, also after it was answered", () => {
  const failed: CallView = { callId: "c3", tripId: "T1", from: "driver", to: "rider", state: "ended", startedAt: "2026-11-05T08:40:00Z", answeredAt: "2026-11-05T08:40:06Z", endedAt: "2026-11-05T08:40:20Z", endedReason: "failed", seconds: 14 };
  assert.equal(callLogLine(failed, "Ida", "Sara").tone, "failed");
  assert.equal(callLogLine({ ...failed, endedReason: "hangup" }, "Ida", "Sara").tone, "ok");
  assert.equal(callLogLine({ ...failed, answeredAt: null, state: "missed", endedReason: "missed", seconds: 0 }, "Ida", "Sara").tone, "missed");
});
