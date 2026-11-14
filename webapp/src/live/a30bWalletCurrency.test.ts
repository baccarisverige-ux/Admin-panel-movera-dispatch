import assert from "node:assert/strict";
import test from "node:test";
import { walletCreditProblem } from "./walletCredit.ts";

/**
 * BQ-A30b SF1 (A30b supervisor): Rider › Movera wallet on live. When the rider's currency is not known (an older server
 * that sends no wallet), the box says "The rider's currency is not known." and the button stays disabled; it never
 * sends "SEK" (the same rule as S2 for booked rides).
 */
test("A30b SF1: no currency → the currency problem, whatever is typed", () => {
  assert.equal(walletCreditProblem("5", null), "The rider's currency is not known.");
  assert.equal(walletCreditProblem("", null), "The rider's currency is not known.");
});

test("A30b SF1: a known currency keeps the amount rule (SEK 2 decimals, TND 3)", () => {
  assert.equal(walletCreditProblem("12,50", "SEK"), null);
  assert.equal(walletCreditProblem("12.505", "SEK"), "Enter an amount above 0.");
  assert.equal(walletCreditProblem("12,500", "TND"), null);
  assert.equal(walletCreditProblem("1e3", "TND"), "Enter an amount above 0.");
  assert.equal(walletCreditProblem("", "SEK"), "Enter an amount above 0.");
});
