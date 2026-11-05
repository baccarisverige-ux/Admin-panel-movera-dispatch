import assert from "node:assert/strict";
import test from "node:test";
import { REQUEST_LIMIT_DEFAULTS, requestLimitIssue, requestLimitsOf, withRequestLimits } from "./requestLimits.ts";
import { countryRulesOf } from "../live/configDocs.ts";
import { retryDelay } from "../api/commandFlow.ts";
import { ApiError } from "../api/httpClient.ts";

test("request limits: contract defaults 120 / 60, ranges checked", () => {
  assert.deepEqual(REQUEST_LIMIT_DEFAULTS, { writesPerUserPerMinute: 120, writesPerAddressPerMinute: 60 });
  assert.deepEqual(requestLimitsOf({ limits: { writesPerUserPerMinute: 300, writesPerAddressPerMinute: 5 } }), { writesPerUserPerMinute: 300, writesPerAddressPerMinute: 60 });
  assert.equal(requestLimitIssue("writesPerUserPerMinute", 29), "Between 30 and 10000.");
  assert.equal(requestLimitIssue("writesPerAddressPerMinute", 10001), "Between 20 and 10000.");
  assert.equal(requestLimitIssue("writesPerAddressPerMinute", 1.5), "Enter a whole number.");
  assert.equal(requestLimitIssue("writesPerUserPerMinute", 120), null);
});

test("request limits: saving keeps the other limits and fields of the Standard", () => {
  const doc = { country: "SE", tips: [], limits: { wrongCodesPerDay: 20 } };
  assert.deepEqual(withRequestLimits(doc, { writesPerUserPerMinute: 200, writesPerAddressPerMinute: 80 }), { country: "SE", tips: [], limits: { wrongCodesPerDay: 20, writesPerUserPerMinute: 200, writesPerAddressPerMinute: 80 } });
});

test("Tips & limits save keeps CountryRules.limits (fail-before: dropped the admin's limits)", () => {
  const base = { version: 3, publishedAt: "2026-11-04T00:00:00Z", limits: { writesPerUserPerMinute: 200 } };
  const doc = countryRulesOf("SE", "SEK", { tips: [10], raiseSteps: [5], driverBonus: { defaultLimit: 50, hardMax: 1000 } }, base);
  assert.deepEqual(doc["limits"], { writesPerUserPerMinute: 200 });
});

test("429: the admin waits Retry-After before retrying (at most 60 s)", () => {
  assert.equal(retryDelay(0, new ApiError(429, "Slow down", { code: "rate_limited", retryAfterSeconds: 7 })), 7000);
  assert.equal(retryDelay(0, new ApiError(429, "Slow down", { code: "rate_limited", retryAfterSeconds: 600 })), 60_000);
  assert.equal(retryDelay(0, new ApiError(503, "Down", { code: "unavailable" })), 1000);
  assert.equal(retryDelay(2, new Error("x")), 4000);
});
