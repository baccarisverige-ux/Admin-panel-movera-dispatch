/**
 * Owner 2026-11-14 "Yes add app fee in same card": each car-type card of Pricing › Commission has an editable
 * "App fee %" next to the commission % and the steps. It is the SAME setting as Pricing › Limits › App fee
 * (prices.<category>.appFeePct, 0–50 %, the existing check), so both places always show one number; the calculator
 * also shows the app fee the rider pays on top. Fail-before: every test below fails on b223880c.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import * as Z from "./zonePricing.ts";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const api = Z as unknown as Record<string, unknown>;

test("the card and Pricing › Limits edit ONE value: prices.<category>.appFeePct, both ways", () => {
  const patch = api["patchCategoryPrice"] as (draft: Z.ZoneBook, id: string, p: Partial<Z.CategoryPrice>) => void;
  assert.equal(typeof patch, "function", "one shared change function");
  const book = Z.defaultZoneBook("Z001");
  const limitsRow = Z.PRICE_ROWS.find((row) => row.field === "appFeePct")!;
  patch(book, "economy", { appFeePct: 15 }); // the card's App fee % field
  assert.equal(book.prices["economy"]![limitsRow.field], 15, "Limits shows what the card set");
  patch(book, "economy", { appFeePct: 7 }); // Pricing › Limits
  assert.equal(book.prices["economy"]!.appFeePct, 7, "the card shows what Limits set");
  const page = source("../pages/PricingPage.tsx");
  assert.match(page, /onAppFee=\{\(id, value\) => update\(\(draft\) => patchCategoryPrice\(draft, id, \{ appFeePct: value \}\)\)\}/);
  assert.match(page, /onChange=\{\(categoryId, patch: Partial<CategoryPrice>\) => update\(\(draft\) => patchCategoryPrice\(draft, categoryId, patch\)\)\}/);
  const panel = source("./CommissionPanel.tsx");
  assert.match(panel, /data-testid="card-app-fee"/);
  assert.match(panel, /value=\{appFee\} unit="%" max=\{APP_FEE_MAX_PCT\}/);
  assert.match(panel, /const appFee = book\.prices\[category\.id\]\?\.appFeePct \?\? 0;/);
});

test("the 50 % cap: 50 is allowed, 51 is refused at the same field Limits marks", () => {
  assert.equal(api["APP_FEE_MAX_PCT"], 50);
  assert.equal(Z.priceMax("appFeePct", "SE"), 50);
  const book = Z.defaultZoneBook("Z001");
  book.prices["economy"]!.appFeePct = 50;
  assert.ok(!Z.validateZoneBook(book, Z.BUILT_IN_CATEGORIES).some((p) => p.path === "prices.economy.appFeePct"));
  book.prices["economy"]!.appFeePct = 51;
  assert.ok(Z.validateZoneBook(book, Z.BUILT_IN_CATEGORIES).some((p) => p.path === "prices.economy.appFeePct"), "51 % refused");
});

test("the app fee is half-up on the trip price; the calculator counts it in \"Movera gets\" (owner 2026-11-14: amounts only); texts in sv/fr/en", () => {
  const fee = api["appFeeOfMinor"] as (price: number, pct: number) => number;
  assert.equal(fee(6025, 10), 603, "6.025 DT × 10 % = 0.6025 → 0.603 DT");
  assert.equal(fee(20000, 12), 2400);
  assert.match(source("./CommissionSteps.tsx"), /resultLines\(\{ pct, steps \}, base, appFeePct\)/);
  for (const d of [en, fr, sv] as Record<string, string>[]) assert.ok(d["{0} app fee"] && d["Movera gets"], "sv/fr/en");
  assert.equal((fr as Record<string, string>)["App fee"], "Frais de plateforme");
});
