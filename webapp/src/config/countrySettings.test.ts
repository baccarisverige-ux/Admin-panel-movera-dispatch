import { test } from "node:test";
import assert from "node:assert/strict";
import { createFixtureAdminApi } from "../api/create.ts";
import { signedInFixture } from "../api/fixtureSession.ts";
import { ApiError } from "../api/httpClient.ts";
import { COMMANDS, SLICE_WRITERS } from "../commands/registry.ts";
import { publish, emptyDispatchBook, draftCountry, draftRules } from "../dispatch/rules.ts";
import { savePaymentPolicy } from "../payments/finance.ts";
import { appConfigState, driverAppConfig, riderAppConfig } from "./appConfigs.ts";
import {
  COUNTRY_SETTINGS_KEY,
  addAmount,
  countrySettingsIssues,
  countrySettingsOf,
  defaultCountrySettings,
  driverBonusHardMax,
  emptyCountrySettingsBook,
  largeCountryChanges,
  normalizeCountrySettingsBook,
  saveCountrySettings,
  type CountrySettings,
  type CountrySettingsBook,
} from "./countrySettings.ts";

const NOW = "2026-10-20T08:00:00Z";
const withCountry = (country: "SE" | "FR" | "TN", patch: Partial<CountrySettings>): CountrySettingsBook => {
  const book = emptyCountrySettingsBook();
  return { ...book, countries: { ...book.countries, [country]: { ...book.countries[country], ...patch } } };
};

test("defaults are the contract defaults (Q5, Q6, Q7, Q10, Q17, Q49)", () => {
  const se = defaultCountrySettings("SE");
  assert.deepEqual(se.tips.map((item) => item.amount), [10, 20, 30]);
  assert.deepEqual(se.raiseSteps.map((item) => item.amount), [50, 100, 150, 200]);
  assert.deepEqual(defaultCountrySettings("FR").tips.map((item) => item.amount), [1, 2, 5]);
  assert.deepEqual(defaultCountrySettings("TN").raiseSteps.map((item) => item.amount), [2, 4, 6, 8]);
  assert.equal(se.promoCap, null);
  assert.deepEqual([se.driverBonusLimit, defaultCountrySettings("FR").driverBonusLimit, defaultCountrySettings("TN").driverBonusLimit], [200, 20, 60]);
  assert.deepEqual([driverBonusHardMax("SE"), driverBonusHardMax("FR"), driverBonusHardMax("TN")], [1000, 95, 300]);
  assert.deepEqual(se.paymentMethods, { cash: true, card: true, apple_pay: true, google_pay: true });
  assert.deepEqual(se.languages, { rider: "sv", driver: "sv", admin: "sv" });
  assert.deepEqual(defaultCountrySettings("TN").languages, { rider: "fr", driver: "fr", admin: "fr" });
});

test("a list can change an amount, add one and switch one off", () => {
  const tips = defaultCountrySettings("SE").tips;
  const added = addAmount(tips, "tip", "SE");
  assert.equal(added.length, 4);
  assert.equal(added[3].id, "tip-4");
  assert.equal(added[3].amount, 40, "one step above the highest");
  assert.equal(new Set(added.map((item) => item.id)).size, 4);
  const off = added.map((item) => (item.id === "tip-2" ? { ...item, enabled: false } : item));
  assert.deepEqual(countrySettingsIssues("SE", { ...defaultCountrySettings("SE"), tips: off }), []);
  // Two active amounts that are the same are refused; an inactive duplicate is fine.
  const dup = off.map((item) => (item.id === "tip-3" ? { ...item, amount: 10 } : item));
  assert.match(countrySettingsIssues("SE", { ...defaultCountrySettings("SE"), tips: dup })[0], /same/);
  assert.deepEqual(countrySettingsIssues("SE", { ...defaultCountrySettings("SE"), tips: dup.map((item) => (item.id === "tip-3" ? { ...item, enabled: false } : item)) }), []);
});

test("Q17: the driver bonus limit can never go over the hard max", () => {
  const over = { ...defaultCountrySettings("FR"), driverBonusLimit: 96 };
  assert.match(countrySettingsIssues("FR", over)[0], /at most 95 €, the hard max/);
  assert.deepEqual(countrySettingsIssues("FR", { ...over, driverBonusLimit: 95 }), []);
  assert.match(countrySettingsIssues("TN", { ...defaultCountrySettings("TN"), driverBonusLimit: 300.5 })[0], /hard max/);
  // Even a stored value over the hard max is exported as the hard max.
  const state = appConfigState({ now: NOW, countrySettings: withCountry("SE", { driverBonusLimit: 5000 }) });
  assert.deepEqual(driverAppConfig("Z001", state).driverBonus.defaultLimit, { amountMinor: 100000, currency: "SEK" });
});

