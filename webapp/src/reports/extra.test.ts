import assert from "node:assert/strict";
import test from "node:test";
import { companyTotals, compareZones, emptyTaxRules, fleetRows, normalizeTaxRules, promoReturn, supportSafety, surgeCards, surgeFromRatio, surgeZone, taxLine, taxRulesError, toSekMinor, vatInside } from "./extra.ts";

test("taxes: a Swedish company in three countries", () => {
  const rules = emptyTaxRules();
  assert.equal(vatInside(10_600, 6), 600);
  const se = taxLine("SE", { grossMinor: 1_060_000, commissionMinor: 200_000, driverMinor: 800_000 }, rules);
  assert.equal(se.rideVatMinor, 60_000);
  assert.equal(se.rideVatBy, "Drivers");
  assert.equal(se.commissionVatMinor, 50_000);
  assert.equal(se.reverseChargeMinor, 0);
  assert.equal(se.moveraOwesMinor, 50_000);
  const fr = taxLine("FR", { grossMinor: 110_000, commissionMinor: 20_000, driverMinor: 80_000 }, rules);
  assert.equal(fr.rideVatMinor, 10_000);
  assert.equal(fr.commissionVatMinor, 0, "reverse charge abroad: no Swedish VAT added");
  assert.equal(fr.reverseChargeMinor, 20_000);
  const tn = taxLine("TN", { grossMinor: 107_000, commissionMinor: 20_000, driverMinor: 80_000 }, rules);
  assert.equal(tn.withholdingMinor, 0, "off by default");
  const withholding = { ...rules, countries: { ...rules.countries, TN: { ...rules.countries.TN, withholding: { on: true, pct: 3 } } } };
  assert.equal(taxLine("TN", { grossMinor: 107_000, commissionMinor: 20_000, driverMinor: 80_000 }, withholding).withholdingMinor, 2_400);
  const sells = { ...rules, countries: { ...rules.countries, SE: { ...rules.countries.SE, moveraSellsRide: true } } };
  assert.equal(taxLine("SE", { grossMinor: 1_060_000, commissionMinor: 200_000, driverMinor: 800_000 }, sells).moveraOwesMinor, 110_000);
  const noReverse = { ...rules, countries: { ...rules.countries, FR: { ...rules.countries.FR, reverseCharge: false } } };
  assert.equal(taxLine("FR", { grossMinor: 110_000, commissionMinor: 20_000, driverMinor: 80_000 }, noReverse).commissionVatMinor, 5_000);
  assert.equal(toSekMinor(1_000, "FR", 100, rules), 11_500);
  assert.equal(toSekMinor(3_000, "TN", 1000, rules), 1_050);
  assert.equal(toSekMinor(500, "SE", 100, rules), 500);
  const company = companyTotals([{ line: se, minorUnits: 100 }, { line: fr, minorUnits: 100 }], 1_000_000, { ...rules, companyTax: { on: true, pct: 20.6 } });
  assert.equal(company.owesSekMinor, 50_000);
  assert.equal(company.companyTaxSekMinor, 206_000);
  assert.equal(companyTotals([], 100, rules).companyTaxSekMinor, null);
  assert.match(taxRulesError({ ...rules, sekPer: { EUR: 0, TND: 3.5 } }) ?? "", /Exchange/);
  assert.match(taxRulesError({ ...rules, countries: { ...rules.countries, SE: { ...rules.countries.SE, rideVat: { on: true, pct: 80 } } } }) ?? "", /0 to 50/);
  assert.equal(normalizeTaxRules({ countries: { FR: { rideVat: { on: false, pct: 0 } } } }).countries.FR.reverseCharge, true);
  assert.equal(normalizeTaxRules(null).home, "SE");
});

test("fleet owners: drivers, rides and what the drivers earned (no owner's share, v0.18.88)", () => {
  const rows = fleetRows([
    { id: "D1", fleetId: "F1", zoneId: "Z1", trips: 10, grossMinor: 10_000, netMinor: 8_000, previousTrips: 8, rating: 4.8, online: true },
    { id: "D2", fleetId: "F1", zoneId: "Z2", trips: 30, grossMinor: 30_000, netMinor: 24_000, previousTrips: 20, rating: 4.4, online: false },
    { id: "D3", fleetId: null, zoneId: "Z1", trips: 5, grossMinor: 5_000, netMinor: 4_000, previousTrips: 5, rating: 5, online: true },
  ], [{ id: "F1", name: "North" }, { id: "F2", name: "Empty" }]);
  assert.equal(rows.length, 1, "fleets without drivers are left out");
  assert.equal(rows[0].drivers, 2);
  assert.equal(rows[0].online, 1);
  assert.equal(rows[0].trips, 40);
  assert.equal(rows[0].driverMinor, 8_000 + 24_000);
  assert.ok(!("fleetMinor" in rows[0]));
  assert.equal(rows[0].perDriverTrips, 20);
  assert.equal(rows[0].rating, 4.5);
});

