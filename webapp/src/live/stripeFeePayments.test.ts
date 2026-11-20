import { test } from "node:test";
import assert from "node:assert/strict";
import type { LiveClient } from "./session.ts";
import { feePaymentsOf, loadFeePayments, paidTwiceOf, refundFeePayment, refundableOf, STRIPE_STATUS_LABEL } from "./stripeFeePayments.ts";
import { countryRulesOf } from "./configDocs.ts";
import { completeCountrySettings, defaultCountrySettings, debtSettingsOfRules, STANDARD_ONLY_FIELDS, PRICING_FIELDS } from "../config/countrySettings.ts";

/**
 * Contract v0.18.136 stripeFees (DRAFT, Stripe TEST mode; owner 2026-11-20 "So we use stripe"), admin area c50: the
 * per-country switch (Tips & limits, country Standard, default OFF), each fee's Stripe status, the Refund button and
 * the "Paid twice" list. Amounts are the server's; the admin computes nothing.
 */
const rows = [
  { tripId: "trp_1", paymentIntentId: "pi_2", amount: { amountMinor: 6500, currency: "SEK" }, status: "succeeded", createdAt: "2026-11-20T10:01:00Z", paidTwice: true, overpaid: { amountMinor: 6500, currency: "SEK" } },
  { tripId: "trp_1", paymentIntentId: "pi_1", amount: { amountMinor: 6500, currency: "SEK" }, status: "succeeded", createdAt: "2026-11-20T10:00:00Z" },
  { tripId: "trp_2", paymentIntentId: "pi_3", amount: { amountMinor: 3000, currency: "SEK" }, status: "refunded", createdAt: "2026-11-20T09:00:00Z", refundedAt: "2026-11-20T09:30:00Z" },
  { tripId: "trp_3", paymentIntentId: "pi_4", amount: { amountMinor: 3000, currency: "SEK" }, status: "requires_payment", createdAt: "2026-11-20T09:00:00Z", amountMismatch: true, clientSecret: "never_shown" },
  { junk: true },
];

test("c50: the server's list is read as is; junk rows are dropped; the client secret is never kept", () => {
  const list = feePaymentsOf({ items: rows });
  assert.equal(list.length, 4);
  assert.equal(JSON.stringify(list).includes("never_shown"), false);
  assert.equal(list[3]!.amountMismatch, true);
  assert.deepEqual(Object.keys(STRIPE_STATUS_LABEL).sort(), ["canceled", "failed", "processing", "refund_pending", "refunded", "requires_payment", "succeeded"]);
});

test("c50: Paid twice list and Refund only on a succeeded payment, one per fee (the server refunds the paid-twice one first)", () => {
  const list = feePaymentsOf({ items: rows });
  assert.deepEqual(paidTwiceOf(list).map((p) => p.paymentIntentId), ["pi_2"]);
  assert.deepEqual(refundableOf(list).map((p) => p.tripId), ["trp_1"]);
});

test("c50: GET fee-payments and POST stripe-refund with the reason; no reason, no call", async () => {
  const calls: Array<{ path: string; body?: unknown }> = [];
  const client = {
    json: async (path: string) => { calls.push({ path }); return { items: rows }; },
    post: async (path: string, body: unknown) => { calls.push({ path, body }); return { status: "refund_pending" }; },
  } as unknown as LiveClient;
  assert.equal((await loadFeePayments(client, "rdr_1")).length, 4);
  await assert.rejects(refundFeePayment(client, "rdr_1", "trp_1", "  "));
  await refundFeePayment(client, "rdr_1", "trp_1", " Paid twice ");
  assert.deepEqual(calls, [{ path: "/admin/riders/rdr_1/fee-payments" }, { path: "/admin/riders/rdr_1/fees/trp_1/stripe-refund", body: { reason: "Paid twice" } }]);
});

test("c50: CountryRules.riderFeeStripe is off by default, read from the Standard, sent only on the Standard, kept otherwise", () => {
  assert.equal(defaultCountrySettings("SE").riderFeeStripe, false);
  assert.equal(completeCountrySettings("SE", {}).riderFeeStripe, false);
  assert.equal(completeCountrySettings("SE", { riderFeeStripe: true }).riderFeeStripe, true);
  assert.deepEqual(debtSettingsOfRules({ riderFeeStripe: { enabled: true } }, "SE"), { riderFeeStripe: true });
  assert.ok((STANDARD_ONLY_FIELDS as readonly string[]).includes("riderFeeStripe") && (PRICING_FIELDS as readonly string[]).includes("riderFeeStripe"));
  const input = { tips: [], raiseSteps: [], driverBonus: { defaultLimit: 0, hardMax: 0 } };
  assert.deepEqual(countryRulesOf("SE", "SEK", { ...input, riderFeeStripe: true }, null)["riderFeeStripe"], { enabled: true });
  assert.deepEqual(countryRulesOf("SE", "SEK", input, { riderFeeStripe: { enabled: true } })["riderFeeStripe"], { enabled: true });
  assert.equal(countryRulesOf("SE", "SEK", input, { riderFeeStripe: { enabled: true } }, { standard: false })["riderFeeStripe"], undefined);
});
