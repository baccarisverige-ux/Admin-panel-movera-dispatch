import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contractJson } from "../contract/load.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { countryRulesOf, type ConfigHttp, type Doc } from "../live/configDocs.ts";
import { createLiveSettings } from "../live/liveSettings.ts";
import { appConfigState, riderAppConfig } from "./appConfigs.ts";
import { COUNTRY_SETTINGS_KEY, TIP_CASH_IN_CAR_MINUTES, ZONE_RULES_KEY, countrySettingsLines, defaultCountrySettings, emptyCountrySettingsBook, normalizeCountrySettingsBook, type CountrySettings, type CountrySettingsBook } from "./countrySettings.ts";

/**
 * Job C8 (owner "Anything admin can adjust becomes an admin setting", Rules audits/answered-vs-built-2026-11-14-C-conversation.md:63;
 * contract v0.18.91 finish.tips.cashInCarAdmin): the cash-tip time in the car (RiderAppConfig.tipRules.cashInCarMinutes) is set
 * in Pricing › Tips & limits per zone or the country standard, 0–60, default 5 — no longer a fixed 5.
 * Job A7 (contract v0.18.91 finish.refund.driverNotice): the trip page says the driver is told the amount and the reason.
 */
const C = contractJson<{ configDefaults: { tipRules: { cashInCarMinutes: number } }; finish: { tips: { settings_ranges: { cashInCarMinutes: [number, number] } } } }>("contract.json");

test("C8: default 5 and range 0–60 are the contract's", () => {
assert.equal(TIP_CASH_IN_CAR_MINUTES.default, C.configDefaults.tipRules.cashInCarMinutes);
assert.deepEqual([TIP_CASH_IN_CAR_MINUTES.min, TIP_CASH_IN_CAR_MINUTES.max], C.finish.tips.settings_ranges.cashInCarMinutes);
  for (const country of ["SE", "FR", "TN"] as const) assert.equal(defaultCountrySettings(country).tipRules.cashInCarMinutes, 5, country);
});

test("C8: a saved time is kept; out of range or not a whole number = the default", () => {
  const stored = (cashInCarMinutes: unknown) => normalizeCountrySettingsBook({ countries: { SE: { tipRules: { cashAfterTrip: false, customAmount: false, customMax: 200, cashInCarMinutes } } } }).countries.SE.tipRules.cashInCarMinutes;
  assert.equal(stored(12), 12);
  assert.equal(stored(0), 0);
  assert.equal(stored(60), 60);
  for (const bad of [61, -1, 2.5, "10", null, undefined]) assert.equal(stored(bad), 5, String(bad));
});

test("C8: the rider document carries the country's time, not a fixed 5", () => {
  const book = emptyCountrySettingsBook();
  const withMinutes = (country: "SE" | "FR", cashInCarMinutes: number) => ({ ...book.countries[country], tipRules: { ...book.countries[country].tipRules, cashInCarMinutes } });
  const countrySettings = { ...book, countries: { ...book.countries, SE: withMinutes("SE", 7), FR: withMinutes("FR", 15) } };
  const state = appConfigState({ now: "2026-11-14T08:00:00Z", countrySettings });
  assert.equal(riderAppConfig("Z001", state).tipRules.cashInCarMinutes, 7);
  assert.equal(riderAppConfig("FR-PC", state).tipRules.cashInCarMinutes, 15);
  assert.equal(riderAppConfig("TN-TC", state).tipRules.cashInCarMinutes, 5);
});

test("C8: the change list names the new time", () => {
  const before = defaultCountrySettings("SE");
  const after = { ...before, tipRules: { ...before.tipRules, cashInCarMinutes: 10 } };
  const lines = countrySettingsLines("SE", before, after);
  assert.ok(lines.includes("Cash tip time in the car: 10 min"), lines.join(" | "));
});

type Call = { method: string; path: string; body?: unknown };
function recording(drafts: Record<string, Doc & { version: number; liveVersion: number; usesStandard?: boolean; document: Doc }>) {
  const calls: Call[] = [];
  const inner = fakeServer(drafts);
  const http: ConfigHttp = {
    json: async <T,>(path: string) => { calls.push({ method: "GET", path }); return inner.json<T>(path); },
    put: async <T,>(path: string, body: unknown) => { calls.push({ method: "PUT", path, body }); return inner.put<T>(path, body); },
    post: async <T,>(path: string, body: unknown) => { calls.push({ method: "POST", path, body }); return inner.post<T>(path, body); },
  };
  return { http, calls };
}

function fakeServer(drafts: Record<string, Doc & { version: number; liveVersion: number; usesStandard?: boolean; document: Doc }>) {
  const keyOf = (path: string) => {
    const url = new URL(`http://x${path}`);
    return `${url.pathname.split("/")[3]!}:${url.searchParams.get("zoneId") ?? `standard-${url.searchParams.get("country")}`}`;
  };
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      const found = drafts[keyOf(path)];
      if (!found) throw Object.assign(new Error("not found"), { status: 404 });
      return structuredClone(found) as T;
    },
    put: async <T,>(_path: string, body: unknown) => ({ version: ((body as { expectedVersion: number }).expectedVersion) + 1 }) as T,
    post: async <T,>() => ({ version: 7 }) as T,
  };
  return http;
}

