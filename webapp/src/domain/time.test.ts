import assert from "node:assert/strict";
import test from "node:test";
import { TRIP_STATUSES } from "./contract.ts";
import { statusLabel } from "./labels.ts";
import { shortDateTime } from "./time.ts";
import { formatMoney } from "./money.ts";
import { formatMoney as formatMarketMoney } from "../markets/markets.ts";
import { formatOre } from "./contract.ts";
import { formatSek } from "../data/catalog.ts";
import { money as pricingMoney } from "../pricing/zonePricing.ts";

test("Q22: a readable local date in the zone's time zone, like 19 Oct 21:04", () => {
  assert.equal(shortDateTime("2026-10-19T19:04:00.000Z", "Europe/Stockholm"), "19 Oct 21:04");
  assert.equal(shortDateTime("2026-10-19T19:04:00.000Z", "Africa/Tunis"), "19 Oct 20:04");
  assert.equal(shortDateTime("not a date", "Europe/Stockholm"), "");
});

test("Q35: trip statuses read as the contract names, the words the rider and driver apps use", () => {
  for (const code of TRIP_STATUSES) {
    const label = statusLabel(code);
    assert.equal(label.toLowerCase().replace("drop-off", "dropoff"), code.replaceAll("_", " "), code);
  }
  assert.equal(statusLabel("in_trip"), "In trip");
  assert.equal(statusLabel("driver_to_pickup"), "Driver to pickup");
});

test("C-23: one money formatter; every helper gives the same text", () => {
  const plain = (text: string) => text.replace(/\s/g, " ");
  assert.equal(formatMarketMoney(12_675, "SE"), formatMoney({ amountMinor: 12_675, currency: "SEK" }, "sv-SE"));
  assert.equal(formatMarketMoney(12_500, "TN"), "12,500 DT");
  assert.equal(formatMarketMoney(335, "FR"), "3,35 €");
  assert.equal(plain(pricingMoney(217, "SE")), "217,00 kr");
  assert.equal(pricingMoney(12.5, "TN"), formatMarketMoney(12_500, "TN"));
  assert.equal(formatOre(123_450), "1234,50 kr");
  assert.equal(formatSek(1234.5), "1234,50 kr");
  assert.doesNotMatch(formatMarketMoney(123_456_700, "SE", { compact: true }), /[\u00a0\u202f]/);
});
