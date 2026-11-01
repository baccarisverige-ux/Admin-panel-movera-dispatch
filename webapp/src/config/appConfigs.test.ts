import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { contractJson } from "../contract/load.ts";
import { moneySchema, type Money } from "../domain/money.ts";
import { cancelFeeAmount } from "../dispatch/cancelFees.ts";
import { emptyDispatchBook, liveRules, publish, rulesFile } from "../dispatch/rules.ts";
import { market } from "../markets/markets.ts";
import { savePaymentPolicy, defaultFinanceBook, defaultMethodPolicy } from "../payments/finance.ts";
import { emptyConfig, setZoneOverride } from "./book.ts";
import { appConfigFileName, appConfigState, driverAppConfig, feeFor, riderAppConfig, type FeeRule } from "./appConfigs.ts";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const NOW = "2026-10-19T08:00:00Z";
const riderSample = contractJson<{ [key: string]: Json }>("fixtures/config/rider_app_config.json");
const driverSample = contractJson<{ [key: string]: Json }>("fixtures/config/driver_app_config.json");
const feeCases = contractJson<{ cases: { id: string; kind: "live" | "reservation"; rule: FeeRule; fare: Money; minutesSinceAccept?: number; minutesBeforePickup?: number; fee: Money }[] }>("fixtures/cancel_fees.json");

const feeRuleSchema = z.object({
  freeMin: z.number().int().nonnegative(),
  type: z.enum(["fixed", "percent"]),
  value: z.number().nonnegative(),
  min: moneySchema.nullable(),
  max: moneySchema.nullable(),
}).strict().refine((rule) => rule.type === "percent" || Number.isInteger(rule.value), "a fixed value is whole minor units");

/** Maps keyed by category id: every entry is a FeeRule. */
const FEE_MAPS = new Set(["cancelFees.live", "cancelFees.reservation"]);

/** Every key of the contract sample is in the document with the same JSON type (arrays: each item like the sample's first). */
function sameShape(sample: Json, doc: unknown, path: string, problems: string[]) {
  if (sample === null) return;
  if (FEE_MAPS.has(path)) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) { problems.push(`${path}: not an object`); return; }
    for (const [id, rule] of Object.entries(doc)) {
      const parsed = feeRuleSchema.safeParse(rule);
      if (!parsed.success) problems.push(`${path}.${id}: not a FeeRule ${JSON.stringify(rule)}`);
    }
    for (const id of Object.keys(sample as object)) if (!(id in doc)) problems.push(`${path}.${id}: missing`);
    return;
  }
  if (Array.isArray(sample)) {
    if (!Array.isArray(doc)) { problems.push(`${path}: expected an array`); return; }
    if (sample.length && doc.length) doc.forEach((item, index) => sameShape(sample[0], item, `${path}[${index}]`, problems));
    return;
  }
  if (typeof sample === "object") {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) { problems.push(`${path}: expected an object`); return; }
    if ("amountMinor" in sample && !moneySchema.safeParse(doc).success) problems.push(`${path}: not Money ${JSON.stringify(doc)}`);
    for (const [key, value] of Object.entries(sample)) {
      if (!(key in doc)) problems.push(`${path ? `${path}.` : ""}${key}: missing`);
      else sameShape(value, (doc as Record<string, unknown>)[key], path ? `${path}.${key}` : key, problems);
    }
    return;
  }
  if (typeof doc !== typeof sample) problems.push(`${path}: ${typeof doc} instead of ${typeof sample}`);
}

/** Every Money-looking value in the document, with its path. */
function moneyIn(value: unknown, path = "", out: { path: string; value: unknown }[] = []) {
  if (value && typeof value === "object") {
    if (!Array.isArray(value) && "amountMinor" in value) out.push({ path, value });
    else for (const [key, item] of Object.entries(value)) moneyIn(item, `${path}.${key}`, out);
  }
  return out;
}

const ZONES = ["Z001", "FR-PC", "TN-TC"] as const;
const state = () => appConfigState({ now: NOW });

