/**
 * J5b admin (contract v0.18.86, contract.json#commissionSteps; owner 2026-11-13 ~20:48 / ~21:40 / ~22:46 UTC): the
 * commission steps of each car-type card. ONE shared function (pricing/commissionSteps.ts) does the validation, the
 * pick, the warning and the calculator; these tests replay EVERY validate, pick and warn case of
 * fixtures/commission_steps.json through it (the calculator's own code), and check the places that use it: Test a ride
 * (fixtures/fares.json commission_steps_*), the pricing document both ways, a %-only save keeping the server's steps,
 * Copy zones, the client-side validation, the Dispatch previews (fare raise) and the sv/fr/en texts from the contract.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiError } from "../api/httpClient.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { bookOfPricing, patchChanged, pricingDocumentOf, type Doc } from "../live/configDocs.ts";
import { errorText } from "../live/format.ts";
import { raiseSplit } from "../dispatch/rules.ts";
import { calculate, commissionOfMajor, splitRidePart, stepWarnings, validateSteps, type CommissionStep } from "./commissionSteps.ts";
import { copyInto, defaultZoneBook, quoteRide, validateZoneBook, BUILT_IN_CATEGORIES } from "./zonePricing.ts";

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../contracts/${path}`, import.meta.url), "utf8"));
const C = read("contract.json").commissionSteps;
const F = read("fixtures/commission_steps.json") as {
  validate: Array<{ id: string; steps: unknown; expect: "ok" | { step: number | null; problem: string } }>;
  pick: Array<{ id: string; commissionPct: number; steps: CommissionStep[]; commissionBase: { amountMinor: number; currency: string; exact?: string }; expect: { step: number | null; driverRidePart: number; commission: number | string } }>;
  warn: Array<{ id: string; steps: CommissionStep[]; expect: Array<{ step: number; upToMinor: number; atLimit: number; justAbove: number }> }>;
};

test("fixtures: every validate case gives the server's first problem (or ok)", () => {
  assert.ok(F.validate.length >= 17);
  for (const item of F.validate) {
    const got = validateSteps(item.steps);
    assert.deepEqual(got ?? "ok", item.expect, item.id);
  }
});

test("fixtures: every pick case through the calculator's own function (step, driverRidePart, commission as a number)", () => {
  assert.ok(F.pick.length >= 13);
  for (const item of F.pick) {
    const base = item.commissionBase.exact ?? item.commissionBase.amountMinor;
    const rule = { pct: item.commissionPct, steps: item.steps };
    const split = splitRidePart(rule, base);
    assert.equal(split.step, item.expect.step, `${item.id} step`);
    assert.equal(split.driverRidePart, item.expect.driverRidePart, `${item.id} driverRidePart`);
    assert.equal(split.commission, Number(item.expect.commission), `${item.id} commission`);
    const calc = calculate(rule, base);
    assert.ok(calc.ok, item.id);
    assert.equal(calc.split.step, item.expect.step, `${item.id} calculator step`);
    assert.equal(calc.driverGets, item.expect.driverRidePart, `${item.id} calculator driver gets`);
    assert.equal(calc.split.commission, Number(item.expect.commission), `${item.id} calculator commission`);
  }
  const exact = F.pick.find((item) => item.id === "tn_fraction_just_above_5")!;
  assert.equal(splitRidePart({ pct: 20, steps: exact.steps }, "5000.4").commissionText, "900.4", "exact base: the commission is the exact decimal");
});

test("fixtures: every warn case (atLimit, justAbove) — the editor warning agrees with the calculator at L and L + 1", () => {
  assert.ok(F.warn.length >= 8);
  for (const item of F.warn) {
    assert.deepEqual(stepWarnings(item.steps), item.expect, item.id);
    // v0.18.88: the card has no limit rows any more; typing L and L + 1 into the one calculator gives the warned amounts.
    for (const warning of item.expect) {
      const at = calculate({ pct: 20, steps: item.steps }, warning.upToMinor);
      const above = calculate({ pct: 20, steps: item.steps }, warning.upToMinor + 1);
      assert.ok(at.ok && above.ok, item.id);
      assert.deepEqual([at.split.step, at.driverGets, above.split.step, above.driverGets], [warning.step, warning.atLimit, warning.step + 1, warning.justAbove], `${item.id} calculator at L / L + 1`);
    }
  }
});

test("calculator: the owner's TN steps at 6.025 DT; invalid steps show the problem, not numbers", () => {
  const steps: CommissionStep[] = [{ upToMinor: 5000, amountMinor: 1000 }, { upToMinor: 15000, pct: 18 }, { upToMinor: null, pct: 20 }];
  const calc = calculate({ pct: 20, steps }, 6025);
  assert.ok(calc.ok);
  assert.deepEqual([calc.split.step, calc.driverGets, calc.split.commission], [1, 4941, 1084]);
  const none = calculate({ pct: 20, steps: [] }, 19700);
  assert.ok(none.ok);
  assert.deepEqual([none.split.step, none.driverGets, none.split.commission], [null, 15760, 3940]);
  const bad = calculate({ pct: 20, steps: [{ upToMinor: 5000, amountMinor: 1000 }, { upToMinor: 15000, pct: 18 }] }, 6025);
  assert.deepEqual(bad, { ok: false, problem: { step: 1, problem: "last_not_above" } });
});

/** fixtures/config/pricing_document.json (Z001, SEK) with the fare case's overrides deep-merged. */
function fareDoc(overrides: Doc): Doc {
  const merge = (a: unknown, b: unknown): unknown => (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b) ? { ...(a as Doc), ...Object.fromEntries(Object.entries(b as Doc).map(([k, v]) => [k, k in (a as Doc) ? merge((a as Doc)[k], v) : v])) } : b);
  return merge(read("fixtures/config/pricing_document.json"), overrides) as Doc;
}

