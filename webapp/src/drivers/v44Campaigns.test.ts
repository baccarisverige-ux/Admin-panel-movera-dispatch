import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../api/httpClient.ts";
import { formatMoney } from "../domain/money.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { setLanguage } from "../i18n/core.ts";
import { liveClass } from "../live/liveCommands.ts";
import { countryRulesOf, type ConfigHttp, type Doc } from "../live/configDocs.ts";
import { createLiveSettings } from "../live/liveSettings.ts";
import { COUNTRY_SETTINGS_KEY, ZONE_RULES_KEY, countrySettingsIssues, countrySettingsLines, defaultCountrySettings, normalizeCountrySettingsBook, type CountrySettings, type CountrySettingsBook } from "../config/countrySettings.ts";
import {
  BONUS_CAMPAIGN_MAX, CAMPAIGN_COMMANDS, CAMPAIGN_LIMITS, campaignActions, campaignCheck, campaignCommandPath, campaignCreateBody, campaignDriversPath,
  campaignEditBody, campaignErrorText, campaignListPath, campaignMaxOf, campaignPath, campaignProgressText, lastEndDate, parseCampaign, parseCampaignPage,
  parseProgressPage, type CampaignZone,
} from "./campaigns.ts";

/**
 * BQ-V44 admin (owner G10-5 "Make bonuses real (Recommended)", Rules decisions/driver-g10.md:9; Q12 bonus zones,
 * decisions/admin-fake-by-group.md:40; plan Rules audits/impact/v44-driver-bonuses.md §7; money supervisor GO round 2).
 * Contract 0.18.103 (movera-contracts 45dfc7c, not yet tagged, so the copy in contracts/ is not synced): the values below
 * are the contract's, as literals, until the coordinator syncs the copy after the tag.
 * Drivers › Bonuses on live = the server's bonus campaigns (/admin/bonuses); the demo builder stays demo-only (Rule 21).
 */

type Fixture = { id: string; zone: { currency: string; timeZone: string; max: { amountMinor: number; currency: string }; polygon: [number, number][] }; today: string; input: { measure: string; target: number; amount: { amountMinor: number; currency: string }; startDate: string; endDate: string; polygon: [number, number][] }; expect: string };