test("C8 live: the time reads back from what the zone serves", async () => {
  const sample = JSON.parse(readFileSync(new URL("../../../contracts/fixtures/config/rider_app_config.json", import.meta.url), "utf8")) as Doc;
  const rider = (zoneId: string | undefined, minutes?: number) => ({ ...sample, ...(zoneId ? { zoneId } : {}), paymentMethods: ["cash"], tipRules: { cashAfterTrip: false, customAmount: false, customMax: { amountMinor: 2000, currency: "EUR" }, ...(minutes === undefined ? {} : { cashInCarMinutes: minutes }) } });
  const http = fakeServer({
    "country_rules:standard-FR": { version: 2, liveVersion: 2, document: {} },
    "country_rules:FR-PC": { version: 1, liveVersion: 1, usesStandard: false, document: {} },
    "rider_app_config:standard-FR": { version: 3, liveVersion: 3, document: rider(undefined) },
    "rider_app_config:FR-PC": { version: 4, liveVersion: 4, usesStandard: false, document: rider("FR-PC", 15) },
  });
  const settings = createLiveSettings(http);
  await settings.readSlice(COUNTRY_SETTINGS_KEY, null);
  const zones = (await settings.readSlice(ZONE_RULES_KEY, null)) as Record<string, { tipRules: { cashInCarMinutes: number } }>;
  assert.equal(zones["FR-PC"]!.tipRules.cashInCarMinutes, 15);
  assert.equal(zones["standard-FR"]!.tipRules.cashInCarMinutes, 5, "a document without it = the default");
});

test("C8 live: a zone save writes the zone's time into that zone's rider document only", async () => {
  const rules = (tip: number) => countryRulesOf("SE", "SEK", { tips: [tip], raiseSteps: [20], driverBonus: { defaultLimit: 150, hardMax: 1000 } }, null);
  const { http, calls } = recording({
    "country_rules:standard-SE": { version: 2, liveVersion: 1, usesStandard: false, document: rules(10) },
    "country_rules:Z001": { version: 1, liveVersion: 0, usesStandard: false, document: rules(10) },
  });
  const settings = createLiveSettings(http, () => "2026-11-14T10:00:00Z");
  const countries = (await settings.readSlice(COUNTRY_SETTINGS_KEY, { draftRev: 0, countries: {} })) as CountrySettingsBook;
  const zones = (await settings.readSlice(ZONE_RULES_KEY, {})) as Record<string, CountrySettings>;
  const shown = { ...zones["Z001"]!, tipRules: { ...zones["Z001"]!.tipRules, cashInCarMinutes: 12 } };
  const value = { ...countries, draftRev: 1, zones: { ...zones, Z001: shown } };
  assert.equal(await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value, scope: "Z001" }), "Saved for the chosen zones.");
  const riderPuts = calls.filter((c) => c.method === "PUT" && c.path.includes("rider_app_config"));
  assert.deepEqual(riderPuts.map((c) => (c.body as { zoneId?: string }).zoneId), ["Z001"]);
  assert.equal(((riderPuts[0]!.body as { document: { tipRules: { cashInCarMinutes: number } } }).document).tipRules.cashInCarMinutes, 12);
});

const NEW_TEXTS = [
  "Cash tip time in the car",
  "Cash tip time in the car: {0} min",
  "Off: a cash tip is only possible in the car, in the first {0} minutes after the trip.",
  "The driver gets a notice with the amount taken from his pay and this reason.",
];

test("C8 + A7: the panel has the field (no fixed 5), the trip page tells the admin the driver sees the reason", () => {
  const panel = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
  assert.ok(panel.includes('data-testid="tip-cashInCarMinutes"'));
  assert.ok(!panel.includes("in the first 5 minutes after the trip"));
  const configs = readFileSync(new URL("./appConfigs.ts", import.meta.url), "utf8");
  assert.ok(!configs.includes("cashInCarMinutes: 5"));
  const money = readFileSync(new URL("../live/LiveTripMoney.tsx", import.meta.url), "utf8");
  assert.ok(money.includes("The driver gets a notice with the amount taken from his pay and this reason."));
});

for (const [lang, dictionary] of Object.entries({ en, sv, fr }) as Array<[string, Record<string, string>]>) {
  test(`${lang}: the new texts are translated`, () => {
    for (const key of NEW_TEXTS) {
      assert.ok(dictionary[key], `${lang}: ${key}`);
      if (lang !== "en") assert.notEqual(dictionary[key], key, `${lang}: ${key}`);
    }
  });
}
