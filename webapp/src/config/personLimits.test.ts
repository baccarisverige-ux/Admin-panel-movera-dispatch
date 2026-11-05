import { test } from "node:test";
import assert from "node:assert/strict";
import { completeCountrySettings, countrySettingsIssues, countrySettingsLines, personLimitsOf } from "./countrySettings.ts";
import { countryRulesOf } from "../live/configDocs.ts";

/** Owner 2026-11-04: saved places and emergency contacts per person are an admin setting per country (50 / 10). */
test("defaults 50 and 10; out-of-range values read as the defaults", () => {
  assert.deepEqual(personLimitsOf(undefined), { savedPlacesPerPerson: 50, emergencyContactsPerPerson: 10 });
  assert.deepEqual(personLimitsOf({ savedPlacesPerPerson: 20, emergencyContactsPerPerson: 999 }), { savedPlacesPerPerson: 20, emergencyContactsPerPerson: 10 });
});

test("a change is listed and checked", () => {
  const before = completeCountrySettings("SE", null);
  const after = { ...before, personLimits: { savedPlacesPerPerson: 30, emergencyContactsPerPerson: 0 } };
  assert.ok(countrySettingsLines("SE", before, after).some((line) => line.includes("30")));
  assert.ok(countrySettingsIssues("SE", after).length > 0);
});

test("saving keeps the country's other limits and writes the per-person ones", () => {
  const doc = countryRulesOf("SE", "SEK", { tips: [], raiseSteps: [], driverBonus: { defaultLimit: 100, hardMax: 1000 }, personLimits: { savedPlacesPerPerson: 30, emergencyContactsPerPerson: 5 } }, { limits: { uploadsPerHour: 40 } });
  assert.deepEqual(doc["limits"], { uploadsPerHour: 40, savedPlacesPerPerson: 30, emergencyContactsPerPerson: 5 });
});