/** contract fixtures/bonus_campaigns.json#validate at 45dfc7c (sha256 c5631e2e…), copied as is. */
const VALIDATE: Fixture[] = [
  {"id": "se_ok", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "ok"},
  {"id": "se_amount_at_max", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 200000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "ok"},
  {"id": "se_amount_above_max", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 200001, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "bonus_amount_above_max"},
  {"id": "se_amount_other_currency", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "EUR"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "bonus_amount_invalid"},
  {"id": "se_amount_zero", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 0, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "bonus_amount_invalid"},
  {"id": "se_target_zero", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 0, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "bonus_target_invalid"},
  {"id": "se_target_trips_above", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 501, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "bonus_target_invalid"},
  {"id": "se_target_not_whole", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 2.5, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "bonus_target_invalid"},
  {"id": "se_hours_200_ok", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "online_hours", "target": 200, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "ok"},
  {"id": "se_hours_above", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "online_hours", "target": 201, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "bonus_target_invalid"},
  {"id": "se_end_before_start", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-22", "endDate": "2026-11-16", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "bonus_dates_invalid"},
  {"id": "se_start_in_past", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-13", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "bonus_dates_invalid"},
  {"id": "se_start_today_one_day", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-14", "endDate": "2026-11-14", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "ok"},
  {"id": "se_92_days_ok", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2027-02-15", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "ok"},
  {"id": "se_93_days", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2027-02-16", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]]}, "expect": "bonus_dates_invalid"},
  {"id": "se_area_two_points", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09]]}, "expect": "bonus_area_invalid"},
  {"id": "se_area_closed", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05], [59.32, 18.05]]}, "expect": "bonus_area_invalid"},
  {"id": "fr_amount_at_max", "zone": {"currency": "EUR", "timeZone": "Europe/Paris", "max": {"amountMinor": 20000, "currency": "EUR"}, "polygon": [[48.7, 2.1], [48.7, 2.6], [49.0, 2.6], [49.0, 2.1]]}, "today": "2026-11-14", "input": {"measure": "online_hours", "target": 10, "amount": {"amountMinor": 20000, "currency": "EUR"}, "startDate": "2026-11-16", "endDate": "2026-11-30", "polygon": [[48.85, 2.33], [48.85, 2.37], [48.87, 2.37], [48.87, 2.33]]}, "expect": "ok"},
  {"id": "fr_amount_above_max", "zone": {"currency": "EUR", "timeZone": "Europe/Paris", "max": {"amountMinor": 20000, "currency": "EUR"}, "polygon": [[48.7, 2.1], [48.7, 2.6], [49.0, 2.6], [49.0, 2.1]]}, "today": "2026-11-14", "input": {"measure": "online_hours", "target": 10, "amount": {"amountMinor": 20001, "currency": "EUR"}, "startDate": "2026-11-16", "endDate": "2026-11-30", "polygon": [[48.85, 2.33], [48.85, 2.37], [48.87, 2.37], [48.87, 2.33]]}, "expect": "bonus_amount_above_max"},
  {"id": "tn_amount_at_max", "zone": {"currency": "TND", "timeZone": "Africa/Tunis", "max": {"amountMinor": 200000, "currency": "TND"}, "polygon": [[36.6, 9.9], [36.6, 10.4], [37.0, 10.4], [37.0, 9.9]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 20, "amount": {"amountMinor": 200000, "currency": "TND"}, "startDate": "2026-11-16", "endDate": "2026-11-30", "polygon": [[36.79, 10.16], [36.79, 10.2], [36.82, 10.2], [36.82, 10.16]]}, "expect": "ok"},
  {"id": "tn_amount_above_max", "zone": {"currency": "TND", "timeZone": "Africa/Tunis", "max": {"amountMinor": 200000, "currency": "TND"}, "polygon": [[36.6, 9.9], [36.6, 10.4], [37.0, 10.4], [37.0, 9.9]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 20, "amount": {"amountMinor": 200001, "currency": "TND"}, "startDate": "2026-11-16", "endDate": "2026-11-30", "polygon": [[36.79, 10.16], [36.79, 10.2], [36.82, 10.2], [36.82, 10.16]]}, "expect": "bonus_amount_above_max"},
  {"id": "se_area_outside_zone", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[48.85, 2.33], [48.85, 2.37], [48.87, 2.37], [48.87, 2.33]]}, "expect": "bonus_area_invalid"},
  {"id": "se_area_on_zone_edge", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.2, 18.0], [59.25, 18.05], [59.25, 17.95]]}, "expect": "ok"},
  {"id": "se_area_partly_outside_zone", "zone": {"currency": "SEK", "timeZone": "Europe/Stockholm", "max": {"amountMinor": 200000, "currency": "SEK"}, "polygon": [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]]}, "today": "2026-11-14", "input": {"measure": "trips", "target": 10, "amount": {"amountMinor": 15000, "currency": "SEK"}, "startDate": "2026-11-16", "endDate": "2026-11-22", "polygon": [[59.3, 18.2], [59.3, 18.4], [59.4, 18.2]]}, "expect": "bonus_area_invalid"},
]
const zoneOf = (x: Fixture): CampaignZone => ({ zoneId: "Z", currency: x.zone.currency as CampaignZone["currency"], timeZone: x.zone.timeZone, polygon: x.zone.polygon, max: x.zone.max as CampaignZone["max"] });