test("Test a ride: fixtures/fares.json commission_steps_* give the server's driverEarnings and Movera share", () => {
  const cases = (read("fixtures/fares.json").cases as Array<{ id: string; overrides: Doc; input: { categoryId: string; km: number; minutes: number; waitingChargedSeconds?: number }; expect: { total: { amountMinor: number }; driverEarnings: { amountMinor: number }; moveraShare: { amountMinor: number } } }>).filter((item) => item.id.startsWith("commission_steps_"));
  assert.equal(cases.length, 4);
  for (const item of cases) {
    const book = bookOfPricing(fareDoc(item.overrides), defaultZoneBook("Z001"));
    const freeWait = book.prices[item.input.categoryId].freeWaitMin;
    const quote = quoteRide(book, { categoryId: item.input.categoryId, km: item.input.km, minutes: item.input.minutes, waitMin: item.input.waitingChargedSeconds ? freeWait + item.input.waitingChargedSeconds / 60 : 0, stops: 0, stopWaitMin: 0, airportPickup: false, airportDropoff: false, reservation: false, surge: 1 });
    assert.equal(Math.round(quote.total * 100), item.expect.total.amountMinor, `${item.id} total`);
    assert.equal(Math.round(quote.driverGets * 100), item.expect.driverEarnings.amountMinor, `${item.id} driver`);
    assert.equal(Math.round(quote.moveraGets * 100), item.expect.moveraShare.amountMinor, `${item.id} Movera`);
  }
  const pctCase = cases.find((item) => item.id === "commission_steps_pct_step")!;
  const quote = quoteRide(bookOfPricing(fareDoc(pctCase.overrides), defaultZoneBook("Z001")), { categoryId: "economy", km: 8, minutes: 18, waitMin: 0, stops: 0, stopWaitMin: 0, airportPickup: false, airportDropoff: false, reservation: false, surge: 1 });
  assert.equal(quote.commissionStep, 1, "Test a ride says which step was used");
});

const TN_STEPS: CommissionStep[] = [{ upToMinor: 5000, amountMinor: 1000 }, { upToMinor: 15000, pct: 18 }, { upToMinor: null, pct: 20 }];

test("pricing document: the admin always writes commissionSteps ([] when none) and reads the server's back", () => {
  const book = defaultZoneBook("Z001");
  const doc = pricingDocumentOf(book, "Z001", null) as { categories: Record<string, Doc> };
  for (const category of BUILT_IN_CATEGORIES) assert.deepEqual(doc.categories[category.id]["commissionSteps"], [], category.id);
  const withSteps = structuredClone(doc) as { categories: Record<string, Doc> };
  withSteps.categories["economy"]["commissionSteps"] = TN_STEPS;
  const back = bookOfPricing(withSteps as unknown as Doc, defaultZoneBook("Z001"));
  assert.deepEqual(back.commissionSteps["economy"], TN_STEPS);
  assert.deepEqual(back.commissionSteps["comfort"], []);
  assert.deepEqual((pricingDocumentOf(back, "Z001", null) as { categories: Record<string, Doc> }).categories["economy"]["commissionSteps"], TN_STEPS);
});

