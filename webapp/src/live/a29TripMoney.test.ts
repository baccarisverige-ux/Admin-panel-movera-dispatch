import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sv } from "../i18n/sv.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { tripFacts, tripRecord } from "./liveAdminApi.ts";
import { remember, setLiveData } from "./realData.ts";
import { driverBalanceLine, routeChangeDriverGets } from "./moneyRows.ts";
import { cashFigures } from "../trips/cash.ts";
import { moneySplit } from "../trips/file.ts";
import { paySplit } from "../payments/desk.ts";
import type { Trip } from "./types.ts";

/**
 * BQ-A29 (P89S admin part; contract v0.18.89 §90 priceDisplay.owedToMovera / tripCashToCollect / routeChange, text fix
 * v0.18.90; owner rule: the apps never work money out, amounts only, whole amounts keep their decimals) and the MC
 * Payments desk follow-up (Rules audits/impact/movera-commission-labels.md, M24 section, items 1-3; contract 0.18.92
 * moneyBase.commissionRow.admin; price-audit gap 6). The admin trip page reads TripFinish.owedToMovera ("Driver owes
 * Movera X" / "Movera owes the driver X" / "Settled"), TripFinish.cashToCollect / TripProjection.cashToCollect and
 * TripRouteChange.driverTotal as the server sends them; absent → hidden (or "Not connected yet"), never worked out.
 */
const money = (amountMinor: number, currency: string) => ({ amountMinor, currency });
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

function trip(extra: Partial<Trip> & Record<string, unknown>, currency = "SEK"): Trip {
  return {
    tripId: "trp_a29", riderId: "rdr_a29", driverId: "drv_a29", zoneId: currency === "TND" ? "TN-TC" : "Z001", status: "completed", kind: "live", categoryId: "economy", paymentMethod: "cash", paymentStatus: "captured",
    pickup: { lat: 59.3, lng: 18.0 }, dropoff: { lat: 59.4, lng: 18.1 }, stops: [], fare: money(30000, currency), createdAt: "2026-11-14T10:00:00Z", updatedAt: "2026-11-14T10:30:00Z", version: 3,
    driverEarnings: money(24000, currency), commission: money(6000, currency),
    ...extra,
  } as unknown as Trip;
}

test("SEK cash trip: the trip facts carry finish.owedToMovera and finish.cashToCollect as sent; the balance line says who owes whom", () => {
  setLanguage("en");
  // 300,00 kr cash trip, driver total 235,00 kr → he holds 300,00 kr → owes Movera 65,00 kr (the server's number).
  const facts = tripFacts(trip({ cashToCollect: money(30000, "SEK"), finish: { endedEarly: false, total: money(30000, "SEK"), cashToCollect: money(30000, "SEK"), driverTotal: money(23500, "SEK"), owedToMovera: money(6500, "SEK") } }));
  assert.equal(facts.owedToMovera, 6500);
  assert.equal(facts.finishCashToCollect, 30000);
  const line = driverBalanceLine(money(6500, "SEK"))!;
  assert.equal(line.kind, "driver_owes");
  assert.equal(plain(line.text), "Driver owes Movera 65,00 kr", "whole amount keeps its decimals");
  // Movera owes him (below 0): the amount without its sign, never worked out.
  assert.equal(plain(driverBalanceLine(money(-1250, "SEK"))!.text), "Movera owes the driver 12,50 kr");
  assert.equal(driverBalanceLine(money(0, "SEK"))!.text, "Settled");
  // An older server (no owedToMovera): no line at all.
  assert.equal(driverBalanceLine(null), null);
  assert.equal(driverBalanceLine({ amountMinor: Number.NaN, currency: "SEK" }), null);
  assert.equal(tripFacts(trip({})).owedToMovera, null);
  assert.equal(tripFacts(trip({})).finishCashToCollect, null);
});

