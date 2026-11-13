import assert from "node:assert/strict";
import test from "node:test";
import { riderPerMin, riderPerMinMinor } from "./waitingShown.ts";

// A1 (contract v0.18.85 waitingPriceShown; owner 2026-11-02 "Show price incl. fee (Recommended)", Rules
// decisions/driver-g6.md:96): the admin sees the waiting price the rider pays, with the category's app fee, rounded
// half-up to a whole minor unit exactly as the server does (src/rules/fare.ts perMinWithAppFee).
test("A1: the rider's price per minute = perMin × (1 + app fee), half-up to the minor unit (SEK, EUR, TND)", () => {
  assert.equal(riderPerMinMinor(1226, 10), 1349, "12,26 kr + 10 % = 13,49 kr");
  assert.equal(riderPerMinMinor(1690, 12), 1893, "16,90 kr + 12 % = 18,93 kr");
  assert.equal(riderPerMinMinor(500, 10), 550, "the owner's 5 kr -> 5,50 kr");
  assert.equal(riderPerMinMinor(50, 10), 55, "the owner's 0,50 € -> 0,55 €");
  assert.equal(riderPerMinMinor(250, 10), 275, "0.250 DT -> 0.275 DT");
  assert.equal(riderPerMinMinor(1225, 10), 1348, "13.475 -> 13.48: a tie goes up");
  assert.equal(riderPerMinMinor(1000, 0), 1000, "no app fee: the same price");
  assert.equal(riderPerMinMinor(1000, 12.5), 1125, "a decimal app fee");
  assert.equal(riderPerMin(12.26, 10, "SE"), 13.49);
  assert.equal(riderPerMin(0.5, 10, "FR"), 0.55);
  assert.equal(riderPerMin(0.25, 10, "TN"), 0.275);
});