test("V44: every validation fixture of the contract gives the server's answer (area inside the zone, dates, max, target)", () => {
  assert.equal(VALIDATE.length, 24);
  for (const x of VALIDATE) assert.equal(campaignCheck(zoneOf(x), x.today, x.input as Parameters<typeof campaignCheck>[2]), x.expect, x.id);
  // MF6 by name: a Paris area in a Stockholm zone, one point outside, a point on the edge.
  const byId = new Map(VALIDATE.map((x) => [x.id, x]));
  for (const [id, want] of [["se_area_outside_zone", "bonus_area_invalid"], ["se_area_partly_outside_zone", "bonus_area_invalid"], ["se_area_on_zone_edge", "ok"], ["se_92_days_ok", "ok"], ["se_93_days", "bonus_dates_invalid"], ["se_start_in_past", "bonus_dates_invalid"], ["se_amount_above_max", "bonus_amount_above_max"], ["tn_amount_above_max", "bonus_amount_above_max"], ["fr_amount_at_max", "ok"]] as const) {
    const x = byId.get(id)!;
    assert.equal(campaignCheck(zoneOf(x), x.today, x.input as Parameters<typeof campaignCheck>[2]), want, id);
  }
});

test("V44: limits and the setting defaults are the contract's (D1, D2, D13: SE 2 000 kr, FR 200 €, TN 200 DT)", () => {
  assert.deepEqual(CAMPAIGN_LIMITS, { target: { trips: [1, 500], online_hours: [1, 200] }, maxDays: 92 });
  assert.deepEqual(BONUS_CAMPAIGN_MAX, { SE: { amountMinor: 200000, currency: "SEK" }, FR: { amountMinor: 20000, currency: "EUR" }, TN: { amountMinor: 200000, currency: "TND" } });
  assert.equal(formatMoney(BONUS_CAMPAIGN_MAX.SE), "2 000,00 kr");
  assert.equal(formatMoney(BONUS_CAMPAIGN_MAX.FR), "200,00 €");
  assert.equal(formatMoney(BONUS_CAMPAIGN_MAX.TN), "200.000 DT");
  assert.equal(lastEndDate("2026-11-16"), "2027-02-15", "92 days, both counted (fixture se_92_days_ok)");
  assert.equal(lastEndDate("2027-03-01"), "2027-05-31");
});

const SE_ZONE: CampaignZone = { zoneId: "Z001", currency: "SEK", timeZone: "Europe/Stockholm", polygon: [[59.2, 17.8], [59.2, 18.3], [59.5, 18.3], [59.5, 17.8]], max: { amountMinor: 200000, currency: "SEK" } };
const TN_ZONE: CampaignZone = { zoneId: "TN-TC", currency: "TND", timeZone: "Africa/Tunis", polygon: [[36.6, 9.9], [36.6, 10.4], [37.0, 10.4], [37.0, 9.9]], max: { amountMinor: 200000, currency: "TND" } };
const NAMES = { sv: "Helgrush", fr: "Rush du week-end", en: "Weekend rush" };
const form = (patch: Partial<Parameters<typeof campaignCreateBody>[0]> = {}) => ({ zoneId: "Z001", names: NAMES, measure: "trips" as const, target: "10", amount: "150,00", startDate: "2026-11-16", endDate: "2026-11-22", polygon: [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09], [59.34, 18.05]] as [number, number][], ...patch });