test("supervisor: saving only the % keeps the server's steps; Remove all steps writes []", () => {
  const server = structuredClone(read("fixtures/config/pricing_document.json")) as { categories: Record<string, Doc> };
  server.categories["economy"]["commissionSteps"] = TN_STEPS;
  const prior = bookOfPricing(server as unknown as Doc, defaultZoneBook("Z001"));
  const edited = structuredClone(prior);
  edited.commission["economy"] = 22;
  const saved = patchChanged(server as unknown as Doc, pricingDocumentOf(prior, "Z001", server as unknown as Doc), pricingDocumentOf(edited, "Z001", server as unknown as Doc)) as { categories: Record<string, Doc> };
  assert.equal(saved.categories["economy"]["commissionPct"], 22);
  assert.deepEqual(saved.categories["economy"]["commissionSteps"], TN_STEPS, "the server's steps are kept");
  // A server document written before v0.18.86 (no field): a %-only save leaves the field out, the server keeps none.
  const old = structuredClone(read("fixtures/config/pricing_document.json")) as Doc;
  const oldBook = bookOfPricing(old, defaultZoneBook("Z001"));
  const oldEdit = structuredClone(oldBook);
  oldEdit.commission["economy"] = 21;
  const oldSaved = patchChanged(old, pricingDocumentOf(oldBook, "Z001", old), pricingDocumentOf(oldEdit, "Z001", old)) as { categories: Record<string, Doc> };
  assert.equal(oldSaved.categories["economy"]["commissionPct"], 21);
  const removed = structuredClone(prior);
  removed.commissionSteps["economy"] = [];
  const cleared = patchChanged(server as unknown as Doc, pricingDocumentOf(prior, "Z001", server as unknown as Doc), pricingDocumentOf(removed, "Z001", server as unknown as Doc)) as { categories: Record<string, Doc> };
  assert.deepEqual(cleared.categories["economy"]["commissionSteps"], [], "Remove all steps sends [] (never leaves the field out)");
  const changed = structuredClone(prior);
  changed.commissionSteps["economy"] = [{ upToMinor: 5000, amountMinor: 500 }, { upToMinor: null, pct: 25 }];
  const sent = patchChanged(server as unknown as Doc, pricingDocumentOf(prior, "Z001", server as unknown as Doc), pricingDocumentOf(changed, "Z001", server as unknown as Doc)) as { categories: Record<string, Doc> };
  assert.deepEqual(sent.categories["economy"]["commissionSteps"], changed.commissionSteps["economy"], "an edited list is sent whole");
});

test("Copy zones copies the steps (same currency as is; another currency converted to whole minor units)", () => {
  const source = defaultZoneBook("Z001");
  source.commissionSteps["economy"] = [{ upToMinor: 10000, amountMinor: 1500 }, { upToMinor: null, pct: 18 }];
  const same = copyInto(source, defaultZoneBook("Z002"), ["commission"]);
  assert.deepEqual(same.commissionSteps["economy"], source.commissionSteps["economy"]);
  const notCopied = copyInto(source, defaultZoneBook("Z002"), ["prices"]);
  assert.deepEqual(notCopied.commissionSteps["economy"], []);
  // SE → TN: the admin's price rate (TN 0.3 × SEK), kr → DT, öre → millimes (3 decimals).
  const tn = copyInto(source, defaultZoneBook("TN-TC"), ["commission"]);
  assert.deepEqual(tn.commissionSteps["economy"], [{ upToMinor: 30000, amountMinor: 4500 }, { upToMinor: null, pct: 18 }]);
});

test("validation: a step problem stops publishing at the step it names, with the contract's text; a warning does not", () => {
  const book = defaultZoneBook("Z001");
  book.commissionSteps["economy"] = [{ upToMinor: 5000, amountMinor: 1000 }, { upToMinor: 15000, pct: 18 }];
  const problems = validateZoneBook(book, BUILT_IN_CATEGORIES);
  const found = problems.find((item) => item.path.startsWith("commissionSteps.economy"));
  assert.ok(found, "the step problem is listed");
  assert.equal(found.path, "commissionSteps.economy.1");
  assert.ok(found.message.includes(C.texts.errors.last_not_above.en));
  book.commissionSteps["economy"] = [{ upToMinor: 5000, amountMinor: 500 }, { upToMinor: null, pct: 25 }];
  assert.deepEqual(validateZoneBook(book, BUILT_IN_CATEGORIES).filter((item) => item.path.startsWith("commissionSteps")), [], "the advisory warning never blocks");
});