test("other checks: amounts above 0 and under the maximum, a promo cap above 0, at least one payment method, known languages", () => {
  const se = defaultCountrySettings("SE");
  assert.match(countrySettingsIssues("SE", { ...se, tips: [{ id: "tip-1", amount: 0, enabled: true }] })[0], /above 0/);
  assert.match(countrySettingsIssues("SE", { ...se, raiseSteps: [{ id: "raise-1", amount: 600, enabled: true }] })[0], /at most 500 kr/);
  assert.match(countrySettingsIssues("TN", { ...defaultCountrySettings("TN"), tips: [{ id: "tip-1", amount: 1.2345, enabled: true }] })[0], /3 decimals/);
  assert.match(countrySettingsIssues("SE", { ...se, promoCap: 0 })[0], /promo cap/);
  assert.match(countrySettingsIssues("SE", { ...se, paymentMethods: { cash: false, card: false, apple_pay: false, google_pay: false } })[0], /payment method/);
  assert.match(countrySettingsIssues("SE", { ...se, languages: { ...se.languages, admin: "de" as "en" } })[0], /language/);
});

test("Q29: tips, raise steps, promo cap and bonus limit moving more than 50 % ask Are you sure", () => {
  const se = defaultCountrySettings("SE");
  const next = { ...se, tips: se.tips.map((item) => (item.id === "tip-1" ? { ...item, amount: 16 } : item)), raiseSteps: se.raiseSteps.map((item) => (item.id === "raise-1" ? { ...item, amount: 70 } : item)), promoCap: 50, driverBonusLimit: 400 };
  const lines = largeCountryChanges("SE", { ...se, promoCap: 30 }, next);
  assert.deepEqual(lines, ["Sweden · Tip: 10 → 16 kr (+60%)", "Sweden · Promo cap: 30 → 50 kr (+67%)", "Sweden · Driver bonus limit: 200 → 400 kr (+100%)"]);
  assert.deepEqual(largeCountryChanges("SE", se, { ...se, tips: addAmount(se.tips, "tip", "SE") }), [], "a new amount has nothing to compare with");
});

test("a save keeps only its section's fields, so Pricing and Settings never overwrite each other", () => {
  const current = emptyCountrySettingsBook();
  const sent = withCountry("SE", { tips: [{ id: "tip-1", amount: 15, enabled: true }], paymentMethods: { cash: false, card: true, apple_pay: true, google_pay: true } });
  const pricing = saveCountrySettings(current, sent, "pricing");
  assert.equal(pricing.error, undefined);
  assert.equal(pricing.book.draftRev, 2);
  assert.deepEqual(countrySettingsOf(pricing.book, "SE").tips, [{ id: "tip-1", amount: 15, enabled: true }]);
  assert.equal(countrySettingsOf(pricing.book, "SE").paymentMethods.cash, true, "Pricing cannot change payment methods");
  const settings = saveCountrySettings(pricing.book, sent, "settings");
  assert.equal(countrySettingsOf(settings.book, "SE").paymentMethods.cash, false);
  assert.deepEqual(countrySettingsOf(settings.book, "SE").tips, [{ id: "tip-1", amount: 15, enabled: true }]);
  assert.ok(settings.lines.includes("Sweden: Cash: on → off"));
  assert.equal(saveCountrySettings(settings.book, settings.book, "settings").error, "Nothing changed.");
  assert.match(saveCountrySettings(current, withCountry("FR", { driverBonusLimit: 200 }), "pricing").error ?? "", /hard max/);
});

test("an older or broken save opens with the defaults", () => {
  const book = normalizeCountrySettingsBook({ draftRev: 4, countries: { SE: { tips: "x", languages: { rider: "de" }, promoCap: null }, FR: null } });
  assert.equal(book.draftRev, 4);
  assert.deepEqual(book.countries.SE.tips, defaultCountrySettings("SE").tips);
  assert.equal(book.countries.SE.languages.rider, "sv");
  assert.deepEqual(book.countries.FR, defaultCountrySettings("FR"));
  assert.deepEqual(normalizeCountrySettingsBook(null), emptyCountrySettingsBook());
});