test("V44: the create body is BonusCampaignCreate, the amount in the zone currency's minor units (typed, never worked out)", () => {
  const made = campaignCreateBody(form(), SE_ZONE, "2026-11-14");
  assert.ok("body" in made, JSON.stringify(made));
  assert.deepEqual(Object.keys(made.body).sort(), ["amount", "endDate", "measure", "names", "polygon", "startDate", "target", "zoneId"]);
  assert.deepEqual(made.body.amount, { amountMinor: 15000, currency: "SEK" });
  assert.equal(made.body.target, 10);
  const tn = campaignCreateBody(form({ zoneId: "TN-TC", amount: "200", target: "20", polygon: [[36.79, 10.16], [36.79, 10.2], [36.82, 10.2], [36.82, 10.16]] }), TN_ZONE, "2026-11-14");
  assert.ok("body" in tn);
  assert.deepEqual(tn.body.amount, { amountMinor: 200000, currency: "TND" }, "200 DT = 200000 millimes (×1000)");
  const tn3 = campaignCreateBody(form({ zoneId: "TN-TC", amount: "12.345", target: "20", polygon: [[36.79, 10.16], [36.79, 10.2], [36.82, 10.2], [36.82, 10.16]] }), TN_ZONE, "2026-11-14");
  assert.ok("body" in tn3 && tn3.body.amount.amountMinor === 12345);
  // Too many decimals, 0, letters, above the setting: refused before sending, with the server's reason.
  assert.deepEqual(campaignCreateBody(form({ amount: "12,345" }), SE_ZONE, "2026-11-14"), { error: "bonus_amount_invalid" });
  assert.deepEqual(campaignCreateBody(form({ amount: "0" }), SE_ZONE, "2026-11-14"), { error: "bonus_amount_invalid" });
  assert.deepEqual(campaignCreateBody(form({ amount: "abc" }), SE_ZONE, "2026-11-14"), { error: "bonus_amount_invalid" });
  assert.deepEqual(campaignCreateBody(form({ amount: "2000,01" }), SE_ZONE, "2026-11-14"), { error: "bonus_amount_above_max" });
  assert.deepEqual(campaignCreateBody(form({ target: "2.5" }), SE_ZONE, "2026-11-14"), { error: "bonus_target_invalid" });
  assert.deepEqual(campaignCreateBody(form({ endDate: "2027-02-16" }), SE_ZONE, "2026-11-14"), { error: "bonus_dates_invalid" });
  assert.deepEqual(campaignCreateBody(form({ polygon: [[48.85, 2.33], [48.85, 2.37], [48.87, 2.37], [48.87, 2.33]] }), SE_ZONE, "2026-11-14"), { error: "bonus_area_invalid" });
  assert.deepEqual(campaignCreateBody(form({ names: { ...NAMES, fr: " " } }), SE_ZONE, "2026-11-14"), { error: "bonus_names_invalid" });
  assert.deepEqual(campaignCreateBody(form({ names: { ...NAMES, en: "x".repeat(81) } }), SE_ZONE, "2026-11-14"), { error: "bonus_names_invalid" });
});

const SERVER = {
  bonusId: "bon_1", zoneId: "Z001", country: "SE", currency: "SEK", timeZone: "Europe/Stockholm", names: NAMES, measure: "online_hours", target: 10,
  amount: { amountMinor: 15000, currency: "SEK" }, startDate: "2026-11-16", endDate: "2026-11-22", polygon: [[59.32, 18.05], [59.32, 18.09], [59.34, 18.09]],
  bounds: { south: 59.32, west: 18.05, north: 59.34, east: 18.09 }, status: "active", state: "active", version: 3, createdAt: "2026-11-14T08:00:00Z", createdBy: "adm_1",
  updatedAt: "2026-11-14T08:00:00Z", driversWithProgress: 12, driversEarned: 2,
  // On purpose not amount × driversEarned: the panel shows the server's paidTotal and never works it out.
  paidTotal: { amountMinor: 29999, currency: "SEK" },
};

