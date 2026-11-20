import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completeCountrySettings, countrySettingsIssues, countrySettingsLines, defaultCountrySettings, PRICING_FIELDS } from "./countrySettings.ts";
import { COUNTRY_RULES_STANDARD_ONLY_KEPT, countryRulesOf } from "../live/configDocs.ts";
import { errorText } from "../live/format.ts";
import { ApiError } from "../api/httpClient.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

/**
 * Contract v0.18.139 driverPayRequest (owner 2026-11-20 "ask driver monthly to pay how much due to Movera ... link to
 * pay", "Link sumup for exp"; TEMPORARY): the admin part. Pricing › Tips & limits gets "Monthly pay request" on the
 * country standard only: a switch (OFF by default), the day of the month (1-28), the payment link (https) and the
 * smallest amount to ask for. The document sent is what the server checks (400 pay_request_needs_link /
 * pay_request_needs_amount / pay_request_invalid). The payment itself is confirmed with the existing "Driver paid
 * Movera". sv / fr / en. Fails on main: no field, no check, no texts.
 */
// Loaded lazily so this file runs (and fails per case) on a base without the setting.
const settingsModule: Record<string, unknown> = await import("./countrySettings.ts");
const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
type Ask = { enabled: boolean; dayOfMonth: number; payLink: string; minAmount: number | null };
const askOf = (value: unknown) => (value as { driverPayRequest?: Ask }).driverPayRequest;
const LINK = "https://pay.sumup.com/b2c/MOVERA1";
const withAsk = (country: "SE" | "FR" | "TN", ask: Partial<Ask>) => ({ ...defaultCountrySettings(country), driverPayRequest: { enabled: false, dayOfMonth: 1, payLink: "", minAmount: null, ...ask } }) as never;
const input = (settings: ReturnType<typeof defaultCountrySettings>, extra: Record<string, unknown> = {}) => ({
  tips: settings.tips.filter((t) => t.enabled).map((t) => t.amount), raiseSteps: settings.raiseSteps.filter((r) => r.enabled).map((r) => r.amount),
  driverBonus: { defaultLimit: settings.driverBonusLimit, hardMax: settings.driverBonusLimit * 2 }, ...extra,
});

registerDictionary("sv", sv);
registerDictionary("fr", fr);

test("pay request: the default is the contract's (off, day 1, no link, no amount) in every country, and Pricing saves it", () => {
  assert.deepEqual(C.configDefaults.driverPayRequest, { enabled: false, dayOfMonth: 1, payLink: "", minAmount: null });
  for (const country of ["SE", "FR", "TN"] as const) assert.deepEqual(askOf(defaultCountrySettings(country)), C.configDefaults.driverPayRequest, country);
  assert.ok((PRICING_FIELDS as readonly string[]).includes("driverPayRequest"), "Pricing saves it");
  assert.deepEqual(countrySettingsIssues("SE", defaultCountrySettings("SE")), [], "the default has no issue");
});

test("pay request: ON needs the https link and the smallest amount; a wrong day or link is refused before Save", () => {
  assert.deepEqual(countrySettingsIssues("SE", withAsk("SE", { enabled: true, payLink: LINK, minAmount: 0 })), [], "on with link and 0");
  assert.deepEqual(countrySettingsIssues("SE", withAsk("SE", { enabled: true, dayOfMonth: 28, payLink: LINK, minAmount: 100 })), []);
  assert.deepEqual(countrySettingsIssues("SE", withAsk("SE", { enabled: false, payLink: LINK, minAmount: null })), [], "off may keep a link and have no amount");
  const one = (ask: Partial<Ask>, why: string) => assert.equal(countrySettingsIssues("SE", withAsk("SE", ask)).length, 1, why);
  one({ enabled: true, payLink: "", minAmount: 0 }, "on without a link");
  one({ enabled: true, payLink: LINK, minAmount: null }, "on without an amount");
  one({ enabled: false, payLink: "http://pay.sumup.com/x" }, "http is refused");
  one({ enabled: false, payLink: "javascript:alert(1)" }, "not a web link");
  one({ enabled: false, payLink: "https://pay.sumup.com/a b" }, "a space in the link");
  one({ enabled: false, payLink: `https://pay.sumup.com/${"x".repeat(500)}` }, "too long");
  one({ enabled: false, dayOfMonth: 0 }, "day 0");
  one({ enabled: false, dayOfMonth: 29 }, "day 29");
  one({ enabled: false, dayOfMonth: 1.5 }, "day 1.5");
  one({ enabled: false, minAmount: -1 }, "below 0");
  one({ enabled: false, minAmount: 10.555 }, "too many decimals (kr)");
  assert.deepEqual(countrySettingsIssues("TN", withAsk("TN", { enabled: true, payLink: LINK, minAmount: 10.555 })), [], "TND has 3 decimals");
});

