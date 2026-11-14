import assert from "node:assert/strict";
import test from "node:test";
import { createSeed } from "../api/seed.ts";
import type { DemoRecord } from "../api/seed.ts";
import { earningsReport } from "../dashboard/earnings.ts";
import { liveDrivers } from "../dashboard/live.ts";
import { periodWindow } from "../dashboard/period.ts";
import { searchFeatures } from "../dispatch/featureIndex.ts";
import { formatMoney, marketZoneIds } from "../markets/markets.ts";
import * as care from "../riders/care.ts";
import { riderBookings, riderProfile, type RiderRecord } from "../riders/profile.ts";
import { emptyReservationBook, raiseFare } from "../reservations/book.ts";
import { ZONE_PAYMENT_METHODS } from "../zones/releases.ts";
import { PAYMENT_METHODS } from "./book.ts";
import { METHOD_LABELS } from "./desk.ts";
import { emptyPayoutOps, normalizePayoutOps, payoutLines, scheduleError } from "./runs.ts";

/**
 * BQ-V45 (owner driver-g8.md:4 "REMOVE Google Pay everywhere"; driver-g10.md:7 instant cash-out "Delete this option")
 * and BQ-O15 item 3 (owner s06:1275-1276: the right decimals on every money display) in the admin demo code.
 */

const NOW = Date.parse("2026-10-10T14:30:00Z");

test("V45 Google Pay: the demo payment methods are card, Apple Pay, cash and the wallet only", () => {
  assert.deepEqual([...PAYMENT_METHODS], ["card", "apple", "cash", "wallet"]);
  assert.ok(!Object.values(METHOD_LABELS).includes("Google Pay"), "no Google Pay label on the payments desk");
  assert.ok(!ZONE_PAYMENT_METHODS.includes("google"), "a zone's demo methods have no Google Pay");
});

test("V45 Google Pay: demo earnings, dashboard trips, rider cards and the feature search never name Google Pay", async () => {
  const window = periodWindow({ kind: "week" }, NOW, "Europe/Stockholm");
  for (const country of ["SE", "FR", "TN"] as const) {
    const report = earningsReport(country, marketZoneIds(country), window);
    assert.ok(!report.byMethod.some((row) => row.label === "Google Pay" || row.id === "google"), `${country} earnings by method`);
    const share = report.byMethod.reduce((sum, row) => sum + row.minor, 0);
    assert.ok(Math.abs(share - report.totals.grossMinor) <= report.byMethod.length, `${country} methods still add up to the gross`);
  }
  const { liveTrip } = await import("../dashboard/liveTrip.ts");
  const seed = createSeed();
  const records = { trips: seed.trips, reservations: seed.reservations, vehicles: seed.vehicles, fleets: seed.fleets, riders: seed.riders };
  let trips = 0;
  for (let tick = 0; tick < 6; tick += 1) {
    for (const driver of liveDrivers(seed.drivers, seed.vehicles, seed.trips, seed.incidents, tick)) {
      const trip = liveTrip(driver, records, NOW);
      if (!trip) continue;
      trips += 1;
      assert.notEqual(trip.payment, "Google Pay", `${driver.id} trip payment`);
    }
  }
  assert.ok(trips > 10, "enough demo trips were checked");
  const riders: RiderRecord[] = Array.from({ length: 200 }, (_, index) => ({ id: `R${String(index + 1).padStart(4, "0")}`, name: `Rider ${index + 1}`, phone: "", zoneId: index % 3 === 0 ? "Z001" : index % 3 === 1 ? "FR-PC" : "TN-TC", status: "active", tripId: "" }));
  for (const rider of riders) {
    const bookings = riderBookings(rider, NOW);
    assert.ok(!bookings.some((booking) => /Google Pay/.test(booking.payment)), `${rider.id} bookings`);
    assert.ok(!/Google Pay/.test(riderProfile(rider, bookings, NOW).payment.method), `${rider.id} card`);
  }
  assert.deepEqual(searchFeatures("google pay").map((entry) => entry.id), [], "the feature search does not offer Google Pay");
  assert.deepEqual(searchFeatures("apple pay").map((entry) => entry.id), ["payment-methods"], "Apple Pay still finds the payment methods");
});

