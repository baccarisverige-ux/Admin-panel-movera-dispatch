import { test } from "node:test";
import assert from "node:assert/strict";
import { formatOre } from "../domain/contract.ts";
import { CURRENCIES, formatMoney, fromMajor, isMoney, moneySchema, toMajorString, type Money } from "../domain/money.ts";
import { contractJson } from "./load.ts";

const contract = contractJson<{ currencies: Record<string, { exponent: number; symbol: string }> }>("contract.json");
const fixtures = contractJson<{ cases: { money: Money; major: string }[]; invalid: unknown[] }>("fixtures/money.json");

test("currencies equal contract.json#currencies", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(CURRENCIES).map(([code, item]) => [code, { exponent: item.exponent, symbol: item.symbol }])), contract.currencies);
});

test("fixtures/money.json replays identically", () => {
  for (const item of fixtures.cases) {
    assert.ok(isMoney(item.money), JSON.stringify(item.money));
    assert.equal(toMajorString(item.money), item.major);
  }
  for (const item of fixtures.invalid) assert.equal(moneySchema.safeParse(item).success, false, JSON.stringify(item));
});

test("formatMoney prints each currency's decimals and symbol", () => {
  assert.equal(formatMoney({ amountMinor: 12675, currency: "SEK" }), "126,75 kr");
  assert.equal(formatMoney({ amountMinor: -2000, currency: "SEK" }), "-20,00 kr");
  assert.equal(formatMoney({ amountMinor: 335, currency: "EUR" }), "3,35 €");
  assert.equal(formatMoney({ amountMinor: 12500, currency: "TND" }), "12,500 DT");
  assert.equal(formatMoney({ amountMinor: 123456789, currency: "SEK" }), "1 234 567,89 kr");
  assert.equal(formatMoney({ amountMinor: 335, currency: "EUR" }, "en-GB"), "3.35 €");
  assert.deepEqual(fromMajor(12.5, "TND"), { amountMinor: 12500, currency: "TND" }, "TND has 1000 millimes");
  // formatOre is the deprecated SEK wrapper and keeps its exact output.
  assert.equal(formatOre(1234567), "12345,67 kr");
  assert.equal(formatOre(-5), "-0,05 kr");
});
