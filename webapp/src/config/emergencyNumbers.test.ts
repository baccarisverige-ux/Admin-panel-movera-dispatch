/** v0.18.57 §79: Tips & limits › Emergency numbers (CountryRules.emergencyNumbers, country standard only). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EMERGENCY_DEFAULTS, EMERGENCY_KINDS, emergencyLabel, emergencyNumbersIssues, emergencyNumbersOf } from "./emergencyNumbers.ts";
import { completeCountrySettings, countrySettingsIssues, countrySettingsLines, defaultCountrySettings } from "./countrySettings.ts";
import { countryRulesOf } from "../live/configDocs.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const row = (number: string, name = "Police") => ({ kind: "police" as const, number, label: { sv: name, fr: name, en: name } });

test("defaults and kinds equal contract.json (SE/FR 112, TN police 197 + SAMU 190)", () => {
  assert.deepEqual(EMERGENCY_DEFAULTS, C.configDefaults.emergencyNumbers);
  assert.deepEqual([...EMERGENCY_KINDS], C.emergencyNumbers.kinds);
  assert.deepEqual(defaultCountrySettings("TN").emergencyNumbers.map((r) => r.number), ["197", "190"]);
});

test("a stored list is read; nothing stored is the default", () => {
  assert.deepEqual(completeCountrySettings("SE", { emergencyNumbers: [row("114")] }).emergencyNumbers, [row("114")]);
  assert.deepEqual(emergencyNumbersOf(undefined, "FR").map((r) => r.number), ["112"]);
  assert.equal(emergencyLabel(EMERGENCY_DEFAULTS.TN[1]!, "fr"), "SAMU (ambulance)");
});

test("checks match the server's invalid_emergency_numbers: 1–6 rows, pattern, three names 1–40", () => {
  assert.deepEqual(emergencyNumbersIssues("Sweden", [row("112")]), []);
  assert.deepEqual(emergencyNumbersIssues("Sweden", [row("+46114")]), []);
  for (const bad of [[], Array.from({ length: 7 }, () => row("112")), [row("1")], [row("11a")], [row("112", "")], [row("112", "x".repeat(41))]]) {
    assert.equal(emergencyNumbersIssues("Sweden", bad).length, 1);
  }
  const settings = { ...defaultCountrySettings("SE"), emergencyNumbers: [] };
  assert.ok(countrySettingsIssues("SE", settings).some((line) => line.includes("emergency")));
  assert.equal(countrySettingsLines("SE", defaultCountrySettings("SE"), { ...defaultCountrySettings("SE"), emergencyNumbers: [row("114")] }).length, 1);
});

test("saved on the country standard only: the document carries the list when given, never otherwise", () => {
  const input = { tips: [], raiseSteps: [], driverBonus: { defaultLimit: 100, hardMax: 500 } };
  assert.deepEqual(countryRulesOf("SE", "SEK", { ...input, emergencyNumbers: [row("114")] }, null)["emergencyNumbers"], [row("114")]);
  assert.equal("emergencyNumbers" in countryRulesOf("SE", "SEK", input, { emergencyNumbers: [row("114")] }), false);
});