const payoutRecord = (id: string, zoneId: string, fareOre: number): DemoRecord => ({ id, name: "Week 41", phone: "", zoneId, status: "scheduled", driverId: "D0001", fareOre } as DemoRecord);

test("V45 instant cash-out: no schedule setting, no fee line, no tag, old saved settings dropped", () => {
  const ops = emptyPayoutOps();
  for (const country of ["SE", "FR", "TN"] as const) assert.equal("instant" in ops.schedules[country], false, `${country} schedule`);
  const saved = normalizePayoutOps({ schedules: { SE: { ...ops.schedules.SE, instant: { on: true, feePct: 1.5, minMajor: 100 } } } });
  assert.equal("instant" in saved.schedules.SE, false, "an old saved instant cash-out is dropped");
  assert.equal(scheduleError({ ...ops.schedules.SE, instant: { on: true, feePct: 99, minMajor: -1 } } as typeof ops.schedules.SE), null, "no instant cash-out check left");
  for (let index = 0; index < 40; index += 1) {
    const record = payoutRecord(`PO-${index}`, index % 3 === 0 ? "Z001" : index % 3 === 1 ? "FR-PC" : "TN-TC", 120_000 + index * 731);
    const result = payoutLines(record);
    assert.equal("instant" in result, false, `${record.id}: no instant tag`);
    assert.ok(!result.lines.some((line) => /cash-out/i.test(line.label)), `${record.id}: no cash-out fee line`);
    const total = result.lines.filter((line) => line.kind !== "total").reduce((sum, line) => sum + line.minor, 0);
    assert.equal(total, record.fareOre, `${record.id}: the lines still add up to what the driver gets`);
  }
});

const rider = (zoneId: string): RiderRecord => ({ id: "R0042", name: "Test Rider", phone: "", zoneId, status: "active", tripId: "" });

test("O15 item 3: a typed amount is shown with the currency's decimals (SEK 2, EUR 2, TND 3)", () => {
  assert.equal(care.typedMoneyText(125, "SE"), formatMoney(12_500, "SE"));
  assert.match(care.typedMoneyText(125, "SE"), /^125,00\s*kr$/u);
  assert.equal(care.typedMoneyText(12.5, "FR"), formatMoney(1_250, "FR"));
  assert.equal(care.typedMoneyText(12.5, "TN"), formatMoney(12_500, "TN"));
  assert.match(care.typedMoneyText(12.5, "TN"), /12[.,]500/u, "dinar keeps 3 decimals");
});

test("O15 item 3: rider-care errors echo the typed amounts with decimals", () => {
  const book = care.emptyRiderCare();
  const tooMuch = care.addCredit(book, rider("Z001"), 100_000, "Late", "astrid", NOW).error ?? "";
  assert.ok(tooMuch.includes(`at most ${care.typedMoneyText(500, "SE")}.`), tooMuch);
  const monthly = care.addCredit({ ...book, limits: { ...book.limits, SE: 300 } }, rider("Z001"), 400, "Late", "astrid", NOW).error ?? "";
  assert.ok(monthly.includes(care.typedMoneyText(300, "SE")) && monthly.includes(`${care.typedMoneyText(0, "SE")} already given`), monthly);
  const booking = { ...riderBookings(rider("Z001"), NOW).find((item) => item.fareMinor > 0)! };
  const over = care.requestRefund(book, rider("Z001"), booking, booking.fareMinor, "wallet", "Twice", "astrid", NOW).error ?? "";
  assert.ok(over.includes(`The rider paid ${formatMoney(booking.fareMinor, "SE")} for this ride`), over);
});

test("O15 item 3: the demo raise cap names the amount with the currency's decimals", () => {
  const record = { id: "RES-1", name: "Test", phone: "", zoneId: "Z001", status: "searching", driverId: null } as unknown as DemoRecord;
  const error = raiseFare(emptyReservationBook(), record, 600, 500, "astrid", new Date(NOW).toISOString()).error ?? "";
  assert.equal(error, `The raise can be at most ${formatMoney(50_000, "SE")}.`);
});
