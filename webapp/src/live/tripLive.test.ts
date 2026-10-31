import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { cancelReasonsDefault } from "../dispatch/offers.ts";
import { approachOf, canWaiveFee, distanceDisplay, driverPointOf, ETA_EVERY_SECONDS, etaIsStale, etaLine, etaMinutes, feeKindOf, feeStatusOf, formatDistance, isLiveWithDriver, owedByCurrency, owedText, reasonWords, tripMoney } from "./tripLive.ts";

/**
 * Driver group 5 (contract v0.18.7): the admin shows the server's ETA and distance as the apps do, the cancel fee in
 * words (which rule, paid or owed, the driver's share) and the rider's debt per currency.
 */
const fixture = JSON.parse(readFileSync(new URL("../../../contracts/fixtures/pickup_waiting.json", import.meta.url), "utf8")) as { distanceDisplay: { meters: number; unit: "km" | "m"; value: number }[] };

test("Q4: the distance display follows the contract's fixture cases (1 decimal km, 100 m steps, 10 m steps, never under 10 m)", () => {
  assert.ok(fixture.distanceDisplay.length >= 10, "the contract ships the cases");
  for (const item of fixture.distanceDisplay) assert.deepEqual(distanceDisplay(item.meters), { unit: item.unit, value: item.value }, `${item.meters} m`);
  assert.equal(formatDistance(3449, "sv-SE"), "3,4 km");
  assert.equal(formatDistance(3449, "en-GB"), "3.4 km");
  assert.equal(formatDistance(850, "fr-FR"), "800 m");
  assert.equal(formatDistance(3, "sv-SE"), "10 m");
});

test("Q4: minutes are rounded up and never under 1; the line reads as the apps show it; every 30 s; stale after 120 s", () => {
  assert.equal(etaMinutes(60), 1);
  assert.equal(etaMinutes(61), 2);
  assert.equal(etaMinutes(239), 4);
  assert.equal(etaMinutes(1), 1);
  assert.equal(etaLine({ etaSeconds: 230, distanceMeters: 1249, target: "pickup", at: "2026-10-31T10:00:00Z", source: "osrm" }, "sv-SE"), "4 min · 1,2 km");
  assert.equal(ETA_EVERY_SECONDS, 30);
  assert.equal(contract.pickupWaiting.eta.staleAfterSeconds, 120);
  const eta = { etaSeconds: 120, distanceMeters: 500, target: "pickup" as const, at: "2026-10-31T10:00:00Z", source: "estimate" as const };
  assert.equal(etaIsStale(eta, Date.parse("2026-10-31T10:01:59Z")), false);
  assert.equal(etaIsStale(eta, Date.parse("2026-10-31T10:02:01Z")), true);
  assert.equal(etaIsStale({ ...eta, source: "stale" }, Date.parse("2026-10-31T10:00:01Z")), true, "checker round 1: the server's own stale mark");
});

test("adminLiveRow: the car's position gives the map its point and the dashed way to the pickup, to the drop-off once on board", () => {
  const facts = { driverLocation: { lat: 59.33, lng: 18.06, measuredAt: "2026-10-31T10:00:00Z" }, eta: { etaSeconds: 120, distanceMeters: 500, target: "pickup" as const, at: "2026-10-31T10:00:00Z", source: "osrm" as const }, pickup: { lat: 59.34, lng: 18.07 }, dropoff: { lat: 59.65, lng: 17.92 } };
  assert.deepEqual(approachOf(facts), [[59.33, 18.06], [59.34, 18.07]]);
  assert.deepEqual(approachOf({ ...facts, eta: { ...facts.eta, target: "dropoff" } }), [[59.33, 18.06], [59.65, 17.92]]);
  assert.deepEqual(approachOf({ ...facts, driverLocation: null }), []);
  assert.deepEqual(driverPointOf(facts, "Anna"), [{ id: "driver", label: "Anna", at: [59.33, 18.06], tone: "driver" }]);
  assert.deepEqual(driverPointOf({ driverLocation: null }, "Anna"), []);
  assert.equal(isLiveWithDriver("driver_to_pickup", "D1"), true);
  assert.equal(isLiveWithDriver("searching", null), false);
  assert.equal(isLiveWithDriver("completed", "D1"), false);
});

test("Q2 / Q6: the fee in words: which rule set it, paid or owed, and whether it can still be waived", () => {
  const noShow = { actor: "rider", reasonCode: "plans_changed", at: "2026-10-31T10:00:00Z", feeMinor: 6500, feeStatus: "owed", feeKind: "no_show", driverShareMinor: 5200, note: null };
  assert.equal(feeKindOf(noShow), "no_show");
  assert.equal(feeStatusOf(noShow), "owed");
  assert.equal(canWaiveFee(noShow), true);
  assert.equal(feeKindOf({ ...noShow, feeKind: null }), "cancel", "an older server without feeKind: the cancel fee");
  assert.equal(feeKindOf({ ...noShow, feeMinor: null }), null);
  assert.equal(feeStatusOf({ ...noShow, feeStatus: null }), null);
  assert.equal(canWaiveFee({ ...noShow, feeStatus: "waived" }), false);
  assert.equal(canWaiveFee({ ...noShow, feeMinor: 0 }), false);
  assert.equal(canWaiveFee(null), false);
  assert.equal(tripMoney(6500, "SEK"), "65,00 kr");
  assert.equal(tripMoney(650, "EUR"), "6,50 €");
  assert.equal(tripMoney(650, "XYZ"), "6.50 XYZ");
});

test("the cancel reason is shown in words: the admin's own title per language, never the raw code", () => {
  const base = cancelReasonsDefault();
  const book = { ...base, noShow: { ...base.noShow, title: { ...base.noShow.title, sv: "Kunden kom inte" } } };
  assert.equal(reasonWords("rider_no_show", book, "en"), "Rider did not arrive");
  assert.equal(reasonWords("rider_no_show", book, "sv"), "Kunden kom inte");
  assert.equal(reasonWords("rider_no_show", book, "fr"), "Rider did not arrive", "an empty language falls back to English");
  assert.equal(reasonWords("admin_safety_review_now", null, "en"), "Safety review now", "an unknown code reads as words");
  assert.equal(reasonWords("", book, "en"), "");
});

test("Q3: the rider's debt per currency: the server's list, else the one amount, never a sum across currencies", () => {
  const owed = owedByCurrency({ outstandingByCurrency: [{ amountMinor: 10000, currency: "SEK" }, { amountMinor: 1000, currency: "EUR" }], outstandingMinor: 10000, currency: "SEK" });
  assert.deepEqual(owed, [{ amountMinor: 10000, currency: "SEK" }, { amountMinor: 1000, currency: "EUR" }]);
  assert.equal(owedText(owed), "100,00 kr · 10,00 €");
  assert.deepEqual(owedByCurrency({ outstandingMinor: 4900, currency: "SEK" }), [{ amountMinor: 4900, currency: "SEK" }], "an older server: outstanding only");
  assert.deepEqual(owedByCurrency({ outstandingByCurrency: [], outstandingMinor: null, currency: "SEK" }), []);
  assert.deepEqual(owedByCurrency(null), []);
});
