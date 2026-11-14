import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { tripFacts } from "./liveAdminApi.ts";
import { commissionBeforeBonus } from "./tripLive.ts";
import { lostDriverRow, moveraCommissionRow, payoutSummaryLines, runSummaryRows } from "./moneyRows.ts";
import type { Trip } from "./types.ts";

/**
 * BQ-M24 / BQ-M22 admin part (contract v0.18.92 moneyBase.commissionRow.admin, moneyBase.lostDriverPaid,
 * priceDisplay.payoutSummary; owner 2026-11-13 23:42 UTC "Movera commission is how much movera keep", owner 2026-11-14
 * "U show how much driver get and how much movera get thats all no details"): every "Movera commission" row is ONE
 * server number (the admin TripProjection.moveraKeepsNow, never commission, never a subtraction); "Paid to the driver
 * who lost the trip" from TripProjection.lostDriverPaid when above 0; payout cards show the 2 lines of Payout.summary.
 * The fields are read as optional: the admin's contract copy is older than 0.18.92 (not merged yet).
 */
const money = (amountMinor: number, currency: string) => ({ amountMinor, currency });
const NBSP = /[\u00a0\u202f]/g;
const plain = (text: string) => text.replace(NBSP, " ");

function trip(extra: Partial<Trip> & Record<string, unknown>, currency = "SEK"): Trip {
  return {
    tripId: "t-1", riderId: "r-1", zoneId: "z", status: "completed", kind: "live", categoryId: "economy", paymentMethod: "card",
    pickup: { lat: 59.3, lng: 18.0 }, dropoff: { lat: 59.4, lng: 18.1 }, stops: [], fare: money(20000, currency), createdAt: "2026-11-14T10:00:00Z", updatedAt: "2026-11-14T10:30:00Z", version: 3,
    ...extra,
  } as unknown as Trip;
}

test("SEK paid reassigned trip: the Movera commission row is the server's moveraKeepsNow (20,00 kr), never commission 50,00 kr nor 50 − 30", () => {
  // contract moneyBase.lostDriverPaid.example: fare 200,00 kr, lost driver paid 30,00 kr, driver B 150,00 kr.
  const facts = tripFacts(trip({
    commission: money(5000, "SEK"), moveraKeepsNow: money(2000, "SEK"), lostDriverPaid: money(3000, "SEK"),
    moneySplit: { riderPaid: money(20000, "SEK"), driverTotal: money(15000, "SEK"), movera: money(2000, "SEK"), debtCollected: money(0, "SEK"), refunded: money(0, "SEK") },
  }));
  assert.equal(facts.moveraKeepsNow, 2000);
  assert.equal(facts.lostDriverPaid, 3000);
  assert.deepEqual(moveraCommissionRow({ moveraKeepsNow: money(2000, "SEK"), commission: money(5000, "SEK") }), money(2000, "SEK"));
  assert.deepEqual(lostDriverRow({ lostDriverPaid: money(3000, "SEK") }), money(3000, "SEK"));
});

test("EUR cancelled trip (no moneySplit): the row shows the server's fee share, the lost-driver line shows; no fallback to commission", () => {
  // An admin cancel with 10,00 € paid to the lost driver: moveraKeepsNow = 0 − 10,00 = −10,00 € (the server's number).
  const facts = tripFacts(trip({ status: "cancelled_by_admin", commission: money(0, "EUR"), moveraKeepsNow: money(-1000, "EUR"), lostDriverPaid: money(1000, "EUR") }, "EUR"));
  assert.equal(facts.split, null, "no money split on an unpaid end");
  assert.equal(facts.moveraKeepsNow, -1000);
  assert.deepEqual(moveraCommissionRow({ moveraKeepsNow: money(-1000, "EUR"), commission: money(0, "EUR") }), money(-1000, "EUR"));
  // An older server (no moveraKeepsNow): "Not connected yet" (null), never the commission.
  assert.equal(moveraCommissionRow({ commission: money(500, "EUR") }), null);
  assert.equal(tripFacts(trip({ commission: money(500, "EUR") }, "EUR")).moveraKeepsNow, null);
  assert.equal(moveraCommissionRow({ moveraKeepsNow: { amountMinor: Number.NaN, currency: "EUR" } }), null);
});

test("TND: the lost-driver line only when above 0 (2.000 DT shows; 0 and absent do not)", () => {
  assert.deepEqual(lostDriverRow({ lostDriverPaid: money(2000, "TND") }), money(2000, "TND"));
  assert.equal(lostDriverRow({ lostDriverPaid: money(0, "TND") }), null);
  assert.equal(lostDriverRow({}), null);
  assert.equal(tripFacts(trip({}, "TND")).lostDriverPaid, null);
  // Under way: moveraKeepsNow = commission − lostDriverPaid, worked out by the server (4.000 DT), shown as it comes.
  assert.deepEqual(moveraCommissionRow({ moveraKeepsNow: money(4000, "TND"), commission: money(6000, "TND") }), money(4000, "TND"));
});