for (const zoneId of ZONES) {
  test(`${zoneId}: RiderAppConfig and DriverAppConfig have the contract sample's keys, shapes and types`, () => {
    for (const [sample, doc] of [[riderSample, riderAppConfig(zoneId, state())], [driverSample, driverAppConfig(zoneId, state())]] as const) {
      const problems: string[] = [];
      sameShape(sample, JSON.parse(JSON.stringify(doc)), "", problems);
      assert.deepEqual(problems, [], `${zoneId} ${String(sample.version)}`);
      assert.equal(doc.zoneId, zoneId);
      assert.equal(doc.currency, market(zoneId === "Z001" ? "SE" : zoneId === "FR-PC" ? "FR" : "TN").currency);
      assert.ok(Number.isInteger(doc.version) && doc.version >= 1);
      assert.match(doc.publishedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/);
    }
  });

  test(`${zoneId}: Money is integer minor units in the zone's currency, and every category id is in the catalog`, () => {
    for (const doc of [riderAppConfig(zoneId, state()), driverAppConfig(zoneId, state())]) {
      for (const { path, value } of moneyIn(doc)) {
        assert.ok(moneySchema.safeParse(value).success, `${path} ${JSON.stringify(value)}`);
        assert.equal((value as Money).currency, doc.currency, path);
      }
      const ids = new Set(doc.catalog.categories.map((item) => item.id));
      assert.ok(ids.size > 0);
      doc.catalog.categories.forEach((item, index) => assert.equal(item.sort, index + 1));
      for (const map of [doc.cancelFees.live, doc.cancelFees.reservation, doc.waiting.byCategory]) {
        assert.deepEqual(Object.keys(map).sort(), [...ids].sort(), "one rule per catalog category, and no other");
      }
      for (const id of Object.keys(doc.cancelFees.live)) assert.match(id, /^[a-z][a-z0-9_]{1,31}$/);
    }
    assert.deepEqual(Object.keys(driverAppConfig(zoneId, state()).pickupPay.byCategory).sort(), driverAppConfig(zoneId, state()).catalog.categories.map((item) => item.id).sort());
  });
}

test("units: admin major units become contract minor units by the ISO exponent (X2)", () => {
  const se = riderAppConfig("Z001", state());
  assert.deepEqual(se.cancelFees.live.economy, { freeMin: 2, type: "fixed", value: 3500, min: null, max: null }, "35 kr = 3500 öre");
  assert.deepEqual(se.cancelFees.live.premium, { freeMin: 3, type: "percent", value: 15, min: { amountMinor: 5000, currency: "SEK" }, max: { amountMinor: 15000, currency: "SEK" } });
  assert.deepEqual(se.cancelFees.reservation.premium, { freeMin: 120, type: "percent", value: 25, min: { amountMinor: 8000, currency: "SEK" }, max: { amountMinor: 30000, currency: "SEK" } });
  assert.deepEqual(se.waiting.perMin, { amountMinor: 1226, currency: "SEK" }, "12.26 kr/min from Pricing");
  const tn = riderAppConfig("TN-TC", state());
  assert.deepEqual(tn.cancelFees.live.economy, { freeMin: 2, type: "fixed", value: 10500, min: null, max: null }, "10.5 DT = 10500 millimes (3 decimals)");
  const fr = riderAppConfig("FR-PC", state());
  assert.equal(fr.cancelFees.live.economy.value, 335, "3.35 € = 335 cents");
  assert.equal(driverAppConfig("TN-TC", state()).waiting.noShowFee.amountMinor % 1, 0);
  // The SEK defaults match the contract sample's economy / comfort / premium / xl rules exactly.
  const sample = riderSample.cancelFees as { live: Record<string, Json>; reservation: Record<string, Json> };
  for (const id of ["economy", "comfort", "premium", "xl", "electric"] as const) {
    assert.deepEqual(se.cancelFees.live[id], sample.live[id], `live ${id}`);
    assert.deepEqual(se.cancelFees.reservation[id], sample.reservation[id], `reservation ${id}`);
  }
});

