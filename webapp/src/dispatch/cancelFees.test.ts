import { test } from "node:test";
import assert from "node:assert/strict";
import { cancelFeeAmount, cancelFeeIssues, completeCancelFees, DEFAULT_FEE_CATEGORIES, feeRow, largeCancelFeeChanges, riderSeesLine, sameForAll, type CancelFeeRow } from "./cancelFees.ts";
import { cancelDecision, changeLines, emptyDispatchBook, liveRules, normalizeDispatchBook, riderCancelFee, riderScheduledRules, zoneDefault, zoneIssues } from "./rules.ts";

const kr = (value: number) => `${value} kr`;

test("seed defaults per zone and car type, in the country's money", () => {
  const zone = zoneDefault("Z001");
  assert.deepEqual(zone.riderCancel.fees.comfort, { freeMin: 2, type: "fixed", value: 45, min: null, max: null });
  assert.deepEqual(zone.riderCancel.fees.xl, { freeMin: 3, type: "percent", value: 15, min: 50, max: 150 });
  assert.deepEqual(zone.reservation.riderFees.premium, { freeMin: 120, type: "percent", value: 25, min: 80, max: 300 });
  assert.equal(zoneDefault("FR-PC").reservation.riderFees.premium.value, 25, "a % stays a %");
  assert.equal(zoneDefault("FR-PC").reservation.riderFees.premium.min, 7.6, "80 kr in euros");
  assert.deepEqual(zoneIssues(zone), []);
});

test("fee: fixed, or % of the price rounded half-up to a whole minor unit and kept between min and max", () => {
  const pct: CancelFeeRow = { freeMin: 120, type: "percent", value: 25, min: 80, max: 300 };
  assert.equal(cancelFeeAmount(pct, 420, "SE"), 105);
  assert.equal(cancelFeeAmount(pct, 200, "SE"), 80, "never under min");
  assert.equal(cancelFeeAmount(pct, 2000, "SE"), 300, "never over max");
  assert.equal(cancelFeeAmount({ ...pct, min: null, max: null }, 101, "SE"), 25.25, "X4: 25.25 kr stays 25.25 kr (whole öre), not 25 kr");
  assert.equal(cancelFeeAmount({ ...pct, value: 15, min: null, max: null }, 33.3, "FR"), 5, "4.995 € rounds half-up to 5.00 €");
  assert.equal(cancelFeeAmount({ ...pct, value: 15, min: null, max: null }, 123.45, "SE"), 18.52, "X4: 15% of 123.45 kr is 18.52 kr like the apps (was 19 kr)");
  assert.equal(cancelFeeAmount({ ...pct, value: 15, min: null, max: null }, 12.345, "TN"), 1.852, "TND rounds to a whole millime");
  assert.equal(cancelFeeAmount({ freeMin: 2, type: "fixed", value: 45, min: 80, max: 90 }, 1000, "SE"), 45, "min and max only count for a %");
  const zone = zoneDefault("Z001");
  assert.equal(riderCancelFee(zone, "live", "premium", 420), 63);
  assert.equal(riderCancelFee(zone, "reservation", "premium", 420), 105);
  assert.equal(riderCancelFee(zone, "reservation", "economy", 420), 50);
});

test("rider sees the free time and the fee", () => {
  const zone = zoneDefault("Z001");
  assert.deepEqual(riderSeesLine("live", zone.riderCancel.fees.comfort, 250, "SE", kr), { line: "Free cancel for 2 min after the driver accepts · then 45 kr", detail: "" });
  assert.deepEqual(riderSeesLine("reservation", zone.reservation.riderFees.premium, 420, "SE", kr), { line: "Free cancel until 12:00 · then 105 kr", detail: "(25%, between 80 kr and 300 kr)" });
  assert.equal(riderSeesLine("reservation", { ...zone.reservation.riderFees.economy, freeMin: 900 }, 0, "SE", kr).line, "Free cancel until 23:00, the day before · then 50 kr");
});