test("zones side by side, surge from how busy a zone is, support and promotions", () => {
  const zone = (id: string, trips: number, waitMin: number, previousTrips: number) => ({ id, name: id, trips, cancelled: 1, cancelPct: 5, waitMin, grossMinor: trips * 1_000, netMinor: trips * 200, previousTrips, previousCancelPct: 5 });
  const zones = compareZones([zone("A", 75, 4, 50), zone("B", 25, 9, 25)], { A: 2, B: 0.5 });
  assert.equal(zones.rows[0].ridesShare, 75);
  assert.equal(zones.rows[0].growthPct, 50);
  assert.equal(zones.rows[1].growthPct, 0);
  assert.equal(zones.rows[0].perRideMinor, 1_000);
  assert.ok(zones.notes.some((note) => /A has the most rides/.test(note.text)));
  assert.ok(zones.notes.some((note) => /B has the longest wait/.test(note.text)));
  assert.ok(zones.notes.some((note) => /A grew 50%/.test(note.text)));

  assert.equal(surgeFromRatio(1), 1);
  assert.equal(surgeFromRatio(2.4), 1.6);
  assert.equal(surgeFromRatio(9), 2.5);
  const hour = 3_600_000;
  const row = surgeZone({ id: "A", name: "A", trips: 100, grossMinor: 100_000 }, (at) => (at % (2 * hour) < hour ? 3 : 1), 0, 10 * hour);
  assert.equal(row.samples, 10);
  assert.equal(row.surgeSamples, 5);
  assert.equal(row.surgePct, 50);
  assert.equal(row.avgMultiplier, 2, "ratio 3 gives 1 + 1.6 × 0.6 = 1.96, rounded to one decimal");
  assert.equal(row.ridesInSurge, 50);
  assert.ok(row.extraMinor > 0 && row.extraMinor < 50_000);
  const quiet = surgeZone({ id: "B", name: "B", trips: 10, grossMinor: 10_000 }, () => 1, 0, hour);
  assert.equal(quiet.extraMinor, 0);
  const cards = surgeCards([row, quiet]);
  assert.equal(cards.find((card) => card.id === "surgeTime")?.value, 45.5);
  assert.equal(cards.find((card) => card.id === "rides")?.value, 50);

  const t0 = Date.parse("2026-10-12T08:00:00Z");
  const care = supportSafety([
    { openedAt: t0, firstReplyAt: t0 + 10 * 60_000, solvedAt: t0 + 2 * hour, rating: 5, topic: "ride", replyLate: false, solveLate: false, who: "rider" },
    { openedAt: t0 + hour, firstReplyAt: null, solvedAt: null, rating: null, topic: "payment", replyLate: true, solveLate: false, who: "rider" },
    { openedAt: t0 - 5 * hour, firstReplyAt: null, solvedAt: null, rating: null, topic: "ride", replyLate: false, solveLate: false, who: "driver" },
  ], [{ openedAt: t0, takenAt: t0 + 4 * 60_000, solvedAt: t0 + 30 * 60_000, level: "critical", kind: "sos", state: "solved" }], t0, t0 + 3 * hour);
  const value = (id: string) => care.cards.find((card) => card.id === id)?.value;
  assert.equal(value("tickets"), 2);
  assert.equal(value("solved"), 1);
  assert.equal(value("reply"), 10);
  assert.equal(value("solveTime"), 2);
  assert.equal(value("rating"), 5);
  assert.equal(value("take"), 4);
  assert.equal(value("close"), 30);
  assert.deepEqual(care.topics, [{ label: "ride", value: 1 }, { label: "payment", value: 1 }]);
  assert.equal(care.notes.length, 2);

  const promos = promoReturn([
    { id: "a", kind: "Rider promotions", title: "Welcome", cost: 1_000, rides: 40, newRiders: 10, revenue: 5_000, status: "active" },
    { id: "b", kind: "Voucher codes", title: "AUTUMN", cost: 500, rides: 10, newRiders: 0, revenue: 1_000, status: "active" },
  ]);
  const promo = (id: string) => promos.cards.find((card) => card.id === id)?.value;
  assert.equal(promo("cost"), 1_500);
  assert.equal(promo("perNew"), 150);
  assert.equal(promo("back"), 4);
  assert.equal(promos.best?.id, "a");
  assert.equal(promos.byKind.length, 2);
});
