/**
 * Owner 2026-10-29 (Rules decisions/driver-g10.md:3): "Movera dont care about what fleet owner take from drivers! We just
 * send payout to owner fleet and if there is any % u delete that"; owner 2026-11-14 ~02:49 UTC on the commission card:
 * "What the fuck is fleet owner keep !???". Contract v0.18.88 contract.json#fleetPayoutWhole (fleetShareRemoved v0.18.13):
 * no fleet-owner % anywhere in admin; fleetCommissionPct is never shown, edited or sent, and ignored when read; a fleet
 * driver's payout is his whole driver earnings. Fail-before: every test below fails on origin/main cebe8351.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DemoRecord } from "../api/seed.ts";
import { bookOfPricing, pricingDocumentOf } from "../live/configDocs.ts";
import { emptyPayoutOps, normalizePayoutOps, payoutLines } from "../payments/runs.ts";
import { fleetRows } from "../reports/extra.ts";
import { moneySplit } from "../trips/file.ts";
import { defaultZoneBook, diffBooks, emptyPricingStore, zoneBook } from "./zonePricing.ts";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const FLEET_PCT = /fleetCommission|fleetPct|fleet-share|Fleet owner share|Fleet owner part|Fleet owner gets|fleet owner's share|Fleet owner's share|Fleet owner \$\{/;

test("the pricing book has no fleet-owner %: not in the default, not sent to the server, ignored when an old document has it", () => {
  const book = defaultZoneBook("Z001");
  assert.ok(!("fleetCommissionPct" in book), "no fleetCommissionPct in the default book (was 5)");
  const doc = pricingDocumentOf(zoneBook(emptyPricingStore(), "Z001"), "Z001", null);
  assert.ok(!("fleetCommissionPct" in doc), "a publish never sends fleetCommissionPct");
  const old = { ...doc, fleetCommissionPct: 7 };
  const read = bookOfPricing(old, zoneBook(emptyPricingStore(), "Z001"));
  assert.ok(!("fleetCommissionPct" in read), "an old document's fleetCommissionPct is ignored");
  assert.ok(!("fleetCommissionPct" in pricingDocumentOf(read, "Z001", old)), "and not written back");
  assert.ok(!diffBooks(book, book, []).some((line) => /fleet/i.test(line)), "no fleet line in the change list");
});

test("a fleet driver's trip: the driver gets the same as an own driver; no fleet-owner share in the split", () => {
  const trip: DemoRecord = { id: "T0012", name: "Maja Lind", phone: "+46 70 123 45 67", zoneId: "Z001", status: "completed", driverId: "D0001", fareOre: 10_000 };
  const split = moneySplit(trip, defaultZoneBook("Z001"), []);
  assert.ok(!("fleet" in split) && !("fleetPct" in split), "no fleet / fleetPct in the money split");
  assert.equal(split.riderPaid - split.driverGets, split.moveraKeeps, "every krona is the driver's or Movera's");
});

test("Payouts: no fleet-owner part; a fleet driver's payout lines are the same as an own driver's (the whole earnings)", () => {
  const ops = emptyPayoutOps();
  for (const sched of Object.values(ops.schedules)) assert.ok(!("fleetPct" in sched), "no fleetPct in the schedule (was 10)");
  const saved = normalizePayoutOps({ schedules: { SE: { ...ops.schedules.SE, fleetPct: 10 } } });
  assert.ok(!("fleetPct" in saved.schedules.SE), "an old saved fleetPct is dropped");
  const record: DemoRecord = { id: "PO1", name: "Week 1", phone: "", zoneId: "Z001", status: "scheduled", driverId: "D0001", fareOre: 125_000 };
  const { lines } = payoutLines(record, ops.schedules.SE);
  assert.ok(!lines.some((line) => /fleet/i.test(line.label)), "no Fleet owner line");
  assert.equal(lines.find((line) => line.kind === "total")?.minor, 125_000, "the driver's whole earnings");
});

test("Reports › Fleet owners: what the drivers earned, no owner's share", () => {
  const rows = fleetRows([{ id: "D1", fleetId: "F1", zoneId: "Z1", trips: 10, grossMinor: 10_000, netMinor: 8_000, previousTrips: 8, rating: 4.8, online: true }], [{ id: "F1", name: "North" }]);
  assert.equal(rows[0]!.driverMinor, 8_000);
  assert.ok(!("fleetMinor" in rows[0]!), "no fleetMinor");
});

test("no screen shows or edits a fleet-owner % (Commission card, Payouts, trip money, Reports)", () => {
  for (const file of ["./CommissionPanel.tsx", "./zonePricing.ts", "./book.ts", "./sets.ts", "../pages/PricingPage.tsx", "../payments/runs.ts", "../payments/PayoutParts.tsx", "../trips/file.ts", "../trips/TripParts.tsx", "../dashboard/tripMoney.ts", "../dashboard/TripMoneyTab.tsx", "../pages/TripPage.tsx", "../reports/extra.ts", "../reports/ExtraTabs.tsx", "../styles/pricing.css"]) {
    assert.doesNotMatch(source(file), FLEET_PCT, file);
  }
  assert.doesNotMatch(source("./CommissionPanel.tsx"), /tr\("Fleet owner"\)|onFleet/, "no Fleet owner line in the commission card");
  // configDocs.ts names the key once, only in the list of removed keys a publish deletes.
  const docs = source("../live/configDocs.ts");
  assert.equal(docs.match(/fleetCommissionPct/g)?.length, 1);
  assert.match(docs, /REMOVED_PRICING_KEYS = \["fleetCommissionPct"\]/);
  assert.match(source("../live/liveSettings.ts"), /savePublish\(http, "pricing", id, current, withoutRemovedPricingKeys\(/);
});
