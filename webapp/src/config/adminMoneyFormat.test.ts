import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { stopPriceText } from "../dispatch/stopPrice.ts";
import { money } from "../pricing/zonePricing.ts";

/**
 * GM check item 13 (Rules plan/GM-REPORT.md): admin money always shows the currency's own decimals (SEK/EUR 2,
 * TND 3), never "at most N decimals". The owner's A1 examples (Rules decisions/driver-g6.md:96, contract
 * waitingPriceShown) read "5,50 kr" and "0,55 €"; the Dispatch page showed "5,5 kr".
 */
test("the Stops card with the shared formatter reads 5,50 kr, 0,55 € and 0.550 DT", () => {
  const kr = (value: number) => money(value, "SE");
  const eur = (value: number) => money(value, "FR");
  const dt = (value: number) => money(value, "TN");
  assert.equal(stopPriceText([{ stopPerMin: 5, appFeePct: 10 }, { stopPerMin: 9, appFeePct: 12 }], kr), "Price per minute: 5,00 kr – 9,00 kr · rider pays 5,50 kr – 10,08 kr (incl. app fee)");
  assert.equal(stopPriceText([{ stopPerMin: 0.5, appFeePct: 10 }], eur, 100), "Price per minute: 0,50 € · rider pays 0,55 € (incl. app fee)");
  assert.equal(stopPriceText([{ stopPerMin: 0.5, appFeePct: 10 }], dt, 1000), "Price per minute: 0.500 DT · rider pays 0.550 DT (incl. app fee)");
});

const SRC = join(import.meta.dirname, "..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return files(path);
  return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
});

test("no admin money is formatted with at most N decimals (it uses the shared money formatter)", () => {
  // A number format with a decimal cap followed by the currency symbol, or Intl's currency style with a cap.
  const capped = /maximumFractionDigits:\s*[1-3]\b[^\n]*(\$\{\s*symbol\s*\}|\$\{\s*SYMBOL\[|style:\s*"currency")|style:\s*"currency"[^\n]*maximumFractionDigits:\s*[1-3]\b/;
  const found = files(SRC).flatMap((path) => readFileSync(path, "utf8").split("\n").map((line, index) => (capped.test(line) ? `${relative(SRC, path)}:${index + 1}` : null)).filter((hit): hit is string => hit !== null));
  assert.deepEqual(found, []);
});