test("pay request: the document the Standard's save sends (minor units, the link as typed); a zone's save never carries it", () => {
  const se = defaultCountrySettings("SE");
  const standard = countryRulesOf("SE", "SEK", input(se, { driverPayRequest: { enabled: true, dayOfMonth: 5, payLink: ` ${LINK} `, minAmount: 100 } }) as never, null, { standard: true }) as Record<string, unknown>;
  assert.deepEqual(standard["driverPayRequest"], { enabled: true, dayOfMonth: 5, payLink: LINK, minAmount: { amountMinor: 10000, currency: "SEK" } });
  const zero = countryRulesOf("SE", "SEK", input(se, { driverPayRequest: { enabled: true, dayOfMonth: 1, payLink: LINK, minAmount: 0 } }) as never, null, { standard: true }) as Record<string, unknown>;
  assert.deepEqual((zero["driverPayRequest"] as { minAmount: unknown }).minAmount, { amountMinor: 0, currency: "SEK" }, "0 is a real minimum");
  const tn = countryRulesOf("TN", "TND", input(defaultCountrySettings("TN"), { driverPayRequest: { enabled: false, dayOfMonth: 1, payLink: "", minAmount: 12.5 } }) as never, null, { standard: true }) as Record<string, unknown>;
  assert.deepEqual(tn["driverPayRequest"], { enabled: false, dayOfMonth: 1, payLink: "", minAmount: { amountMinor: 12500, currency: "TND" } }, "TND 3 decimals");
  const off = countryRulesOf("SE", "SEK", input(se, { driverPayRequest: { enabled: false, dayOfMonth: 1, payLink: "", minAmount: null } }) as never, null, { standard: true }) as Record<string, unknown>;
  assert.deepEqual(off["driverPayRequest"], { enabled: false, dayOfMonth: 1, payLink: "", minAmount: null });
  // A zone's document: the panel does not send it, and a base copied from the Standard does not leak it into the zone.
  const base = { country: "SE", currency: "SEK", driverPayRequest: { enabled: true, dayOfMonth: 5, payLink: LINK, minAmount: { amountMinor: 1, currency: "SEK" } } };
  const zone = countryRulesOf("SE", "SEK", input(se) as never, base, { standard: false }) as Record<string, unknown>;
  assert.equal("driverPayRequest" in zone, false, "never on a zone");
  // The Standard's save from another screen (no input for it) keeps the stored value.
  assert.ok((COUNTRY_RULES_STANDARD_ONLY_KEPT as readonly string[]).includes("driverPayRequest"));
  const kept = countryRulesOf("SE", "SEK", input(se) as never, base, { standard: true }) as Record<string, unknown>;
  assert.deepEqual(kept["driverPayRequest"], base.driverPayRequest, "kept on the Standard");
});

