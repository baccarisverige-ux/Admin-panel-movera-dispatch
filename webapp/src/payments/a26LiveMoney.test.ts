import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sv } from "../i18n/sv.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import type { DemoRecord, LiveTripFacts } from "../api/seed.ts";
import { formatMoney } from "../markets/markets.ts";
import { emptyPayoutOps, payoutLines } from "./runs.ts";
import { liveReservationMoney } from "../reservations/raiseMoney.ts";

/**
 * BQ-A26 + FU-A29-2 (owner rule R2: the admin never works money out; amounts only, whole amounts keep their decimals;
 * a missing server number reads "Not connected yet"):
 * - the reservation page's "Raise the driver's fare" box on live shows the server's fare and the server's
 *   moveraKeepsNow (contract v0.18.92 moneyBase.commissionRow.admin) — never fare × the price book's %, and no
 *   "beyond / left" sums;
 * - a live payout's "line by line" view shows the server's Payout.summary (2 lines: Driver gets / Movera gets), else
 *   the server's own Payout.lines — never the hash-made demo lines ("Movera commission 20%").
 * The demo keeps its own numbers.
 */

const facts = (over: Partial<LiveTripFacts>): LiveTripFacts => ({ kind: "scheduled", categoryId: "economy", paymentMethod: "card", paymentStatus: null, currency: "SEK", fare: 0, fareLines: [], commission: null, driverEarnings: null, pickupPay: null, driverBonus: null, walletApplied: null, cashToCollect: null, ...over } as LiveTripFacts);
const booked = (zoneId: string, over: Partial<LiveTripFacts>): DemoRecord => ({ id: "trip_1", name: "Rider", phone: "", zoneId, status: "searching", live: true, liveTrip: facts(over) } as DemoRecord);

test("A26 SEK: a live booked ride shows the server's fare and moveraKeepsNow, decimals kept", () => {
  const shown = liveReservationMoney(booked("Z001", { fare: 30_000, commission: 9_999, moveraKeepsNow: 6_000 }), true);
  assert.ok(shown, "live gives the server's numbers");
  assert.equal(formatMoney(shown.fareMinor, "SE"), "300,00 kr");
  // The row is moveraKeepsNow, not commission (9 999) and not fare × %.
  assert.equal(formatMoney(shown.moveraKeepsMinor, "SE"), "60,00 kr");
  assert.equal(shown.showSums, false, "no beyond / left sums worked out on live");
});

test("A26 TND: the dinar keeps its 3 decimals", () => {
  const shown = liveReservationMoney(booked("Z201", { currency: "TND", fare: 25_000, moveraKeepsNow: 2_500 }), true);
  assert.ok(shown);
  assert.equal(formatMoney(shown.fareMinor, "TN"), "25.000 DT");
  assert.equal(formatMoney(shown.moveraKeepsMinor, "TN"), "2.500 DT");
});

test("A26: no moveraKeepsNow (or no server facts) reads Not connected yet, never a % of the fare", () => {
  const noKeep = liveReservationMoney(booked("Z001", { fare: 30_000, commission: 6_000 }), true);
  assert.ok(noKeep);
  assert.equal(formatMoney(noKeep.moveraKeepsMinor, "SE"), "Not connected yet");
  const bare = liveReservationMoney({ id: "trip_2", name: "", phone: "", zoneId: "Z001", status: "searching", live: true } as DemoRecord, true);
  assert.ok(bare);
  assert.equal(formatMoney(bare.fareMinor, "SE"), "Not connected yet");
  assert.equal(formatMoney(bare.moveraKeepsMinor, "SE"), "Not connected yet");
});

test("A26: the demo keeps its own sums (null = page uses the demo numbers)", () => {
  assert.equal(liveReservationMoney({ id: "R1", name: "", phone: "", zoneId: "Z001", status: "waiting", fareOre: 30_000 } as DemoRecord, false), null);
});

test("A26: the page on live has no fare × % and no beyond / left sums", () => {
  const page = readFileSync(new URL("../pages/ReservationDetailPage.tsx", import.meta.url), "utf8");
  assert.match(page, /liveReservationMoney\(/, "the page reads the server's numbers on live");
  assert.match(page, /liveMoney\.showSums|showSums/, "the beyond / left lines are demo only");
});

const sched = emptyPayoutOps().schedules.SE;
const payout = (zoneId: string, currency: string, over: Partial<NonNullable<DemoRecord["livePayout"]>>, amountMinor: number): DemoRecord => ({ id: "po_1", name: "2026-11-02 – 2026-11-08", phone: "", zoneId, status: "scheduled", driverId: "drv_1", fareOre: amountMinor, live: true, livePayout: { lines: [], source: "weekly", periodStart: "2026-11-02", periodEnd: "2026-11-08", tripCount: 3, currency, summary: null, ...over } } as DemoRecord);

test("FU-A29-2 SEK: a live payout shows the 2 lines of Payout.summary only", () => {
  const { lines, instant, cashMinor } = payoutLines(payout("Z001", "SEK", { summary: { driverGetsMinor: 43_700, moveraGetsMinor: 8_300 }, lines: [{ code: "trips", amountMinor: 52_000, count: 3 }] }, 43_700), sched, { minor: 9_000, trips: 3 });
  assert.deepEqual(lines.map((line) => line.label), ["Driver gets", "Movera gets"]);
  assert.equal(formatMoney(lines[0].minor, "SE"), "437,00 kr");
  assert.equal(formatMoney(lines[1].minor, "SE"), "83,00 kr");
  assert.equal(instant, false, "no demo instant cash-out tag on live");
  assert.equal(cashMinor, 0, "no app-made cash line on live");
  assert.ok(!lines.some((line) => /%/.test(line.label)), "no % on live");
});

test("FU-A29-2 TND: summary in dinar keeps 3 decimals", () => {
  const { lines } = payoutLines(payout("Z201", "TND", { summary: { driverGetsMinor: 4_000, moveraGetsMinor: 2_500 } }, 4_000), sched);
  assert.deepEqual(lines.map((line) => formatMoney(line.minor, "TN")), ["4.000 DT", "2.500 DT"]);
});

test("FU-A29-2: an older server (no summary) shows the server's own lines and Payout.amount, nothing made up", () => {
  const { lines } = payoutLines(payout("Z001", "SEK", { lines: [{ code: "trips", amountMinor: 52_000, count: 3 }, { code: "cash_collected", amountMinor: -8_300 }] }, 43_700), sched);
  assert.deepEqual(lines.map((line) => [line.code ?? line.label, line.minor]), [["trips", 52_000], ["cash_collected", -8_300], ["Driver gets", 43_700]]);
  assert.ok(!lines.some((line) => /%|commission/i.test(line.label)), "no demo commission % line");
});

test("FU-A29-2: a live payout without summary or lines has no lines (the card reads Not connected yet)", () => {
  assert.deepEqual(payoutLines(payout("Z001", "SEK", {}, 43_700), sched).lines, []);
  const parts = readFileSync(new URL("./PayoutParts.tsx", import.meta.url), "utf8");
  assert.match(parts, /Not connected yet/, "the line-by-line card says Not connected yet when the server sent nothing");
});

test("Swedish texts", () => {
  registerDictionary("sv", sv);
  setLanguage("sv");
  try {
    assert.equal(formatMoney(Number.NaN, "SE"), sv["Not connected yet"]);
    assert.ok(sv["If the raise is more than Movera's commission, Movera pays the difference."], "sv rule text");
    assert.ok(sv["Driver gets"] && sv["Movera gets"], "sv payout lines");
  } finally {
    setLanguage("en");
  }
});