test("payout card: exactly 2 lines Driver gets / Movera gets from Payout.summary (SEK, EUR, TND); absent → null (amount only)", () => {
  setLanguage("en");
  const lines = payoutSummaryLines({ summary: { driverGets: money(100000, "SEK"), moveraGets: money(15000, "SEK") } });
  assert.ok(lines);
  assert.deepEqual(lines!.map((line) => [line.key, line.label, plain(line.text)]), [["driverGets", "Driver gets", "1 000,00 kr"], ["moveraGets", "Movera gets", "150,00 kr"]]);
  const eur = payoutSummaryLines({ summary: { driverGets: money(4550, "EUR"), moveraGets: money(1200, "EUR") } })!;
  assert.deepEqual(eur.map((line) => plain(line.text)), ["45,50 €", "12,00 €"]);
  const tnd = payoutSummaryLines({ summary: { driverGets: money(16000, "TND"), moveraGets: money(6000, "TND") } })!;
  assert.ok(tnd.every((line) => /\d+[.,]\d{3}/.test(plain(line.text))), `TND keeps 3 decimals: ${tnd.map((line) => line.text).join(" / ")}`);
  assert.ok(lines!.every((line) => !line.text.includes("%")), "amounts only, never a %");
  assert.equal(payoutSummaryLines({}), null);
  assert.equal(payoutSummaryLines({ summary: { driverGets: money(100, "SEK") } as never }), null);
});

test("run card: each payout's own 2 lines, nothing added up in the app; one payout without summary → null (today's totals)", () => {
  const rows = [
    { payoutId: "p1", driverId: "d1", driverName: "Maja", summary: { driverGets: money(100000, "SEK"), moveraGets: money(15000, "SEK") } },
    { payoutId: "p2", driverId: "d2", summary: { driverGets: money(50000, "SEK"), moveraGets: money(8000, "SEK") } },
  ];
  const run = runSummaryRows(rows)!;
  assert.deepEqual(run.map((row) => [row.payoutId, row.who, row.lines.map((line) => plain(line.text))]), [["p1", "Maja", ["1 000,00 kr", "150,00 kr"]], ["p2", "d2", ["500,00 kr", "80,00 kr"]]]);
  assert.equal(runSummaryRows([...rows, { payoutId: "p3", driverId: "d3" }]), null);
});

test("Add money box: the commission before the bonus starts from the server's moveraKeepsNow when sent (lost-driver payment off)", () => {
  // Under way: commission 50,00 kr after a 20,00 kr bonus, lost driver paid 30,00 kr → moveraKeepsNow 20,00 kr.
  assert.equal(commissionBeforeBonus({ commission: money(5000, "SEK"), driverBonus: money(2000, "SEK"), moveraKeepsNow: money(2000, "SEK") }), 4000);
  // An older server: today's commission + bonus.
  assert.equal(commissionBeforeBonus({ commission: money(5000, "SEK"), driverBonus: money(2000, "SEK") }), 7000);
});

test("trip page: no 'no money split' note, the row reads moveraKeepsNow; the lost-driver line is in sv / fr / en as the contract", () => {
  const money = readFileSync(new URL("./LiveTripMoney.tsx", import.meta.url), "utf8");
  assert.ok(!money.includes("The server sends no money split for this trip yet."), "the note is gone");
  assert.ok(!/Movera commission"\)\}: <b>\{liveMoney\(split\.movera\)/.test(money), "the row no longer reads moneySplit.movera");
  assert.ok(money.includes("moveraCommissionRow(") && money.includes("lostDriverRow("));
  const parts = readFileSync(new URL("../trips/TripParts.tsx", import.meta.url), "utf8");
  assert.ok(!parts.includes('line(tr("Movera commission"), facts.commission'), "the split view no longer shows the stored commission as the row");
  const contract = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8")) as { finish?: { debt?: { texts?: Record<string, Record<string, string>> } } };
  const want = contract.finish?.debt?.texts?.lostDriverLine ?? { sv: "Betalt till föraren som förlorade resan", fr: "Payé au chauffeur qui a perdu la course", en: "Paid to the driver who lost the trip" };
  assert.equal((sv as Record<string, string>)["Paid to the driver who lost the trip"], want.sv);
  assert.equal((fr as Record<string, string>)["Paid to the driver who lost the trip"], want.fr);
  registerDictionary("sv", sv);
  setLanguage("sv");
  try {
    const lines = payoutSummaryLines({ summary: { driverGets: money0(100000), moveraGets: money0(15000) } })!;
    assert.deepEqual(lines.map((line) => line.label), ["Föraren får", "Movera får"]);
  } finally {
    setLanguage("en");
  }
});

function money0(amountMinor: number) {
  return { amountMinor, currency: "SEK" };
}
