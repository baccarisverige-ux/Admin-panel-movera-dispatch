/**
 * v0.18.164 France document lists + upload safety (owner 2026-11-25 "Moins de 6 ans", "Cherche Uber fait quoi et colle",
 * "Garder macaron + 4 photos", REVTC 60, "Yes, fix all 3"): the FR defaults equal the contract, the car age setting per
 * country (Sweden unchanged), company papers with owner fleet stay addable, and "No file" blocks Open/Approve.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contractJson } from "../contract/load.ts";
import { addableTypes, defaultDoc, settingsProblem } from "../drivers/onboardingSettings.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { tooOldForAge } from "../vehicles/rules.ts";

const c = contractJson("contract.json") as { driverOnboarding: { settings: { defaults: Record<string, { documents: unknown; vehicles: Record<string, unknown>; validMonths: unknown; guides: unknown }> }; documents: { types: Record<string, { owner: string }> } } };

test("FR defaults: Uber FR fleet, 6 years rolling + exempt, REVTC 60, insurance guide, same as the contract", () => {
  const doc = defaultDoc("FR");
  const fromContract = c.driverOnboarding.settings.defaults.FR!;
  assert.deepEqual(doc.documents, fromContract.documents);
  assert.deepEqual(doc.documents.fleet, ["company_registration", "vtc_register_certificate", "rc_pro_insurance", "bank_statement"]);
  assert.deepEqual(doc.documents.vehicle, ["vehicle_registration", "insurance", "vtc_sticker"]);
  assert.equal(doc.vehicles.maxAgeYears, 6);
  assert.equal(doc.vehicles.hybridElectricExempt, true);
  assert.deepEqual(doc.validMonths, fromContract.validMonths);
  assert.deepEqual(doc.guides, fromContract.guides);
  assert.equal(defaultDoc("SE").vehicles.maxAgeYears, undefined);
});

test("car age: rolling, hybrid and electric exempt, off when missing", () => {
  const now = new Date("2026-11-25T00:00:00Z");
  const rules = { maxAgeYears: 6, hybridElectricExempt: true };
  assert.equal(tooOldForAge({ year: 2019, fuel: "petrol" }, rules, now), true);
  assert.equal(tooOldForAge({ year: 2020, fuel: "diesel" }, rules, now), false);
  assert.equal(tooOldForAge({ year: 2015, fuel: "electric" }, rules, now), false);
  assert.equal(tooOldForAge({ year: 2015, fuel: "hybrid" }, { maxAgeYears: 6, hybridElectricExempt: false }, now), true);
  assert.equal(tooOldForAge({ year: 2001, fuel: "petrol" }, {}, now), false);
  const doc = defaultDoc("FR");
  assert.equal(settingsProblem({ ...doc, vehicles: { ...doc.vehicles, maxAgeYears: 0 } }), "Car age: 1 to 30 years.");
  assert.equal(settingsProblem(doc), null);
});

test("company papers have owner fleet and can still be added to the person and company lists", () => {
  for (const t of ["vtc_register_certificate", "rc_pro_insurance", "urssaf_certificate", "company_registration"]) assert.equal(c.driverOnboarding.documents.types[t]!.owner, "fleet", t);
  const doc = defaultDoc("FR");
  assert.ok(addableTypes(doc, "fleet").includes("urssaf_certificate"));
  assert.ok(addableTypes(doc, "fleet").includes("national_id"));
  assert.ok(!addableTypes(doc, "vehicle").includes("rc_pro_insurance"));
});

test("upload safety: a file document without a file shows No file, no Open, no Approve (Reject stays)", () => {
  const src = readFileSync(new URL("./DocumentsTable.tsx", import.meta.url), "utf8");
  assert.match(src, /const hasFile = row\.document\?\.hasFile !== false/);
  assert.match(src, /canDecide = Boolean\([^;]*!noFile\)/);
  assert.match(src, /canOpen = Boolean\(uploaded && fileType && hasFile\)/);
  assert.match(src, /tr\("No file"\)/);
});

test("texts in sv / fr / en", () => {
  for (const key of ["Car age", "Maximum car age", "Hybrid and electric cars are exempt from the age limit", "No file", "Model year {0} or newer this year."] as const) {
    for (const dict of [en, fr, sv] as Array<Record<string, string>>) assert.ok(dict[key], key);
  }
  assert.equal((fr as Record<string, string>)["No file"], "Aucun fichier");
});
