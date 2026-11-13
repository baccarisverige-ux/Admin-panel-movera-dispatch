import assert from "node:assert/strict";
import test from "node:test";
import { stopPriceText } from "./stopPrice.ts";

test("G7 live fix: the Stops card shows Pricing's stop price per minute as an amount (SE and FR)", () => {
  const kr = (v: number) => `${v} kr`;
  const eur = (v: number) => `${v.toFixed(2)} €`;
  assert.equal(stopPriceText([{ stopPerMin: 5 }, { stopPerMin: 5 }], kr), "Price per minute: 5 kr");
  assert.equal(stopPriceText([{ stopPerMin: 0.45 }, { stopPerMin: 0.6 }], eur), "Price per minute: 0.45 € – 0.60 €");
  assert.equal(stopPriceText([{}], kr), "Price per minute: Pricing");
  assert.equal(stopPriceText([], kr), "Price per minute: Pricing");
});

test("A1 (v0.18.85, owner 2026-11-02 driver-g6.md:96): the Stops card also says what the rider pays, with the app fee", () => {
  const kr = (v: number) => `${v.toFixed(2)} kr`;
  assert.equal(stopPriceText([{ stopPerMin: 5, appFeePct: 10 }], kr), "Price per minute: 5.00 kr · rider pays 5.50 kr (incl. app fee)");
  assert.equal(stopPriceText([{ stopPerMin: 5, appFeePct: 10 }, { stopPerMin: 9, appFeePct: 12 }], kr), "Price per minute: 5.00 kr – 9.00 kr · rider pays 5.50 kr – 10.08 kr (incl. app fee)");
});