test("TND: the balance keeps 3 decimals (2.500 DT); the cash box reads the server's cash and balance, never fare or commission", () => {
  setLanguage("en");
  const owes = plain(driverBalanceLine(money(-2500, "TND"))!.text);
  assert.equal(owes, "Movera owes the driver 2.500 DT");
  assert.equal(plain(driverBalanceLine(money(4000, "TND"))!.text), "Driver owes Movera 4.000 DT");
  setLiveData(true);
  try {
    const sent = tripRecord(trip({ cashToCollect: money(30000, "TND"), finish: { endedEarly: false, total: money(30000, "TND"), cashToCollect: money(28000, "TND"), driverTotal: money(26000, "TND"), owedToMovera: money(2000, "TND") } }, "TND"));
    remember([sent]);
    // finish.cashToCollect first (the end's number), the owed amount = owedToMovera (not the stored commission 6.000 DT).
    assert.deepEqual(cashFigures(moneySplit(sent, null, [])), { collected: 28000, owed: 2000, driverKeeps: NaN });
    // An older server: no finish block, no cashToCollect → "Not connected yet" (NaN), not the fare nor the commission.
    const old = tripRecord(trip({ tripId: "trp_old" }, "TND"));
    const figures = cashFigures(moneySplit(old, null, []))!;
    assert.ok(Number.isNaN(figures.collected) && Number.isNaN(figures.owed), `nothing worked out: ${JSON.stringify(figures)}`);
  } finally {
    setLiveData(false);
  }
});