test("old saves: the one free time and fee go into every car type", () => {
  const old = zoneDefault("FR-PC") as unknown as Record<string, Record<string, unknown>>;
  const { fees: _live, ...oldCancel } = old.riderCancel;
  const { riderFees: _resv, ...oldResv } = old.reservation;
  void _live;
  void _resv;
  const stored = { ...old, riderCancel: { ...oldCancel, freeMin: 4, fee: 6 }, reservation: { ...oldResv, freeCancelMinutesBeforePickup: 90, lateCancelFee: 7.5 } };
  const zone = liveRules(normalizeDispatchBook(JSON.parse(JSON.stringify({ ...emptyDispatchBook(), live: { "FR-PC": stored } }))), "FR-PC");
  for (const row of Object.values(zone.riderCancel.fees)) assert.deepEqual(row, { freeMin: 4, type: "fixed", value: 6, min: null, max: null });
  for (const row of Object.values(zone.reservation.riderFees)) assert.deepEqual(row, { freeMin: 90, type: "fixed", value: 7.5, min: null, max: null });
  assert.equal("freeMin" in zone.riderCancel || "fee" in zone.riderCancel, false, "the old fields are gone");
  assert.equal("lateCancelFee" in zone.reservation || "freeCancelMinutesBeforePickup" in zone.reservation, false);
  assert.deepEqual(zoneIssues(zone), []);
  // A save without the fee fields keeps the old money default (5 € in France) for the missing one.
  const partly = liveRules(normalizeDispatchBook({ ...emptyDispatchBook(), live: { "FR-PC": { ...stored, riderCancel: { ...oldCancel, freeMin: 3 } } } }), "FR-PC");
  assert.equal(partly.riderCancel.fees.xl.value, 5);
  // A new save with a broken row is filled from the defaults, field by field.
  const broken = liveRules(normalizeDispatchBook({ ...emptyDispatchBook(), live: { Z001: { riderCancel: { fees: { premium: { type: "nope", value: 20 } } } } } }), "Z001");
  assert.deepEqual(broken.riderCancel.fees.premium, { freeMin: 3, type: "percent", value: 20, min: 50, max: 150 });
});

test("checks: % 0–100, fixed 0–1000, min not over max, free minutes in range", () => {
  const table = zoneDefault("Z001").riderCancel.fees;
  assert.deepEqual(cancelFeeIssues({ ...table, premium: { ...table.premium, value: 120 } }, "live"), ["Rider cancels, Premium: the fee must be 0 to 100% of the price."]);
  assert.deepEqual(cancelFeeIssues({ ...table, economy: { ...table.economy, value: 1200 } }, "live"), ["Rider cancels, Movera: the fixed fee must be 0 to 1000."]);
  assert.deepEqual(cancelFeeIssues({ ...table, xl: { ...table.xl, min: 200, max: 100 } }, "live"), ["Rider cancels, Movera XL: the lowest fee must not be more than the highest."]);
  assert.deepEqual(cancelFeeIssues({ ...table, xl: { ...table.xl, max: null } }, "live"), [], "min and max are optional");
  assert.deepEqual(cancelFeeIssues({ ...table, comfort: { ...table.comfort, freeMin: 16 } }, "live"), ["Rider cancels, Comfort: free cancel must be 0 to 15 minutes after the driver accepts."]);
  assert.deepEqual(cancelFeeIssues(sameForAll(table, "premium", DEFAULT_FEE_CATEGORIES), "reservation"), [], "same for all copies one row");
  assert.equal(DEFAULT_FEE_CATEGORIES.every(({ id }) => feeRow(sameForAll(table, "premium", DEFAULT_FEE_CATEGORIES), id).value === 15), true);
  const base = zoneDefault("Z001");
  const off = { ...base, riderCancel: { ...base.riderCancel, on: false, fees: { ...table, premium: { ...table.premium, value: 120 } } } };
  assert.deepEqual(zoneIssues(off), [], "an off smart check is not checked");
  assert.ok(changeLines(base, { ...base, riderCancel: { ...base.riderCancel, fees: { ...table, comfort: { ...table.comfort, type: "percent", max: 90 } } } }).includes("Live trips, Comfort: fee type: fixed → % of price"));
  assert.ok(changeLines(base, { ...base, riderCancel: { ...base.riderCancel, fees: { ...table, comfort: { ...table.comfort, max: 90 } } } }).includes("Live trips, Comfort: highest fee: none → 90"));
});