test("V44: a campaign, a page and the drivers' progress are read as the server sends them (money from the server only)", () => {
  const c = parseCampaign(SERVER)!;
  assert.equal(c.paidTotal.amountMinor, 29999);
  assert.equal(formatMoney(c.paidTotal), "299,99 kr");
  assert.equal(parseCampaign({ ...SERVER, amount: { amountMinor: 1.5, currency: "SEK" } }), null, "no float money");
  assert.equal(parseCampaign({ ...SERVER, state: "running" }), null);
  assert.equal(parseCampaign({ ...SERVER, measure: "steps" }), null, "a demo reward type is never a live campaign");
  const page = parseCampaignPage({ items: [SERVER, { nope: 1 }], nextCursor: "c2" });
  assert.deepEqual([page.items.length, page.nextCursor], [1, "c2"]);
  const drivers = parseProgressPage({ items: [{ driverId: "drv_1", firstName: "Ali", progress: { done: 260, target: 600 }, earned: false }, { driverId: "drv_2", firstName: "Sara", progress: { done: 600, target: 600 }, earned: true, earnedAt: "2026-11-18T10:00:00Z", entryId: "ent_9" }], nextCursor: null });
  assert.equal(drivers.items.length, 2);
  assert.equal(drivers.items[1]!.entryId, "ent_9");
  const source = readFileSync(new URL("./campaigns.ts", import.meta.url), "utf8") + readFileSync(new URL("../live/LiveBonusCampaigns.tsx", import.meta.url), "utf8");
  assert.ok(!/amountMinor\s*\*|\*\s*[a-zA-Z.]*driversEarned|driversEarned\s*\*/.test(source), "no money is multiplied in the panel");
});

test("V44: paths and buttons follow the contract (pause needs active, resume paused, end active or paused; never deleted)", () => {
  assert.equal(campaignListPath({ zoneId: "Z001", state: "active", cursor: null }), "/admin/bonuses?zoneId=Z001&state=active&limit=50");
  assert.equal(campaignListPath({ cursor: "abc" }), "/admin/bonuses?cursor=abc&limit=50");
  assert.equal(campaignPath("bon 1"), "/admin/bonuses/bon%201");
  assert.equal(campaignCommandPath("bon_1", "pause"), "/admin/bonuses/bon_1/pause");
  assert.equal(campaignCommandPath("bon_1", "end"), "/admin/bonuses/bon_1/end");
  assert.equal(campaignDriversPath("bon_1", "c2"), "/admin/bonuses/bon_1/drivers?cursor=c2&limit=50");
  const c = parseCampaign(SERVER)!;
  assert.deepEqual(campaignActions(c), ["pause", "end", "edit"]);
  assert.deepEqual(campaignActions({ ...c, status: "paused", state: "paused" }), ["resume", "end", "edit"]);
  assert.deepEqual(campaignActions({ ...c, state: "scheduled" }), ["pause", "end", "edit"]);
  assert.deepEqual(campaignActions({ ...c, status: "ended", state: "ended" }), []);
  assert.deepEqual(campaignActions({ ...c, status: "active", state: "ended" }), [], "the window is over: ended");
  for (const id of Object.values(CAMPAIGN_COMMANDS)) assert.equal(liveClass(id), "screen", `${id} is shown on live (its screen sends its own request)`);
});

test("V44: Edit sends only expectedVersion, names and a LATER end date within 92 days (D8)", () => {
  const c = parseCampaign(SERVER)!;
  assert.deepEqual(campaignEditBody(c, { names: { ...NAMES, en: "Rush" }, endDate: "2026-11-30" }), { body: { expectedVersion: 3, names: { ...NAMES, en: "Rush" }, endDate: "2026-11-30" } });
  assert.deepEqual(campaignEditBody(c, { names: NAMES, endDate: "2026-11-22" }), { body: { expectedVersion: 3 } }, "nothing changed: nothing but the version");
  assert.deepEqual(campaignEditBody(c, { names: NAMES, endDate: "2026-11-21" }), { error: "bonus_dates_invalid" }, "an earlier end date");
  assert.deepEqual(campaignEditBody(c, { names: NAMES, endDate: "2027-02-16" }), { error: "bonus_dates_invalid" }, "93 days");
  assert.deepEqual(campaignEditBody(c, { names: { ...NAMES, sv: "" }, endDate: "2026-11-22" }), { error: "bonus_names_invalid" });
});

