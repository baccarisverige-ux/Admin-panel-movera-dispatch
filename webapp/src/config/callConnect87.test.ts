import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CALL_DEFAULTS, CALL_FIELDS, CALL_RANGES, callSettingsIssues, callSettingsLines, callSettingsOf } from "./callSettings.ts";
import { completeCountrySettings, defaultCountrySettings } from "./countrySettings.ts";
import { countryRulesOf } from "../live/configDocs.ts";
import { translationLines } from "../live/tripChat.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";
import { en } from "../i18n/en.ts";

// Contract v0.18.66 §87 (owner answers 2026-11-11 evening, Rule 0 / Rule 16).
const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

test("§87 (fail-before: no field): Calls › Connect time limit (s) reads the contract default 25 and range 10–60", () => {
  assert.equal(CALL_DEFAULTS.connectTimeoutSeconds, C.configDefaults.calls.connectTimeoutSeconds);
  assert.equal(CALL_DEFAULTS.connectTimeoutSeconds, 25);
  assert.deepEqual([...CALL_RANGES.connectTimeoutSeconds], C.inAppCalls.settings.ranges.connectTimeoutSeconds);
  assert.equal(callSettingsOf(undefined).connectTimeoutSeconds, 25, "never saved = 25");
  assert.equal(callSettingsOf({ connectTimeoutSeconds: 40 }).connectTimeoutSeconds, 40);
  assert.equal(callSettingsOf({ connectTimeoutSeconds: 5 }).connectTimeoutSeconds, 25, "out of range reads as the default");
  assert.equal(defaultCountrySettings("TN").calls.connectTimeoutSeconds, 25);
  assert.equal(completeCountrySettings("FR", { calls: { ringSeconds: 40 } }).calls.connectTimeoutSeconds, 25);
  const field = CALL_FIELDS.find((f) => f.key === "connectTimeoutSeconds");
  assert.ok(field, "the Calls card shows the field");
  assert.equal(field.label, "Connect time limit (s)");
  assert.equal((sv as Record<string, string>)[field.label], "Tid att ansluta (s)");
  assert.equal((fr as Record<string, string>)[field.label], "Délai de connexion (s)");
});

test("§87: an out-of-range connect time is refused before Save; a change is listed", () => {
  assert.deepEqual(callSettingsIssues("Sweden", { ...CALL_DEFAULTS, connectTimeoutSeconds: 10 }), []);
  assert.deepEqual(callSettingsIssues("Sweden", { ...CALL_DEFAULTS, connectTimeoutSeconds: 60 }), []);
  assert.equal(callSettingsIssues("Sweden", { ...CALL_DEFAULTS, connectTimeoutSeconds: 9 }).length, 1);
  assert.equal(callSettingsIssues("Sweden", { ...CALL_DEFAULTS, connectTimeoutSeconds: 61 }).length, 1);
  assert.equal(callSettingsIssues("Sweden", { ...CALL_DEFAULTS, connectTimeoutSeconds: 25.5 }).length, 1);
  assert.deepEqual(callSettingsLines(CALL_DEFAULTS, { ...CALL_DEFAULTS, connectTimeoutSeconds: 40 }), ["Connect time limit: 25 s → 40 s"]);
});

test("§87: Save sends calls.connectTimeoutSeconds in country_rules", () => {
  const input = { tips: [10], raiseSteps: [50], driverBonus: { defaultLimit: 200, hardMax: 1000 } };
  const doc = countryRulesOf("SE", "SEK", { ...input, calls: { ...CALL_DEFAULTS, connectTimeoutSeconds: 45 } }, null);
  assert.equal((doc["calls"] as { connectTimeoutSeconds: number }).connectTimeoutSeconds, 45);
});

test("§87: the admin trip chat shows each kept translation under the original, labelled by language; nothing when absent", () => {
  assert.deepEqual(translationLines({ text: "Hej" }), []);
  assert.deepEqual(translationLines({ text: "Hej", translations: [] }), []);
  assert.deepEqual(translationLines({ text: "Hej", translations: [{ to: "en", text: "Hi" }, { to: "fr", text: "Salut" }] }), [
    { label: "Translation (EN)", text: "Hi", lang: "en" },
    { label: "Translation (FR)", text: "Salut", lang: "fr" },
  ]);
  assert.deepEqual(translationLines({ text: "Hej", translations: [{ to: "en", text: "" }, { to: "", text: "x" }] as never }), [], "empty entries are skipped");
  assert.equal((en as Record<string, string>)["Translation ({0})"], "Translation ({0})");
  assert.equal((sv as Record<string, string>)["Translation ({0})"], "Översättning ({0})");
  assert.equal((fr as Record<string, string>)["Translation ({0})"], "Traduction ({0})");
  // Both chat views render the lines under the original; no translate button for the admin.
  for (const file of ["../live/LiveTripChat.tsx", "../live/LiveChat.tsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(src, /<MessageBody message=\{message\} \/>/, `${file} shows the original + translations`);
    assert.doesNotMatch(src, /messages\/translate/, `${file} never asks for a new translation`);
  }
});
