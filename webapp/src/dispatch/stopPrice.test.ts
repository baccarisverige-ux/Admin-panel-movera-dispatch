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