test("V44: progress is the server's numbers; minutes are written as hours and minutes (contract progressFormat)", async () => {
  assert.equal(campaignProgressText("trips", { done: 3, target: 10 }), "3 of 10 trips");
  assert.equal(campaignProgressText("online_hours", { done: 260, target: 600 }), "4 h 20 min of 10 h online");
  assert.equal(campaignProgressText("online_hours", { done: 45, target: 60 }), "0 h 45 min of 1 h online");
  await registerAll();
  try {
    setLanguage("sv");
    assert.equal(campaignProgressText("trips", { done: 3, target: 10 }), "3 av 10 resor");
    assert.equal(campaignProgressText("online_hours", { done: 260, target: 600 }), "4 h 20 min av 10 h online");
    setLanguage("fr");
    assert.equal(campaignProgressText("trips", { done: 3, target: 10 }), "3 sur 10 courses");
    assert.equal(campaignProgressText("online_hours", { done: 600, target: 600 }), "10 h sur 10 h en ligne");
  } finally {
    setLanguage("en");
  }
});

function registerAll() {
  // The dictionaries are loaded on first use in the browser; the test hands them over directly.
  return import("../i18n/core.ts").then(({ registerDictionary }) => { registerDictionary("sv", sv); registerDictionary("fr", fr); });
}

const REASONS = ["bonus_target_invalid", "bonus_amount_invalid", "bonus_amount_above_max", "bonus_dates_invalid", "bonus_area_invalid", "bonus_field_fixed", "bonus_ended", "invalid_transition", "bonus_names_invalid"] as const;

test("V44: every server reason has its own text in sv, fr and en", async () => {
  await registerAll();
  const texts = new Set<string>();
  for (const reason of REASONS) {
    const error = new ApiError(reason === "bonus_ended" || reason === "invalid_transition" ? 409 : 400, "x", { code: reason === "bonus_ended" || reason === "invalid_transition" ? "conflict" : "invalid_request", reason });
    const text = campaignErrorText(error);
    assert.ok(text && text !== "x" && !texts.has(text), reason);
    texts.add(text);
    for (const [lang, dictionary] of [["sv", sv], ["fr", fr]] as const) {
      setLanguage(lang);
      try {
        assert.notEqual(campaignErrorText(error), text, `${lang}: ${reason}`);
        assert.ok((dictionary as Record<string, string>)[text], `${lang} has ${text}`);
      } finally {
        setLanguage("en");
      }
    }
  }
  assert.equal(campaignErrorText(new ApiError(403, "x", { code: "forbidden", reason: "zone_out_of_scope" })), "This is outside your zones.");
});