test("contract cancel_fees.json replays through feeFor, and through the FeeRules Admin exports", () => {
  const exported = [...ZONES].flatMap((zoneId) => {
    const doc = riderAppConfig(zoneId, state());
    return [...Object.values(doc.cancelFees.live).map((rule) => ({ kind: "live", rule, currency: doc.currency })), ...Object.values(doc.cancelFees.reservation).map((rule) => ({ kind: "reservation", rule, currency: doc.currency }))];
  });
  let matched = 0;
  for (const item of feeCases.cases) {
    const minutes = item.kind === "live" ? item.minutesSinceAccept! : item.minutesBeforePickup!;
    assert.deepEqual(feeFor(item.rule, item.fare, item.kind, minutes), item.fee, item.id);
    const same = exported.find((row) => row.kind === item.kind && row.currency === item.fare.currency && JSON.stringify(row.rule) === JSON.stringify(item.rule));
    if (same) {
      matched += 1;
      assert.deepEqual(feeFor(same.rule as FeeRule, item.fare, item.kind, minutes), item.fee, `${item.id} via exported rule`);
    }
  }
  assert.ok(matched >= 5, `the exported SEK rules cover the fixture's rules (${matched})`);
});

test("X4: the Admin fee preview (cancelFeeAmount, major units) agrees with every cancel_fees.json case", () => {
  const countryOf = { SEK: "SE", EUR: "FR", TND: "TN" } as const;
  for (const item of feeCases.cases) {
    const minutes = item.kind === "live" ? item.minutesSinceAccept! : item.minutesBeforePickup!;
    const free = item.kind === "live" ? minutes < item.rule.freeMin : minutes >= item.rule.freeMin;
    if (free) continue;
    const country = countryOf[item.fare.currency];
    const minor = market(country).minorUnits;
    const major = (value: Money | null) => (value === null ? null : value.amountMinor / minor);
    const row = { freeMin: item.rule.freeMin, type: item.rule.type, value: item.rule.type === "fixed" ? item.rule.value / minor : item.rule.value, min: major(item.rule.min), max: major(item.rule.max) };
    const fee = cancelFeeAmount(row, item.fare.amountMinor / minor, country);
    assert.equal(Math.round(fee * minor), item.fee.amountMinor, item.id);
  }
});

test("documents follow the live admin state: published fees, overrides, payment policies, version", () => {
  const base = state();
  // Dispatch: publish a new live economy fee in Z001.
  const zone = liveRules(base.dispatch, "Z001");
  const next = { ...zone, riderCancel: { ...zone.riderCancel, fees: { ...zone.riderCancel.fees, economy: { freeMin: 4, type: "fixed" as const, value: 40, min: null, max: null } } } };
  const published = publish(base.dispatch, { Z001: next }, {}, ["Z001"], "nora", "2026-10-19T09:30:00.000Z", "");
  assert.ok(!published.error && published.live.includes("Z001"), published.error ?? "");
  const after = { ...base, dispatch: published.book };
  assert.deepEqual(riderAppConfig("Z001", after).cancelFees.live.economy, { freeMin: 4, type: "fixed", value: 4000, min: null, max: null });
  assert.deepEqual(driverAppConfig("Z001", after).cancelFees.live.economy, { freeMin: 4, type: "fixed", value: 4000, min: null, max: null });
  assert.ok(riderAppConfig("Z001", after).version > riderAppConfig("Z001", base).version, "version only goes up");
  assert.equal(riderAppConfig("Z001", after).publishedAt, "2026-10-19T09:30:00Z");
  // A draft that is not published changes nothing.
  assert.deepEqual(riderAppConfig("Z002", after).cancelFees.live.economy.value, 3500);
  // Q26 / X18: scheduled rides are owned by Dispatch › Reservations; an old Settings override no longer decides it.
  const config = emptyConfig("nora");
  const off = setZoneOverride(config, "op-norrmalm", "reservations", false, "nora");
  const withOff = { ...base, config: { ...off, published: off.draft } };
  assert.equal(riderAppConfig("Z001", withOff).features.scheduledRides, true, "the old Settings switch is read-only");
  const dispatchOff = publish(base.dispatch, { Z001: { ...liveRules(base.dispatch, "Z001"), reservation: { ...liveRules(base.dispatch, "Z001").reservation, on: false } } }, {}, ["Z001"], "nora", "2026-10-19T09:40:00.000Z", "");
  assert.ok(!dispatchOff.error, dispatchOff.error ?? "");
  assert.equal(riderAppConfig("Z001", { ...base, dispatch: dispatchOff.book }).features.scheduledRides, false, "Dispatch decides");
  assert.equal(driverAppConfig("Z001", { ...base, dispatch: dispatchOff.book }).features.scheduledRides, false, "for both apps");
  assert.equal(riderAppConfig("Z002", { ...base, dispatch: dispatchOff.book }).features.scheduledRides, true, "only in that zone");
  // Finance: cash off for every category and platform in Z001.
  let finance = defaultFinanceBook();
  for (const category of riderAppConfig("Z001", base).catalog.categories) for (const platform of ["ios", "android"] as const) finance = savePaymentPolicy(finance, { zoneId: "Z001", category: category.id, platform }, { ...defaultMethodPolicy(), cash: false });
  assert.ok(!riderAppConfig("Z001", { ...base, finance }).paymentMethods.includes("cash"));
  assert.ok(riderAppConfig("Z002", { ...base, finance }).paymentMethods.includes("cash"));
});