test("every car type Pricing lists: a car type without a row copies Economy until it gets its own", () => {
  const zone = zoneDefault("Z001");
  const categories = [...DEFAULT_FEE_CATEGORIES, { id: "van", label: "Van" }];
  assert.equal(DEFAULT_FEE_CATEGORIES.length, 8, "Pricing's built-in car types, Priority, Electric, Pet and Child Seat too");
  assert.deepEqual(feeRow(zone.reservation.riderFees, "van"), zone.reservation.riderFees.economy);
  assert.equal(riderCancelFee(zone, "live", "pet", 300), 35, "a car type without a row pays Economy's fee");
  assert.equal(riderCancelFee({ ...zone, riderCancel: { ...zone.riderCancel, fees: { ...zone.riderCancel.fees, van: { freeMin: 2, type: "percent", value: 20, min: null, max: null } } } }, "live", "van", 300), 60);
  const priority = { id: "c", tripId: "t", zoneId: "Z001", rider: "r", driverId: "d", driver: "d", acceptedAt: "", cancelledAt: "", minutesAfterAccept: 4, atAccept: { km: 4, etaMin: 10 }, atCancel: { km: 1, etaMin: 3 }, path: [], pickup: [0, 0] as [number, number], category: "priority", fare: 240 };
  assert.equal(cancelDecision(priority, zone).amount, 35, "Cancel checks use the trip's car type");
  // Checks name the car type as Pricing does; a row for a deleted car type is never checked.
  const fees = { ...zone.riderCancel.fees, van: { freeMin: 40, type: "fixed" as const, value: 30, min: null, max: null }, gone: { freeMin: 99, type: "fixed" as const, value: 5000, min: null, max: null } };
  assert.deepEqual(cancelFeeIssues(fees, "live", categories), ["Rider cancels, Van: free cancel must be 0 to 15 minutes after the driver accepts."]);
  assert.deepEqual(zoneIssues({ ...zone, riderCancel: { ...zone.riderCancel, fees } }, categories.filter((item) => item.id !== "van")), []);
  // The rider app gets every car type.
  const rules = riderScheduledRules(zone.reservation, "SE", categories);
  assert.deepEqual(Object.keys(rules.byCategory), categories.map((item) => item.id));
  assert.equal(rules.byCategory.van.feeMinor, 5000);
  // Saved rows of any car type load; a broken one is filled from Economy.
  const loaded = completeCancelFees({ van: { value: 70 }, economy: { freeMin: 1, type: "fixed", value: 20, min: null, max: null } }, zone.riderCancel.fees);
  assert.deepEqual(loaded.van, { freeMin: 1, type: "fixed", value: 70, min: null, max: null });
  assert.deepEqual(Object.keys(loaded), ["economy", "comfort", "premium", "xl", "van"]);
  // A change on a car type that copied Economy shows only what changed.
  assert.deepEqual(changeLines(zone, { ...zone, riderCancel: { ...zone.riderCancel, fees: { ...zone.riderCancel.fees, pet: { ...zone.riderCancel.fees.economy, value: 40 } } } }), ["Live trips, Pet: fee: 35 → 40"]);
});

test("A-O3: cancel fees moving more than 50 % from the published table are listed for \"Are you sure?\"", () => {
  const live = zoneDefault("Z001").riderCancel.fees;
  const cats = [{ id: "economy", label: "Movera" }, { id: "comfort", label: "Comfort" }, { id: "premium", label: "Premium" }];
  assert.deepEqual(largeCancelFeeChanges(live, structuredClone(live), cats, "Norrmalm · Rider cancels", "kr"), []);
  const next = structuredClone(live);
  next.economy.value = 100; // 35 → 100 kr
  next.comfort.value = 60; // 45 → 60 kr, +33 %
  next.premium.max = 50; // 150 → 50 kr
  const lines = largeCancelFeeChanges(live, next, cats, "Norrmalm · Rider cancels", "kr");
  assert.deepEqual(lines, ["Norrmalm · Rider cancels, Movera: fee 35 → 100 kr (+186%)", "Norrmalm · Rider cancels, Premium: highest fee 150 → 50 kr (−67%)"]);
  const switched = structuredClone(live);
  switched.economy = { ...switched.economy, type: "percent", value: 90 };
  assert.deepEqual(largeCancelFeeChanges(live, switched, cats, "x", "kr"), [], "a fixed to % switch has nothing to compare");
});

test("G7 live fix 2: the rider-sees line is in the panel's language (sv / fr / en)", async () => {
  const { registerDictionary, setLanguage } = await import("../i18n/core.ts");
  const { fr } = await import("../i18n/fr.ts");
  const { sv } = await import("../i18n/sv.ts");
  registerDictionary("fr", fr);
  registerDictionary("sv", sv);
  const comfort = zoneDefault("Z001").riderCancel.fees.comfort;
  const eur = (value: number) => `${value} €`;
  try {
    setLanguage("fr");
    assert.equal(riderSeesLine("live", comfort, 250, "FR", eur).line, "Annulation gratuite pendant 2 min après l'acceptation du chauffeur · puis 45 €");
    setLanguage("sv");
    assert.equal(riderSeesLine("live", comfort, 250, "SE", kr).line, "Gratis avbokning i 2 min efter att föraren accepterat · sedan 45 kr");
    assert.equal(riderSeesLine("live", { ...comfort, freeMin: 0, value: 0 }, 250, "SE", kr).line, "Ingen gratis avbokning efter att föraren accepterat · ingen avgift efteråt");
    setLanguage("en");
    assert.equal(riderSeesLine("live", comfort, 250, "SE", kr).line, "Free cancel for 2 min after the driver accepts · then 45 kr");
  } finally {
    setLanguage("en");
  }
});