test("route change: 'Driver gets' is TripRouteChange.driverTotal as sent (SEK, TND); absent → hidden, never driverEarnings", () => {
  const change = { changeId: "rc1", status: "accepted" as const, dropoff: { lat: 59.5, lng: 18.2 }, stops: [], total: money(36000, "SEK"), difference: money(6000, "SEK"), askedAt: "2026-11-14T10:10:00Z", answerBy: "2026-11-14T10:12:00Z", driverEarnings: money(28800, "SEK"), earningsDifference: money(4800, "SEK") };
  const facts = tripFacts(trip({ routeChange: { ...change, driverTotal: money(30300, "SEK") } }));
  assert.equal(facts.routeChange?.driverTotalMinor, 30300);
  assert.equal(routeChangeDriverGets(facts.routeChange!), 30300);
  const old = tripFacts(trip({ routeChange: change }));
  assert.equal(old.routeChange?.driverTotalMinor, null);
  assert.equal(routeChangeDriverGets(old.routeChange!), null, "no driverTotal → no line (driverEarnings 288,00 kr is not what he gets)");
  const tnd = tripFacts(trip({ routeChange: { ...change, total: money(36000, "TND"), difference: money(6000, "TND"), driverTotal: money(31500, "TND") } }, "TND"));
  assert.equal(routeChangeDriverGets(tnd.routeChange!), 31500);
  const tools = readFileSync(new URL("./LiveTripTools.tsx", import.meta.url), "utf8");
  assert.ok(tools.includes("routeChangeDriverGets(change)"), "the route-change card reads driverTotal");
  assert.ok(!/Driver gets"\)\}: <b>\{liveMoney\(\{ amountMinor: change\.driverEarningsMinor/.test(tools), "never driverEarnings as 'Driver gets'");
});

test("trip page: the money section shows the balance line (split-driver-balance) from facts.owedToMovera; sv texts", () => {
  const parts = readFileSync(new URL("../trips/TripParts.tsx", import.meta.url), "utf8");
  assert.ok(parts.includes('"split-driver-balance"') && parts.includes("driverBalanceLine("), "the live money section has the balance line");
  const page = readFileSync(new URL("../pages/TripPage.tsx", import.meta.url), "utf8");
  assert.ok(/\{split\.live \? null : <div className="minus"><dt>\{tr\("Owed to Movera"\)\}/.test(page), "on live the cash box no longer shows the stored commission as 'Owed to Movera' (demo keeps it)");
  registerDictionary("sv", sv);
  setLanguage("sv");
  try {
    assert.equal(plain(driverBalanceLine(money(6500, "SEK"))!.text), "Föraren är skyldig Movera 65,00 kr");
    assert.equal(plain(driverBalanceLine(money(-1250, "SEK"))!.text), "Movera är skyldig föraren 12,50 kr");
    assert.equal(driverBalanceLine(money(0, "SEK"))!.text, "Kvitt");
  } finally {
    setLanguage("en");
  }
});

/** Ported from MC admin realData.test.ts (36a871ea; 1f5ad17e + 4c387659), moved to the 0.18.92 rule (moveraKeepsNow first). */
test("Payments desk (paySplit live): Movera = moveraKeepsNow, else moneySplit.movera, else not connected; Driver = moneySplit.driverTotal, else not connected (SEK)", () => {
  setLiveData(true);
  try {
    // 300 kr trip, driver 240 kr, commission 60 kr at the end; then Movera adds 25 kr for the driver: Movera keeps 35 kr.
    const split = { riderPaid: money(30000, "SEK"), driverTotal: money(26500, "SEK"), movera: money(3500, "SEK"), debtCollected: money(0, "SEK"), refunded: money(0, "SEK") };
    remember([tripRecord(trip({ tripId: "trp_mc", moneySplit: split, moveraKeepsNow: money(3500, "SEK") }))]);
    assert.equal(paySplit(30000, "SE", "trp_mc").movera, 3500, "Movera keeps 35 kr, not the stored 60 kr");
    assert.equal(paySplit(30000, "SE", "trp_mc").driver, 26500, "the driver's one number, not driverEarnings 240 kr");
    // moveraKeepsNow wins over moneySplit.movera (the lost-driver payment is off in the admin moveraKeepsNow).
    remember([tripRecord(trip({ tripId: "trp_lost", moneySplit: split, moveraKeepsNow: money(500, "SEK") }))]);
    assert.equal(paySplit(30000, "SE", "trp_lost").movera, 500);
    // A server with who-gets-what but no moveraKeepsNow: moneySplit.movera.
    remember([tripRecord(trip({ tripId: "trp_split", moneySplit: split }))]);
    assert.equal(paySplit(30000, "SE", "trp_split").movera, 3500);
    // An older server (neither): "Not connected yet", never the stored commission 6000 nor driverEarnings 24000.
    remember([tripRecord(trip({ tripId: "trp_7" }))]);
    assert.ok(Number.isNaN(paySplit(30000, "SE", "trp_7").movera), "not the stored commission");
    assert.ok(Number.isNaN(paySplit(30000, "SE", "trp_7").driver), "not driverEarnings");
  } finally {
    setLiveData(false);
  }
});

test("Payments desk (paySplit live) in TND: the server's numbers in millimes as sent", () => {
  setLiveData(true);
  try {
    const split = { riderPaid: money(30000, "TND"), driverTotal: money(25500, "TND"), movera: money(4500, "TND"), debtCollected: money(0, "TND"), refunded: money(0, "TND") };
    remember([tripRecord(trip({ tripId: "trp_tn", moneySplit: split, moveraKeepsNow: money(4500, "TND") }, "TND"))]);
    const tn = paySplit(30000, "TN", "trp_tn");
    assert.deepEqual([tn.driver, tn.movera], [25500, 4500]);
    remember([tripRecord(trip({ tripId: "trp_tn_old" }, "TND"))]);
    const old = paySplit(30000, "TN", "trp_tn_old");
    assert.ok(Number.isNaN(old.driver) && Number.isNaN(old.movera));
    const desk = readFileSync(new URL("../payments/desk.ts", import.meta.url), "utf8");
    const liveBranch = desk.slice(desk.indexOf("if (isLiveData()) {", desk.indexOf("export function paySplit")), desk.indexOf("const vatRate = VAT[country];"));
    assert.ok(liveBranch.includes("facts.moveraKeepsNow") && !/movera: commission/.test(liveBranch) && !/driverEarnings/.test(liveBranch), "the live desk's Movera / Driver are never the stored commission or driverEarnings");
  } finally {
    setLiveData(false);
  }
});