/** contract.json#configDefaults.reservations: the driver app's defaults for DriverAppConfig.reservations (v0.4.1, CONTRACT.md §6.1). */
const reservationDefaults = Object.fromEntries(Object.entries(contractJson<{ configDefaults: { reservations: { [key: string]: Json } } }>("contract.json").configDefaults.reservations).filter(([key]) => key !== "note"));
const RESERVATION_ENUMS = { onDriverCancel: ["byTime", "list", "home", "exclusive"], reassignTo: ["exclusive", "radar", "dispatch"] };

test("DriverAppConfig.reservations: the admin defaults are the contract defaults, with exactly its keys", () => {
  for (const zoneId of ZONES) {
    const doc = JSON.parse(JSON.stringify(driverAppConfig(zoneId, state()).reservations)) as { [key: string]: Json };
    assert.deepEqual(doc, reservationDefaults, `${zoneId}: every key, ride type and lateEta value as in contract.json`);
    assert.deepEqual(Object.keys(doc.rideTypes as object).sort(), ["airport", "comfortPremium", "event", "longTrip", "normal"]);
    assert.ok(RESERVATION_ENUMS.onDriverCancel.includes(doc.onDriverCancel as string));
    assert.ok(RESERVATION_ENUMS.reassignTo.includes((doc.lateEta as { reassignTo: string }).reassignTo));
  }
});

test("DriverAppConfig.reservations follows the published Dispatch › Reservations of the zone", () => {
  const base = state();
  const zone = liveRules(base.dispatch, "Z001");
  const resv = zone.reservation;
  const next = {
    ...zone, longTripKm: 80,
    reservation: {
      ...resv, lateBackupAfterMin: 9, homePopupAfterMin: 25, latePauseAfter: 4, latePeriodDays: 14, latePauseDays: 3, assignAcceptSec: 45, onDriverCancel: "home" as const,
      types: { ...resv.types, premium: { onlineBeforeMin: 50, spareMin: 20, remindFirstMin: 90, remindLastMin: 10 }, long: { ...resv.types.long, onlineBeforeMin: 75 } },
      lateEta: { on: false, toleranceMin: 7, checkEverySeconds: 120, reassignTo: "dispatch" as const },
    },
  };
  const published = publish(base.dispatch, { Z001: next }, {}, ["Z001"], "nora", "2026-10-19T09:30:00.000Z", "");
  assert.ok(!published.error, published.error ?? "");
  const doc = driverAppConfig("Z001", { ...base, dispatch: published.book }).reservations;
  assert.equal(doc.offlineBackupAfterMin, 9, "lateBackupAfterMin is the offline rule");
  assert.equal(doc.homePopupAfterMin, 25);
  assert.equal(doc.longTripKm, 80);
  assert.deepEqual([doc.lateCancelLimit, doc.lateCancelPeriodDays, doc.pauseDays, doc.assignAcceptSeconds, doc.onDriverCancel], [4, 14, 3, 45, "home"]);
  assert.deepEqual(doc.rideTypes.comfortPremium, { onlineBeforeMin: 50, spareMin: 20, reminderMin: [90, 10] }, "premium is comfortPremium");
  assert.equal(doc.rideTypes.longTrip.onlineBeforeMin, 75, "long is longTrip");
  assert.deepEqual(doc.lateEta, { on: false, toleranceMin: 7, checkEverySeconds: 120, reassignTo: "dispatch" });
  assert.deepEqual(driverAppConfig("Z002", { ...base, dispatch: published.book }).reservations, driverAppConfig("Z002", base).reservations, "only that zone");
});