test("pay request: read back from the Standard's document in local money; a stored book survives a reload", () => {
  const read = settingsModule["payRequestOfRules"] as (document: unknown, country: string) => { driverPayRequest?: Ask };
  assert.equal(typeof read, "function");
  assert.deepEqual(read({ driverPayRequest: { enabled: true, dayOfMonth: 5, payLink: LINK, minAmount: { amountMinor: 10000, currency: "SEK" } } }, "SE"), { driverPayRequest: { enabled: true, dayOfMonth: 5, payLink: LINK, minAmount: 100 } });
  assert.deepEqual(read({ driverPayRequest: { enabled: true, dayOfMonth: 1, payLink: LINK, minAmount: { amountMinor: 12500, currency: "TND" } } }, "TN").driverPayRequest?.minAmount, 12.5);
  assert.deepEqual(read({ driverPayRequest: { enabled: true, dayOfMonth: 1, payLink: LINK, minAmount: { amountMinor: 500, currency: "EUR" } } }, "SE").driverPayRequest?.minAmount, null, "another currency reads as none");
  assert.deepEqual(read({}, "SE"), {}, "missing = the default (off)");
  assert.deepEqual(read({ driverPayRequest: "on" }, "SE"), {});
  const stored = completeCountrySettings("SE", { driverPayRequest: { enabled: true, dayOfMonth: 7, payLink: LINK, minAmount: 50 } } as never);
  assert.deepEqual(askOf(stored), { enabled: true, dayOfMonth: 7, payLink: LINK, minAmount: 50 });
  assert.deepEqual(askOf(completeCountrySettings("SE", { driverPayRequest: "x" } as never)), { enabled: false, dayOfMonth: 1, payLink: "", minAmount: null });
});

test("pay request: the confirm list names each change, with the whole link (it is where the money goes)", () => {
  setLanguage("en");
  const before = defaultCountrySettings("SE");
  const after = withAsk("SE", { enabled: true, dayOfMonth: 5, payLink: LINK, minAmount: 100 });
  assert.deepEqual(countrySettingsLines("SE", before, after), [
    "Monthly pay request: off → on",
    "Monthly pay request, day of the month: 1 → 5",
    `Monthly pay request, payment link: none → ${LINK}`,
    "Monthly pay request, smallest amount: none → 100 kr",
  ]);
  assert.deepEqual(countrySettingsLines("SE", after, after), []);
});

test("pay request: the server's refusals and every text in sv / fr / en; the setting has its 'i' text", () => {
  const refuse = (reason: string) => new ApiError(400, "server words", { code: "invalid_request", reason });
  for (const lang of ["en", "sv", "fr"] as const) {
    setLanguage(lang);
    for (const reason of ["pay_request_needs_link", "pay_request_needs_amount", "pay_request_invalid"]) {
      const text = errorText(refuse(reason));
      assert.ok(text && text !== "server words", `${lang} ${reason}`);
    }
  }
  setLanguage("sv");
  assert.equal(errorText(refuse("pay_request_needs_link")), "Ange betalningslänken för att slå på den månatliga betalningsförfrågan.");
  setLanguage("fr");
  assert.equal(errorText(refuse("pay_request_needs_link")), "Indiquez le lien de paiement pour activer la demande de paiement mensuelle.");
  setLanguage("en");
  const area = (lang: string) => readFileSync(new URL(`../i18n/${lang}/c47-pay-request.ts`, import.meta.url), "utf8");
  const keys = (text: string) => [...text.matchAll(/^ {2}("(?:[^"\\]|\\.)*"): /gm)].map((m) => JSON.parse(m[1]!) as string);
  assert.ok(keys(area("en")).length >= 20);
  assert.deepEqual(keys(area("sv")), keys(area("en")));
  assert.deepEqual(keys(area("fr")), keys(area("en")));
  for (const key of keys(area("en"))) {
    assert.notEqual((sv as Record<string, string>)[key], key, `sv: ${key}`);
    assert.notEqual((fr as Record<string, string>)[key], key, `fr: ${key}`);
    assert.equal((en as Record<string, string>)[key], key);
  }
  assert.ok(readFileSync(new URL("../ui/settingInfo/tips.ts", import.meta.url), "utf8").includes('"tips.driverPayRequest": t('), "the 'i' text exists");
  const panel = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
  assert.ok(panel.includes('data-testid="driver-pay-request"') && panel.includes('<SettingInfo id="tips.driverPayRequest" />'), "the card with its 'i'");
  assert.ok(/data-testid="driver-pay-request"[\s\S]{0,400}disabled=\{!canEdit \|\| !onStandard\}/.test(panel), "country Standard only");
});
