import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConfigHttp } from "./configDocs.ts";
import { createLiveSettings } from "./liveSettings.ts";
import { COUNTRY_SETTINGS_KEY, ZONE_RULES_KEY, emptyCountrySettingsBook } from "../config/countrySettings.ts";
import { DISPATCH_KEY, emptyDispatchBook } from "../dispatch/rules.ts";
import { SLICE_KEY as PRICING_KEY, emptyPricingStore } from "../pricing/zonePricing.ts";

/**
 * Owner G2c (2026-10-30, "Fix now"): live showed 404s on every page load. The closed country (TN) and its zones
 * are not asked for config, and a country's Standard (standard-XX) has no pricing history to ask for.
 */
test("live settings never ask the closed country TN or its zones, nor pricing history of standard-XX", async () => {
  const paths: string[] = [];
  const http: ConfigHttp = {
    json: async () => { throw new Error("replaced below"); },
    put: async <T,>() => ({ version: 1 }) as T,
    post: async <T,>() => ({ version: 1 }) as T,
  };
  // Every Standard has a published pricing draft, so history would be asked for it.
  http.json = async <T,>(path: string) => {
    paths.push(path);
    if (/^\/admin\/config\/pricing\?country=(SE|FR|TN)/.test(path)) return { version: 1, liveVersion: 1, document: {} } as T;
    throw Object.assign(new Error("not found"), { status: 404, reason: "config_not_found" });
  };
  const settings = createLiveSettings(http, () => "2026-10-30T10:00:00Z");
  await settings.readSlice(PRICING_KEY, emptyPricingStore());
  await settings.readSlice(DISPATCH_KEY, emptyDispatchBook());
  await settings.readSlice(COUNTRY_SETTINGS_KEY, emptyCountrySettingsBook());
  await settings.readSlice(ZONE_RULES_KEY, null);
  assert.ok(paths.some((path) => path.includes("country=SE")), "the open countries are still read");
  assert.deepEqual(paths.filter((path) => /country=TN|zoneId=TN-/.test(path)), [], "no call for TN");
  assert.deepEqual(paths.filter((path) => /history\?zoneId=standard-/.test(path)), [], "no pricing history for a Standard");
});