test("server 400 commission_steps_invalid: the problem's text at the step it names", () => {
  const error = new ApiError(400, "invalid", { code: "invalid_request", reason: "commission_steps_invalid", details: ["step:1", "problem:up_to_not_increasing"] });
  const text = errorText(error);
  assert.ok(text.includes(C.texts.errors.up_to_not_increasing.en), text);
  assert.ok(text.includes("2"), "the step is shown counted from 1");
  const many = errorText(new ApiError(400, "invalid", { code: "invalid_request", reason: "commission_steps_invalid", details: ["problem:too_many_steps"] }));
  assert.equal(many, C.texts.errors.too_many_steps.en.replace("{max}", String(C.validation.maxSteps)));
});

test("Dispatch previews (fare raise, offer card): with steps they use the shared function, without steps the %", () => {
  assert.deepEqual(raiseSplit(10, 197, 20), { commission: 39.4, fromCommission: 10, beyond: 0 });
  const rule = { pct: 20, steps: [{ upToMinor: 10000, amountMinor: 1500 }, { upToMinor: 30000, pct: 18 }, { upToMinor: null, pct: 20 }] };
  assert.deepEqual(raiseSplit(50, 197, rule, 100), { commission: 35.46, fromCommission: 35.46, beyond: 14.54 });
  assert.deepEqual(raiseSplit(5, 60, { pct: 20, steps: [] }, 1000), { commission: 12, fromCommission: 5, beyond: 0 });
  assert.deepEqual(commissionOfMajor(rule, 80, 100), { commission: 15, driver: 65, step: 0 });
});

test("texts: every commissionSteps text is in the admin's sv/fr/en dictionaries exactly as the contract has it", () => {
  const all: Array<[string, Record<"sv" | "fr" | "en", string>]> = [];
  const walk = (node: Record<string, unknown>, path: string) => {
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === "object" && "en" in value) all.push([`${path}${key}`, value as Record<"sv" | "fr" | "en", string>]);
      else if (value && typeof value === "object") walk(value as Record<string, unknown>, `${path}${key}.`);
    }
  };
  walk(C.texts, "");
  // Supervisor must-fix 3: an exact set, not a count. The 27 texts of contract 0.18.88 (c88 8c49544); this copy may still
  // be 0.18.86 (33 texts: the 7 removed below are there, calculator.moveraGets is not yet).
  const V88 = ["above", "addStep", "calculator.driverGets", "calculator.moveraGets", "calculator.noStepsPct", "calculator.priceInput", "calculator.title", "calculator.waitingNote", "errors.above_not_last", "errors.amount_out_of_range", "errors.last_not_above", "errors.not_a_list", "errors.pct_or_amount", "errors.pct_out_of_range", "errors.too_many_steps", "errors.up_to_missing", "errors.up_to_not_increasing", "errors.up_to_out_of_range", "help", "kindAmount", "kindPct", "removeAll", "removeStep", "stepUsed", "title", "upTo", "warnDrop"];
  const REMOVED_88 = ["calculator.moveraKeeps", "calculator.aroundLimits", "calculator.atLimit", "calculator.justAbove", "capNote", "calculator.stepUsed", "calculator.commission"];
  const ADDED_88 = ["calculator.moveraGets"];
  const copy = read("contract.json").version as string;
  const paths = all.map(([path]) => path).sort();
  if (copy === "0.18.86") assert.deepEqual(paths, [...V88.filter((p) => !ADDED_88.includes(p)), ...REMOVED_88].sort(), `copy ${copy}`);
  else assert.deepEqual(paths, [...V88].sort(), `copy ${copy}: exactly the 0.18.88 texts`);
  // v0.18.88 (contract.json#commissionSteps.adminCalculator.removed; this admin's copy is still 0.18.86): the limit rows and
  // "Movera keeps" are gone from the calculator, so their texts are not in the dictionaries.
  // Owner 2026-11-14 "This exp never happen cause there is already minimum trip price": no cap note in the card
  // (contract v0.18.88 commissionSteps.texts.capNote removed; the silent cap stays in splitRidePart as a guard).
  // Owner 2026-11-14 "simply write only how much in amount driver get and how much movera get in amount dont write any
  // percentage": the calculator shows only Driver gets / Movera gets (v0.18.88 texts.calculator.stepUsed / commission removed).
  const removed = new Set(REMOVED_88);
  for (const [path, text] of all) {
    if (removed.has(path)) { assert.ok(path === "calculator.commission" || !(text.en in en), `${path} removed`); continue; }
    const key = text.en as keyof typeof en;
    assert.equal(en[key], text.en, `en ${path}`);
    assert.equal(fr[key], text.fr, `fr ${path}`);
    assert.equal(sv[key], text.sv, `sv ${path}`);
  }
});