test("V44 setting: CountryRules.bonusCampaignMax per country standard or zone, in the currency's minor units", () => {
  for (const [country, major] of [["SE", 2000], ["FR", 200], ["TN", 200]] as const) assert.equal(defaultCountrySettings(country).bonusCampaignMax, major, country);
  assert.deepEqual(countryRulesOf("SE", "SEK", { tips: [10], raiseSteps: [20], driverBonus: { defaultLimit: 150, hardMax: 1000 }, bonusCampaignMax: 2000 }, null)["bonusCampaignMax"], { amountMinor: 200000, currency: "SEK" });
  assert.deepEqual(countryRulesOf("FR", "EUR", { tips: [1], raiseSteps: [2], driverBonus: { defaultLimit: 20, hardMax: 95 }, bonusCampaignMax: 200 }, null)["bonusCampaignMax"], { amountMinor: 20000, currency: "EUR" });
  assert.deepEqual(countryRulesOf("TN", "TND", { tips: [1], raiseSteps: [2], driverBonus: { defaultLimit: 20, hardMax: 95 }, bonusCampaignMax: 200 }, null)["bonusCampaignMax"], { amountMinor: 200000, currency: "TND" });
  assert.equal(normalizeCountrySettingsBook({ countries: { SE: { bonusCampaignMax: 1500 } } }).countries.SE.bonusCampaignMax, 1500);
  assert.equal(normalizeCountrySettingsBook({ countries: { SE: { bonusCampaignMax: 0 } } }).countries.SE.bonusCampaignMax, 2000, "0 or missing = the default");
  const se = defaultCountrySettings("SE");
  assert.ok(countrySettingsIssues("SE", { ...se, bonusCampaignMax: -1 }).some((line) => line.includes("Largest campaign bonus")));
  assert.ok(countrySettingsIssues("SE", { ...se, bonusCampaignMax: 10.555 }).some((line) => line.includes("Largest campaign bonus")));
  assert.ok(countrySettingsIssues("TN", { ...defaultCountrySettings("TN"), bonusCampaignMax: 10.555 }).every((line) => !line.includes("Largest campaign bonus")), "DT has 3 decimals");
  assert.deepEqual(countrySettingsIssues("SE", se), []);
  assert.ok(countrySettingsLines("SE", se, { ...se, bonusCampaignMax: 1500 }).includes("Largest campaign bonus: 2000 → 1500 kr"));
  assert.deepEqual(campaignMaxOf({ bonusCampaignMax: { amountMinor: 150000, currency: "SEK" } }, "SE"), { amountMinor: 150000, currency: "SEK" });
  assert.deepEqual(campaignMaxOf({ bonusCampaignMax: { amountMinor: 150000, currency: "EUR" } }, "SE"), BONUS_CAMPAIGN_MAX.SE, "another currency is not this country's limit");
  assert.deepEqual(campaignMaxOf(null, "TN"), BONUS_CAMPAIGN_MAX.TN);
  const panel = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
  assert.ok(panel.includes('label={tr("Largest campaign bonus")}') && panel.includes("bonusCampaignMax"));
});

function fakeServer(drafts: Record<string, Doc & { version: number; liveVersion: number; usesStandard?: boolean; document: Doc }>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const keyOf = (path: string) => {
    const url = new URL(`http://x${path}`);
    return `${url.pathname.split("/")[3]!}:${url.searchParams.get("zoneId") ?? `standard-${url.searchParams.get("country")}`}`;
  };
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      calls.push({ method: "GET", path });
      const found = drafts[keyOf(path)];
      if (!found) throw Object.assign(new Error("not found"), { status: 404 });
      return structuredClone(found) as T;
    },
    put: async <T,>(path: string, body: unknown) => { calls.push({ method: "PUT", path, body }); return ({ version: ((body as { expectedVersion: number }).expectedVersion) + 1 }) as T; },
    post: async <T,>(path: string, body: unknown) => { calls.push({ method: "POST", path, body }); return ({ version: 7 }) as T; },
  };
  return { http, calls };
}

test("V44 setting live: read back from the zone's country_rules and saved into that zone's document (settings.publish)", async () => {
  const rules = (max?: number) => countryRulesOf("SE", "SEK", { tips: [10], raiseSteps: [20], driverBonus: { defaultLimit: 150, hardMax: 1000 }, ...(max === undefined ? {} : { bonusCampaignMax: max }) }, null);
  const { http, calls } = fakeServer({
    "country_rules:standard-SE": { version: 2, liveVersion: 1, usesStandard: false, document: rules(1800) },
    "country_rules:Z002": { version: 1, liveVersion: 1, usesStandard: false, document: rules() },
    "country_rules:Z001": { version: 1, liveVersion: 1, usesStandard: false, document: rules(1500) },
  });
  const settings = createLiveSettings(http, () => "2026-11-15T10:00:00Z");
  const countries = (await settings.readSlice(COUNTRY_SETTINGS_KEY, { draftRev: 0, countries: {} })) as CountrySettingsBook;
  const zones = (await settings.readSlice(ZONE_RULES_KEY, {})) as Record<string, CountrySettings>;
  assert.equal(zones["Z001"]!.bonusCampaignMax, 1500);
  assert.equal(countries.countries.SE.bonusCampaignMax, 1800, "the country standard's own value");
  assert.equal(zones["Z002"]!.bonusCampaignMax, 1800, "a zone without its own shows its country standard's (contract limits.amount)");
  const value = { ...countries, draftRev: 1, zones: { ...zones, Z001: { ...zones["Z001"]!, bonusCampaignMax: 1200 } } };
  assert.equal(await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value, scope: "Z001" }), "Saved for the chosen zones.");
  const put = calls.find((c) => c.method === "PUT" && c.path.includes("country_rules"));
  assert.deepEqual((put!.body as { document: Doc }).document["bonusCampaignMax"], { amountMinor: 120000, currency: "SEK" });
});