test("the exporters read every new setting instead of the defaults", () => {
  const settings = withCountry("SE", {
    tips: [{ id: "tip-1", amount: 15, enabled: true }, { id: "tip-2", amount: 25, enabled: false }, { id: "tip-4", amount: 50, enabled: true }],
    raiseSteps: [{ id: "raise-1", amount: 40, enabled: true }],
    promoCap: 75.5,
    driverBonusLimit: 300,
    paymentMethods: { cash: false, card: true, apple_pay: true, google_pay: false },
    languages: { rider: "en", driver: "fr", admin: "sv" },
  });
  const dispatch = emptyDispatchBook();
  const zone = draftRules(dispatch, "Z001");
  const country = draftCountry(dispatch, "SE");
  const live = publish(dispatch, { Z001: { ...zone, stops: { ...zone.stops, max: 2 }, pickupMove: { maxMeters: 300 }, autoOffline: { on: true, after: 5, noFixMinutes: 5 } } }, { SE: { ...country, noShowDriverSharePct: 60 } }, ["Z001"], "nora", NOW, "").book;
  const state = appConfigState({ now: NOW, countrySettings: settings, dispatch: live });
  const rider = riderAppConfig("Z001", state);
  assert.deepEqual(rider.tips, [{ amount: { amountMinor: 1500, currency: "SEK" }, enabled: true }, { amount: { amountMinor: 2500, currency: "SEK" }, enabled: false }, { amount: { amountMinor: 5000, currency: "SEK" }, enabled: true }]);
  assert.deepEqual(rider.raiseSteps, [{ amount: { amountMinor: 4000, currency: "SEK" }, enabled: true }]);
  assert.deepEqual(rider.promoCap, { amountMinor: 7550, currency: "SEK" });
  assert.deepEqual(rider.paymentMethods, ["card", "apple_pay"]);
  assert.deepEqual(rider.languages.default, { rider: "en", driver: "fr", admin: "sv" });
  assert.deepEqual(rider.booking, { maxStops: 2, maxPickupMoveMeters: 300, bookingHorizonDays: rider.booking.bookingHorizonDays });
  const driver = driverAppConfig("Z001", state);
  assert.deepEqual(driver.driverBonus, { defaultLimit: { amountMinor: 30000, currency: "SEK" }, hardMax: { amountMinor: 100000, currency: "SEK" } });
  assert.deepEqual(driver.booking, { maxStops: 2, maxPickupMoveMeters: 300 });
  assert.equal(driver.offers.autoOffline.missedExclusive, 5);
  assert.equal(driver.offers.autoOffline.noFixMinutes, 5, "G3-R1: the driver app gets minutes without position per zone");
  assert.equal(driver.waiting.driverSharePct, 60, "Q44: the country's no-show share");
  assert.equal(driver.waiting.driverShareWaitPct, 100, "Q43: fixed");
  assert.deepEqual(driver.languages.default, { rider: "en", driver: "fr", admin: "sv" });
  assert.equal(rider.sourceRevisions.countrySettings, 1);
  // Other countries keep their own settings.
  assert.deepEqual(riderAppConfig("FR-PC", state).tips.map((item) => item.amount.amountMinor), [100, 200, 500]);
  assert.equal(riderAppConfig("FR-PC", state).promoCap, null);
  // Finance can still switch a ticked method off for every car type in a zone.
  let finance = state.finance;
  for (const category of rider.catalog.categories) for (const platform of ["ios", "android"] as const) finance = savePaymentPolicy(finance, { zoneId: "Z001", category: category.id, platform }, { card: false, apple: true, google: true, cash: true, wallet: true });
  assert.deepEqual(riderAppConfig("Z001", { ...state, finance }).paymentMethods, ["apple_pay"]);
});

test("the version goes up when the country settings are saved", () => {
  const before = riderAppConfig("Z001", appConfigState({ now: NOW }));
  const saved = saveCountrySettings(emptyCountrySettingsBook(), withCountry("SE", { promoCap: 40 }), "pricing").book;
  assert.ok(riderAppConfig("Z001", appConfigState({ now: NOW, countrySettings: saved })).version > before.version);
});

test("commands: two writers of the slice, one per section", () => {
  assert.deepEqual(SLICE_WRITERS[COUNTRY_SETTINGS_KEY], ["admin.pricing.saveCountry", "admin.config.saveCountry"]);
  for (const id of SLICE_WRITERS[COUNTRY_SETTINGS_KEY]) {
    const spec = COMMANDS.find((command) => command.id === id)!;
    assert.ok(spec.reason && spec.audit === "always" && spec.writes.slices.includes(COUNTRY_SETTINGS_KEY), `${id} is audited (My activity) and may write the slice`);
  }
});

test("the fixture server checks a save and keeps only the section's fields", async () => {
  const api = signedInFixture(createFixtureAdminApi(0));
  await api.reset();
  const save = async (action: string, value: unknown, key: string, actorId = "nora") =>
    api.command({ action, targetId: "country settings", reason: "Planned change", actorId, idempotencyKey: key, expectedRev: await api.revision(), sliceKey: COUNTRY_SETTINGS_KEY, value, before: "", after: "" });
  const refused = async (work: Promise<unknown>, status: number) => {
    await assert.rejects(work, (error) => error instanceof ApiError && error.status === status);
  };
  await refused(save("admin.pricing.saveCountry", withCountry("SE", { driverBonusLimit: 1001 }), "c-over"), 422);
  await refused(save("admin.pricing.saveCountry", withCountry("SE", { promoCap: 50 }), "c-role", "astrid"), 403);
  await save("admin.pricing.saveCountry", withCountry("SE", { promoCap: 50, paymentMethods: { cash: false, card: true, apple_pay: true, google_pay: true } }), "c-ok");
  const stored = normalizeCountrySettingsBook(await api.readSlice(COUNTRY_SETTINGS_KEY, null));
  assert.equal(stored.countries.SE.promoCap, 50);
  assert.equal(stored.countries.SE.paymentMethods.cash, true, "a Pricing save cannot change payment methods");
  assert.equal(stored.draftRev, 2);
});