test("the legacy rules file is unchanged in shape", () => {
  const file = rulesFile(emptyDispatchBook(), "SE", NOW);
  assert.deepEqual(Object.keys(file), ["format", "version", "exportedAt", "revision", "rideCheckThresholds", "country", "glossary", "zones", "events", "groups", "riderApp", "driverApp"]);
  assert.equal(file.format, "movera.dispatch.rules");
  assert.equal(file.zones[0].rules.riderCancel.fees.economy.value, 35, "the rules file keeps major units");
});

test("rider cancel reasons are the Dispatch rider codes; driver groups list codes and texts carry the titles", () => {
  const rider = riderAppConfig("Z001", state());
  assert.deepEqual(rider.cancelReasons.map((item) => item.code), ["pickup_incorrect", "wrong_ride_option", "requested_by_mistake", "wait_too_long", "destination_change", "driver_not_suitable", "plans_changed", "something_else"]);
  assert.equal(rider.cancelReasons[0].title, "Pickup point is incorrect");
  const driver = driverAppConfig("Z001", state());
  assert.deepEqual(driver.cancelReasons.noShow, ["rider_no_show"]);
  assert.equal(driver.texts.byLanguage.sv["cancelReason.rider_no_show"], "Rider did not arrive", "an empty language falls back to English");
  assert.equal(appConfigFileName("rider", rider), `movera-rider-app-config-Z001-v${rider.version}.json`);
});

/** The demo zones' documents, kept under __fixtures__ for the Rider and Driver parsers. UPDATE_APP_CONFIG_FIXTURES=1 rewrites them. */
test("fixtures under src/config/__fixtures__ are the current Admin output for the demo zones", () => {
  for (const zoneId of ZONES) {
    for (const [name, doc] of [["rider_app_config", riderAppConfig(zoneId, state())], ["driver_app_config", driverAppConfig(zoneId, state())]] as const) {
      const url = new URL(`./__fixtures__/${name}.${zoneId}.json`, import.meta.url);
      const text = `${JSON.stringify(doc, null, 2)}\n`;
      if (process.env.UPDATE_APP_CONFIG_FIXTURES === "1") writeFileSync(url, text);
      assert.equal(readFileSync(url, "utf8"), text, `${name}.${zoneId}.json is stale: run UPDATE_APP_CONFIG_FIXTURES=1 npm test`);
    }
  }
});

test("v0.18.8 (G6): the driver document publishes the zone's stop free wait and the Rider PIN switch (default off)", () => {
  for (const zoneId of ZONES) {
    const driver = driverAppConfig(zoneId, state());
    assert.deepEqual(driver.pickupPin, { required: false, maxAttempts: 5, lockMinutes: 5 }, zoneId);
    // v0.18.9 (owner G7 decision 4): the Dispatch default is 0 free minutes at a stop (paid from minute 1).
    assert.equal(driver.waiting.stopFreeWaitMin, 0, `${zoneId}: Dispatch › Stops free wait default 0`);
    assert.equal(riderAppConfig(zoneId, state()).waiting.stopFreeWaitMin, 0);
  }
});

test("v0.18.9 (G7): the driver document carries the zone's server ride check and route change switches (defaults)", () => {
  for (const zoneId of ZONES) {
    const driver = driverAppConfig(zoneId, state());
    assert.deepEqual(driver.routeChange, { on: true, driverCanRefuse: true, answerSeconds: 60, beforePickup: true, fixedPriceTrips: "block" }, zoneId);
    assert.deepEqual(riderAppConfig(zoneId, state()).routeChange, driver.routeChange);
    assert.equal(driver.rideCheck.on, true);
    assert.equal(driver.rideCheck.offRouteKm, 2);
    assert.equal(driver.rideCheck.stopMinutes, 2);
    assert.equal(driver.rideCheck.endFarMeters, 500);
    assert.equal(driver.rideCheck.noAnswerSeconds, 120);
    assert.equal(driver.rideCheck.repeatMinutes, 10);
    assert.equal(driver.rideCheck.noAnswerAlarm, false);
    assert.equal(driver.booking.maxStops, 3);
  }
});