test("V44 live: Drivers › Bonuses shows the server's campaigns; the demo builder stays demo-only (Rule 21)", () => {
  const page = readFileSync(new URL("../pages/DriversPage.tsx", import.meta.url), "utf8");
  assert.ok(!page.includes('useCommandHidden("admin.drivers.bonusCreate")'), "the old guard hid the tab on live");
  assert.match(page, /lazy\(\(\) => import\("\.\.\/live\/LiveBonusCampaigns"\)/, "the live screen is lazy-loaded");
  assert.match(page, /live \? <Suspense[^]*<LiveBonusCampaigns[^]*: <BonusesView/, "live: the campaigns; demo: the builder");
  const live = readFileSync(new URL("../live/LiveBonusCampaigns.tsx", import.meta.url), "utf8");
  for (const demo of ["bonusDemo", "BonusBuilder", "BonusesView", "useSlice", "PEAK80", "multiplier", "guarantee"]) assert.ok(!live.includes(demo), `live screen has no ${demo}`);
  for (const command of Object.values(CAMPAIGN_COMMANDS)) assert.ok(live.includes(`data-command="${command}"`), command);
  assert.ok(live.includes('can("drivers.bonuses")'), "writes need drivers.bonuses");
  // The demo builder files are kept (Rule 21: nothing deleted).
  for (const file of ["../drivers/BonusBuilder.tsx", "../drivers/bonusDemo.ts", "../drivers/BonusesView.tsx", "../drivers/bonus.ts"]) assert.ok(readFileSync(new URL(file, import.meta.url), "utf8").length > 0, file);
});

/** contract.json#bonusCampaigns.texts (0.18.103) as literals, {done}/{target} → {0}/{1}; the admin uses the same words. */
const CONTRACT_TEXTS: Array<[string, string, string]> = [
  ["{0} of {1} trips", "{0} av {1} resor", "{0} sur {1} courses"],
  ["{0} of {1} online", "{0} av {1} online", "{0} sur {1} en ligne"],
  ["{0} h {1} min", "{0} h {1} min", "{0} h {1} min"],
  ["Campaign ended", "Avslutad", "Terminée"],
];

test("V44: the new texts are in sv, fr and en; the shared ones are the contract's words", () => {
  for (const [key, svText, frText] of CONTRACT_TEXTS) {
    assert.equal((en as Record<string, string>)[key], key);
    assert.equal((sv as Record<string, string>)[key], svText, `sv ${key}`);
    assert.equal((fr as Record<string, string>)[key], frText, `fr ${key}`);
  }
  for (const key of ["Largest campaign bonus", "New campaign", "Bonus campaigns in {0}", "Pause campaign", "Resume campaign", "End campaign", "Drivers' progress", "Paid so far"]) {
    for (const [lang, dictionary] of [["en", en], ["sv", sv], ["fr", fr]] as const) {
      assert.ok((dictionary as Record<string, string>)[key], `${lang}: ${key}`);
      if (lang !== "en") assert.notEqual((dictionary as Record<string, string>)[key], key, `${lang}: ${key}`);
    }
  }
});
