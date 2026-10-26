import { test } from "node:test";
import assert from "node:assert/strict";
import { contractJson } from "../contract/load.ts";
import { PAYMENT_METHODS } from "../domain/contract.ts";
import type { Money } from "../domain/money.ts";
import { APP_LANGUAGES, CONFIG_DEFAULTS, defaultFreeWaitMin, ZONE_PAYMENT_METHODS, zonePaymentMethodOf } from "./zoneDefaults.ts";
import { appConfigState, driverAppConfig, riderAppConfig } from "./appConfigs.ts";

type Country = { currency: string; defaultLanguage: string; zones: Record<string, string>; tips: Money[]; raiseSteps: Money[]; driverBonus: { defaultLimit: Money; hardMax: Money } };
type Contract = {
  version: string;
  headers: Record<string, string>;
  paymentMethods: string[];
  paymentMethodAliases: Record<string, string>;
  zonePaymentMethods: { values: string[] };
  languages: { values: string[] };
  ratings: { min: number; max: number; step: number };
  adminDispatch: { radarGroup: { maxDrivers: number; offerKind: string }; directAssign: { offerKind: string; exclusive: boolean }; lockedStatuses: string[] };
  tripStatus: { driverAssigned: string[]; terminal: string[] };
  configDefaults: {
    maxStops: number; maxPickupMoveMeters: number; freeWaitMin: { default: number; xl: number };
    waitingDriverSharePct: number; noShowDriverSharePct: number; missedExclusiveBeforeOffline: number;
    countries: Record<string, Country>;
  };
};

const contract = contractJson<Contract>("contract.json");
const NOW = "2026-10-19T08:00:00Z";
const state = () => appConfigState({ now: NOW });

test("contract v0.5.6: version, X-Api-Version, payment methods, languages and ratings", () => {
  assert.equal(contract.version, "0.5.6");
  assert.equal(contract.headers["X-Api-Version"], "0.5");
  assert.deepEqual([...PAYMENT_METHODS], contract.paymentMethods);
  assert.ok(!contract.paymentMethods.includes("swish") && !contract.paymentMethods.includes("d17"));
  assert.deepEqual([...ZONE_PAYMENT_METHODS], contract.zonePaymentMethods.values);
  assert.deepEqual([...APP_LANGUAGES], contract.languages.values);
  assert.deepEqual([contract.ratings.min, contract.ratings.max, contract.ratings.step], [1, 5, 1], "whole stars 1-5 (Q38)");
  for (const [alias, id] of Object.entries(contract.paymentMethodAliases)) if (alias !== "note") assert.equal(zonePaymentMethodOf(alias), id);
  assert.equal(zonePaymentMethodOf("swish"), null);
  assert.equal(contract.adminDispatch.radarGroup.maxDrivers, 10);
  assert.deepEqual(contract.adminDispatch.lockedStatuses, [...contract.tripStatus.driverAssigned, ...contract.tripStatus.terminal]);
});

test("CONFIG_DEFAULTS equal contract.json#configDefaults", () => {
  const theirs = contract.configDefaults;
  assert.equal(CONFIG_DEFAULTS.maxStops, theirs.maxStops);
  assert.equal(CONFIG_DEFAULTS.maxPickupMoveMeters, theirs.maxPickupMoveMeters);
  assert.deepEqual(CONFIG_DEFAULTS.freeWaitMin, theirs.freeWaitMin);
  assert.equal(CONFIG_DEFAULTS.waitingDriverSharePct, theirs.waitingDriverSharePct);
  assert.equal(CONFIG_DEFAULTS.noShowDriverSharePct, theirs.noShowDriverSharePct);
  assert.equal(CONFIG_DEFAULTS.missedExclusiveBeforeOffline, theirs.missedExclusiveBeforeOffline);
  assert.deepEqual(Object.keys(CONFIG_DEFAULTS.countries).sort(), Object.keys(theirs.countries).sort());
  for (const [id, country] of Object.entries(theirs.countries)) {
    const ours = CONFIG_DEFAULTS.countries[id as keyof typeof CONFIG_DEFAULTS.countries];
    assert.equal(ours.currency, country.currency, id);
    assert.equal(ours.defaultLanguage, country.defaultLanguage, id);
    assert.deepEqual(ours.tips, country.tips, `${id} tips`);
    assert.deepEqual(ours.raiseSteps, country.raiseSteps, `${id} raise steps`);
    assert.deepEqual(ours.driverBonus, country.driverBonus, `${id} driver bonus`);
  }
  assert.equal(defaultFreeWaitMin("xl"), 3);
  assert.equal(defaultFreeWaitMin("economy"), 5);
});

for (const [zoneId, country, timeZone, lang] of [["Z001", "SE", "Europe/Stockholm", "sv"], ["FR-PC", "FR", "Europe/Paris", "fr"], ["TN-TC", "TN", "Africa/Tunis", "fr"]] as const) {
  test(`${zoneId}: both documents carry the v0.4 per-zone fields`, () => {
    const defaults = contract.configDefaults.countries[country];
    const rider = riderAppConfig(zoneId, state());
    const driver = driverAppConfig(zoneId, state());
    for (const doc of [rider, driver]) {
      assert.equal(doc.country, country);
      assert.equal(doc.timeZone, timeZone);
      assert.equal(defaults.zones[zoneId], timeZone);
      assert.deepEqual(doc.languages, { available: ["en", "fr", "sv"], default: { rider: lang, driver: lang, admin: lang } });
      assert.deepEqual(doc.paymentMethods, ["cash", "card", "apple_pay", "google_pay"], "Q7: the same four everywhere, no swish, no wallet");
      assert.equal(doc.booking.maxStops, 3);
      assert.equal(doc.booking.maxPickupMoveMeters, 500);
      for (const [id, wait] of Object.entries(doc.waiting.byCategory)) {
        assert.equal(wait.noShowAfterMin, wait.freeWaitMin, `${id}: no-show at the end of the free wait (Q41)`);
      }
      assert.equal(doc.waiting.byCategory.xl.freeWaitMin, 3);
      assert.equal(doc.waiting.byCategory.economy.freeWaitMin, 5);
    }
    assert.deepEqual(rider.tips, defaults.tips.map((amount) => ({ amount, enabled: true })));
    assert.deepEqual(rider.raiseSteps, defaults.raiseSteps.map((amount) => ({ amount, enabled: true })));
    assert.equal(rider.promoCap, null);
    assert.deepEqual(rider.wallet, { usedFirst: true });
    assert.deepEqual(driver.driverBonus, defaults.driverBonus);
    assert.equal(driver.offers.autoOffline.missedExclusive, 10, "owner decision 35: offline after 10, was 3");
    assert.equal(driver.waiting.driverSharePct, 80, "no-show share");
    assert.equal(driver.waiting.driverShareWaitPct, 100, "waiting fee share");
    assert.ok(!("driverBonus" in rider), "the rider never sees the Movera-paid driver bonus");
  });
}
