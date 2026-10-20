import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_REFUND_ABOVE, defaultRefundPolicy, needsSecondAdmin, needsSecondAdminIn, normalizeRefundPolicy, parseRefundAbove, refundAboveMinor } from "./refundPolicy.ts";

test("Q25: one default per country, above 500 kr / 50 € / 150 DT", () => {
  assert.deepEqual(DEFAULT_REFUND_ABOVE, { SE: 500, FR: 50, TN: 150 });
  const policy = defaultRefundPolicy();
  assert.equal(refundAboveMinor(policy, "SE"), 50_000);
  assert.equal(refundAboveMinor(policy, "FR"), 5_000);
  assert.equal(refundAboveMinor(policy, "TN"), 150_000, "dinar has 1000 millimes");
  assert.equal(needsSecondAdmin(policy, "SE", 50_000), false, "exactly 500 kr is not above");
  assert.equal(needsSecondAdmin(policy, "SE", 50_001), true);
  assert.equal(needsSecondAdminIn(policy, "TND", 149_999), false);
  assert.equal(needsSecondAdminIn(policy, "EUR", 5_001), true);
  assert.equal(needsSecondAdmin(policy, "SE", -60_000), true, "a negative pay change counts by its size");
});

test("C-26: stored data is checked; a save is checked as sent", () => {
  assert.deepEqual(normalizeRefundPolicy({ aboveMajor: { SE: "lots", FR: -3, TN: 90 } }).aboveMajor, { SE: 500, FR: 50, TN: 90 });
  assert.deepEqual(normalizeRefundPolicy("broken"), defaultRefundPolicy());
  assert.ok("error" in parseRefundAbove({ aboveMajor: { SE: -1, FR: 50, TN: 150 } }));
  assert.ok("error" in parseRefundAbove({ aboveMajor: { SE: 500, FR: 50 } }), "every country is needed");
  assert.ok("error" in parseRefundAbove({ aboveMajor: { SE: 5_000_000, FR: 50, TN: 150 } }), "a typo of many zeros is refused");
  assert.deepEqual(parseRefundAbove({ aboveMajor: { SE: 0, FR: 50, TN: 150 } }), { aboveMajor: { SE: 0, FR: 50, TN: 150 } });
});
